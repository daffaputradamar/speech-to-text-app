import { NextResponse } from "next/server";
import { transcribeAudio, isSupportedFormat } from "@/lib/gemini";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logWithTs, logErrorWithTs } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 1800; // 30 minutes for long-running transcription

export async function POST(req: Request) {
  let taskId: string | null = null;

  try {
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("audio") as File | null;
    taskId = formData.get("taskId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    if (!taskId) {
      return NextResponse.json(
        { error: "No task ID provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!isSupportedFormat(file.name)) {
      await db
        .update(tasks)
        .set({
          status: "failed",
          error: "Unsupported file format. Supported: MP3, WAV, AIFF, AAC, OGG, FLAC, M4A, WEBM",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));
      return NextResponse.json(
        { error: "Unsupported file format" },
        { status: 400 }
      );
    }

    // Check file size (max 500MB)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      await db
        .update(tasks)
        .set({
          status: "failed",
          error: "File too large. Maximum size is 500MB.",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));
      return NextResponse.json(
        { error: "File too large. Maximum size is 500MB." },
        { status: 400 }
      );
    }

    // Update task status to processing
    await db
      .update(tasks)
      .set({ status: "processing", progress: 10, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Update progress
    await db
      .update(tasks)
      .set({ progress: 30, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    // Transcribe the audio
    logWithTs(`🎤 Starting transcription for task ${taskId}...`);
    const result = await transcribeAudio(buffer, file.name);

    // Update task with result
    await db
      .update(tasks)
      .set({
        status: "completed",
        progress: 100,
        result: result,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    logWithTs(`✅ Transcription complete for task ${taskId}`);

    return NextResponse.json({
      success: true,
      taskId,
      result,
    });
  } catch (error) {
    logErrorWithTs("Transcription error:", error);

    if (taskId) {
      if (db) {
        await db
          .update(tasks)
          .set({
            status: "failed",
            error: error instanceof Error ? error.message : "Transcription failed",
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId));
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
