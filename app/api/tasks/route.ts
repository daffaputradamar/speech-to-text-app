import { NextResponse } from "next/server"
import { tasksStore, addTask } from "@/lib/store"

export async function GET() {
  return NextResponse.json(tasksStore)
}

export async function POST(req: Request) {
  const { fileName } = await req.json()
  const newTask = {
    id: Math.random().toString(36).substring(7),
    fileName,
    status: "processing" as const,
    progress: 0,
    createdAt: new Date(),
  }
  addTask(newTask)
  return NextResponse.json(newTask)
}
