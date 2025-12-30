import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.status !== "APPROVED") {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const taskId = params.id;
  
  // Only allow downloading own tasks (or admin can download any)
  const [task] = session.user.isAdmin
    ? await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    : await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id)))
        .limit(1);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "completed" || !task.result) {
    return NextResponse.json({ error: "Task is not completed yet" }, { status: 400 });
  }

  const result = task.result as string;

  const safeName = (task.fileName || "transcript")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/gi, "_")
    .replace(/_+/g, "_");

  const textContent = typeof result === "string" ? result : JSON.stringify(result);

  return new NextResponse(textContent, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.txt"`,
    },
  });
}
