import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/uploads";
const WORKER_API_KEY = process.env.WORKER_API_KEY;

function validateWorkerAuth(req: Request): boolean {
  if (!WORKER_API_KEY) return true;
  const authHeader = req.headers.get("Authorization");
  return authHeader === `Bearer ${WORKER_API_KEY}`;
}

function findTaskFile(taskId: string): string | null {
  const extensions = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm', '.aac', '.aiff', ''];
  for (const ext of extensions) {
    const filePath = path.join(UPLOAD_DIR, `${taskId}${ext}`);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * GET /api/worker/tasks/[id]/file
 * Download the audio file for a task
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateWorkerAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const filePath = findTaskFile(id);

    if (!filePath) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Determine content type
    const contentTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
      '.aac': 'audio/aac',
      '.aiff': 'audio/aiff',
    };

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Error downloading file:", error);
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }
}

/**
 * DELETE /api/worker/tasks/[id]/file
 * Delete the audio file after processing
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateWorkerAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const filePath = findTaskFile(id);

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
