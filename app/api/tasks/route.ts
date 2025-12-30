import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { TranscriptTask } from "@/types/transcription";
import { isSupportedFormat } from "@/lib/transcribe";
import { logWithTs, logErrorWithTs } from "@/lib/logger";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Upload directory for pending tasks
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/uploads";
const MAX_DURATION_SECONDS = 5 * 60 * 60; // 5 hours in seconds

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Get audio duration in seconds using ffprobe
 */
function getAudioDuration(filePath: string): number {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: "utf-8" }
    ).trim();
    return parseFloat(output) || 0;
  } catch (error) {
    logErrorWithTs("Error getting audio duration:", error);
    return 0;
  }
}

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
  let taskId: string | null = null;

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
        { error: "Unsupported file format. Supported: MP3, WAV, M4A, FLAC, OGG, WEBM, AAC, AIFF" },
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

    // Save temporarily to check duration
    const fileExt = path.extname(file.name);
    const tempTaskId = `temp_${Date.now()}`;
    const tempFilePath = path.join(UPLOAD_DIR, `${tempTaskId}${fileExt}`);
    const buffer = new Uint8Array(await file.arrayBuffer());
    await fs.promises.writeFile(tempFilePath, buffer);

    // Check audio duration
    const duration = getAudioDuration(tempFilePath);
    if (duration > MAX_DURATION_SECONDS) {
      // Clean up temp file
      fs.unlinkSync(tempFilePath);
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return NextResponse.json(
        { 
          error: `Audio file is too long (${hours}h ${minutes}m). Maximum allowed is 5 hours.`,
          duration: Math.round(duration)
        },
        { status: 400 }
      );
    }

    // Create task in database with 'pending' status
    const [inserted] = await db
      .insert(tasks)
      .values({
        fileName: file.name,
        fileSize: file.size,
        status: "pending",  // Python poller will pick this up
        progress: 0,
      })
      .returning();

    taskId = inserted.id;

    // Move temp file to final location
    const filePath = path.join(UPLOAD_DIR, `${taskId}${fileExt}`);
    fs.renameSync(tempFilePath, filePath);
    
    logWithTs(`📁 Saved file for task ${taskId}: ${file.name} (${Math.round(duration)}s)`);

    const newTask: TranscriptTask = {
      id: inserted.id,
      fileName: inserted.fileName,
      fileSize: inserted.fileSize,
      status: "pending",
      progress: 0,
      createdAt: inserted.createdAt,
    };

    return NextResponse.json(newTask);
  } catch (error) {
    logErrorWithTs("Error creating task:", error);
    
    // Clean up file if it was saved (try with common extensions)
    if (taskId) {
      const extensions = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm', '.aac', '.aiff', ''];
      for (const ext of extensions) {
        const filePath = path.join(UPLOAD_DIR, `${taskId}${ext}`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          break;
        }
      }
      
      // Update task status if we have a taskId
      if (db) {
        await db
          .update(tasks)
          .set({
            status: "failed",
            error: error instanceof Error ? error.message : "Failed to start transcription",
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId));
      }
    }

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

    // Get the task to check its status
    const task = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));

    if (task.length === 0) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    const currentTask = task[0];

    // If task is processing, mark as cancelled instead of deleting
    if (currentTask.status === "processing" || currentTask.status === "pending") {
      await db
        .update(tasks)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));
    } else {
      // For other statuses, actually delete the task
      await db
        .delete(tasks)
        .where(eq(tasks.id, taskId));
    }

    // Clean up file if it exists (try with common extensions)
    const extensions = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm', '.aac', '.aiff', ''];
    for (const ext of extensions) {
      const filePath = path.join(UPLOAD_DIR, `${taskId}${ext}`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        break;
      }
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
