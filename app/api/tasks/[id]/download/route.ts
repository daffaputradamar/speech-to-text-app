import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TranscriptionResult } from "@/types/transcription";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const taskId = params.id;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "completed" || !task.result) {
    return NextResponse.json({ error: "Task is not completed yet" }, { status: 400 });
  }

  const result = task.result as TranscriptionResult;

  const safeName = (task.fileName || "transcript")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/gi, "_")
    .replace(/_+/g, "_");

  const lines: string[] = [];
  lines.push(`Summary: ${result.summary}`);
  lines.push("");
  lines.push("Transcript:");

  for (const segment of result.segments) {
    const translation = segment.translation && segment.language_code !== "en"
      ? ` | translation: ${segment.translation}`
      : "";
    lines.push(
      `[${segment.timestamp}] ${segment.speaker}: ${segment.content} | lang: ${segment.language}${translation}`
    );
  }

  const textContent = lines.join("\n");

  return new NextResponse(textContent, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.txt"`,
    },
  });
}
