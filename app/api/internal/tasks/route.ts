import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, users } from "@/db/schema";
import { desc, eq, and, or, inArray } from "drizzle-orm";

/**
 * Internal API endpoint for fetching tasks by user email
 * This is used by other services (like rembugan-ai) to get transcription tasks
 * 
 * Auth: Uses X-Auth-Token header with INTERNAL_API_TOKEN
 */
export async function GET(req: NextRequest) {
  // Validate internal API token
  const authToken = req.headers.get("X-Auth-Token");
  if (!authToken || authToken !== process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const userId = searchParams.get("userId");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const status = searchParams.get("status"); // Filter by status (optional)

  if (!email && !userId) {
    return NextResponse.json(
      { error: "Either email or userId is required" },
      { status: 400 }
    );
  }

  try {
    // Find user by email or userId
    let targetUserId: string | null = userId;
    
    if (email && !userId) {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      
      if (!user) {
        // Return empty array if user not found (they may not have used the app yet)
        return NextResponse.json({ tasks: [] });
      }
      targetUserId = user.id;
    }

    if (!targetUserId) {
      return NextResponse.json({ tasks: [] });
    }

    // Build query
    let query = db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, targetUserId))
      .$dynamic();

    // Add status filter if provided
    if (status) {
      const statusValues = status.split(",").map(s => s.trim());
      // We need to handle single vs multiple statuses
      if (statusValues.length === 1) {
        query = query.where(
          and(
            eq(tasks.userId, targetUserId),
            eq(tasks.status, statusValues[0] as any)
          )
        );
      }
    }

    const userTasks = await query
      .orderBy(desc(tasks.createdAt))
      .limit(limit);

    // Transform to match expected format for rembugan-ai
    const transformedTasks = userTasks.map((task) => ({
      id: task.id,
      fileName: task.fileName,
      fileSize: task.fileSize,
      status: task.status,
      progress: task.progress,
      result: task.result,
      error: task.error,
      userId: task.userId,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }));

    return NextResponse.json({ tasks: transformedTasks });
  } catch (error) {
    console.error("Error fetching internal tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
