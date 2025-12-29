import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { TranscriptTask } from "@/types/transcription";
import { isSupportedFormat } from "@/lib/transcribe";
import { logWithTs, logErrorWithTs } from "@/lib/logger";
import fs from "fs";
import path from "path";

// Upload directory for pending tasks
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/uploads";

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
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

    // Save file to upload directory for Python poller
    // Include file extension so ffmpeg knows the format
    const fileExt = path.extname(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(UPLOAD_DIR, `${taskId}${fileExt}`);
    await fs.promises.writeFile(filePath, buffer);
    
    logWithTs(`📁 Saved file for task ${taskId}: ${file.name}`);

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
