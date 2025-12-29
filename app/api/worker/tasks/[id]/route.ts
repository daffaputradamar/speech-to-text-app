import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";

const WORKER_API_KEY = process.env.WORKER_API_KEY;

function validateWorkerAuth(req: Request): boolean {
  if (!WORKER_API_KEY) return true;
  const authHeader = req.headers.get("Authorization");
  return authHeader === `Bearer ${WORKER_API_KEY}`;
}

/**
 * GET /api/worker/tasks/[id]
 * Get task status (for checking cancellation)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateWorkerAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const { id } = await params;
    
    const result = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, id));

    if (result.length === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ status: result[0].status });
  } catch (error) {
    console.error("Error fetching task status:", error);
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}
