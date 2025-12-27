import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { TranscriptTask } from "@/types/transcription";

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

    const [inserted] = await db
      .insert(tasks)
      .values({
        fileName: file.name,
        fileSize: file.size,
        status: "uploading",
        progress: 0,
      })
      .returning();

    const newTask: TranscriptTask = {
      id: inserted.id,
      fileName: inserted.fileName,
      fileSize: inserted.fileSize,
      status: inserted.status,
      progress: inserted.progress,
      createdAt: inserted.createdAt,
      result: inserted.result ?? undefined,
      error: inserted.error ?? undefined,
    };

    // Start transcription in the background
    // We need to forward the file to the transcribe endpoint
    const transcribeFormData = new FormData();
    transcribeFormData.append("audio", file);
    transcribeFormData.append("taskId", inserted.id);

    // Fire and forget - don't await this
    fetch(new URL("/api/transcribe", req.url).toString(), {
      method: "POST",
      body: transcribeFormData,
    }).catch((error) => {
      console.error("Failed to start transcription:", error);
    });

    return NextResponse.json(newTask);
  } catch (error) {
    console.error("Error creating task:", error);
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
