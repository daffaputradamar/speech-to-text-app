import { NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { TranscriptTask } from "@/types/transcription";
import { isSupportedFormat, saveToTempFile } from "@/lib/gemini";
import { transcriptionQueue } from "@/lib/queue";
import { logWithTs, logErrorWithTs } from "@/lib/logger";

export async function GET() {
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const all = await db
    .select()
    .from(tasks)
    .orderBy(desc(tasks.createdAt));

  return NextResponse.json(all);
}

export async function POST(req: Request) {
  try {
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("audio") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    if (!isSupportedFormat(file.name)) {
      return NextResponse.json(
        { error: "Unsupported file format. Supported: MP3, WAV, AIFF, AAC, OGG, FLAC, M4A, WEBM" },
        { status: 400 }
      );
    }

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 500MB." },
        { status: 400 }
      );
    }

    const [inserted] = await db
      .insert(tasks)
      .values({
        fileName: file.name,
        fileSize: file.size,
        status: "pending",
        progress: 0,
      })
      .returning();

    const buffer = Buffer.from(await file.arrayBuffer());
    const tempPath = await saveToTempFile(buffer, file.name);

    logWithTs(`📝 Enqueuing transcription for task ${inserted.id}`);
    try {
      const job = await transcriptionQueue.add("transcribe", {
        taskId: inserted.id,
        filePath: tempPath,
        fileName: file.name,
      });
      logWithTs(`✅ Job ${job.id} enqueued for task ${inserted.id}`);
    } catch (error) {
      logErrorWithTs(`❌ Failed to enqueue job for task ${inserted.id}:`, error);
      await fs.promises.unlink(tempPath).catch(() => {});
      await db
        .update(tasks)
        .set({ status: "failed", error: "Failed to enqueue transcription", updatedAt: new Date() })
        .where(eq(tasks.id, inserted.id));
      throw error;
    }

    const newTask: TranscriptTask = {
      id: inserted.id,
      fileName: inserted.fileName,
      fileSize: inserted.fileSize,
      status: "pending",
      progress: inserted.progress,
      createdAt: inserted.createdAt,
      result: inserted.result as string ?? undefined,
      error: inserted.error ?? undefined,
    };

    return NextResponse.json(newTask);
  } catch (error) {
    logErrorWithTs("Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("id");

    if (!taskId) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 }
      );
    }

    const deleted = await db
      .delete(tasks)
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
