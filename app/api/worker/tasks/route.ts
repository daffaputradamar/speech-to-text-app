import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/uploads";

// Worker API Key for authentication (set in environment)
const WORKER_API_KEY = process.env.WORKER_API_KEY;

function validateWorkerAuth(req: Request): boolean {
  if (!WORKER_API_KEY) return true; // No auth if key not set
  const authHeader = req.headers.get("Authorization");
  return authHeader === `Bearer ${WORKER_API_KEY}`;
}

/**
 * GET /api/worker/tasks
 * Fetch and claim a pending task for processing
 */
export async function GET(req: Request) {
  if (!validateWorkerAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    // Use raw SQL for atomic claim with FOR UPDATE SKIP LOCKED
    const result = await db.execute<{
      id: string;
      file_name: string;
      file_size: number;
      status: string;
    }>(`
      UPDATE tasks 
      SET status = 'processing', 
          progress = 10,
          updated_at = NOW()
      WHERE id = (
        SELECT id FROM tasks 
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, file_name, file_size, status
    `);

    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json({ task: null });
    }

    const task = result.rows[0];
    return NextResponse.json({ task });
  } catch (error) {
    console.error("Error fetching pending task:", error);
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

/**
 * PATCH /api/worker/tasks
 * Update task progress/status
 */
export async function PATCH(req: Request) {
  if (!validateWorkerAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { taskId, status, progress, result, error } = body;

    if (!taskId) {
      return NextResponse.json({ error: "Task ID required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (status !== undefined) updateData.status = status;
    if (progress !== undefined) updateData.progress = progress;
    if (result !== undefined) updateData.result = result;
    if (error !== undefined) updateData.error = error;

    await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
