import fs from "fs";
import { Worker } from "bullmq";
import { transcribeAudio } from "@/lib/gemini";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { connection } from "@/lib/queue";
import { eq } from "drizzle-orm";
import { logWithTs, logErrorWithTs } from "@/lib/logger";

interface TranscriptionJobData {
  taskId: string;
  filePath: string;
  fileName: string;
}

if (!db) {
  throw new Error("Database not configured");
}

logWithTs("🚀 Transcription worker starting...");

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5", 10);
logWithTs(`⚙️ Worker concurrency: ${CONCURRENCY}`);

const worker = new Worker<TranscriptionJobData>(
  "transcriptions",
  async (job) => {
    const { taskId, filePath, fileName } = job.data;
    logWithTs(`▶️ Processing job ${job.id} for task ${taskId}`);

    // Mark task as processing
    await db!
      .update(tasks)
      .set({ status: "processing", progress: 20, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    const buffer = await fs.promises.readFile(filePath);

    try {
      const result = await transcribeAudio(buffer, fileName);

      await db!
        .update(tasks)
        .set({
          status: "completed",
          progress: 100,
          result,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      logWithTs(`✅ Completed task ${taskId}`);
    } catch (error) {
      logErrorWithTs(`❌ Failed task ${taskId}:`, error);
      await db!
        .update(tasks)
        .set({
          status: "failed",
          progress: 0,
          error: error instanceof Error ? error.message : "Transcription failed",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));
      throw error;
    } finally {
      // Clean up temp file
      try {
        await fs.promises.unlink(filePath);
      } catch (err) {
        logErrorWithTs(`Failed to delete temp file ${filePath}:`, err);
      }
    }
  },
  { connection, concurrency: CONCURRENCY }
);

worker.on("completed", (job) => {
  logWithTs(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  logErrorWithTs(`Job ${job?.id} failed:`, err);
});

worker.on("error", (err) => {
  logErrorWithTs("Worker error:", err);
});

process.on("SIGINT", async () => {
  logWithTs("Gracefully shutting down worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});
