/**
 * In-memory store for transcription tasks
 * In production, you would use a proper database
 */
import type { TranscriptTask, TranscriptionResult, TranscriptStatus } from "@/types/transcription";

// Using a global variable that persists across hot-reloads in development
const globalForStore = global as unknown as { tasks: TranscriptTask[] };
export const tasksStore: TranscriptTask[] = globalForStore.tasks || [];

if (process.env.NODE_ENV !== "production") globalForStore.tasks = tasksStore;

/**
 * Generate a unique task ID
 */
export function generateTaskId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Add a new task to the store
 */
export function addTask(task: TranscriptTask): void {
  tasksStore.unshift(task);
}

/**
 * Get a task by ID
 */
export function getTask(id: string): TranscriptTask | undefined {
  return tasksStore.find((t) => t.id === id);
}

/**
 * Update an existing task
 */
export function updateTask(
  id: string,
  updates: Partial<Pick<TranscriptTask, "status" | "progress" | "result" | "error">>
): boolean {
  const taskIndex = tasksStore.findIndex((t) => t.id === id);
  if (taskIndex === -1) return false;

  tasksStore[taskIndex] = {
    ...tasksStore[taskIndex],
    ...updates,
  };
  return true;
}

/**
 * Delete a task by ID
 */
export function deleteTask(id: string): boolean {
  const taskIndex = tasksStore.findIndex((t) => t.id === id);
  if (taskIndex === -1) return false;

  tasksStore.splice(taskIndex, 1);
  return true;
}

/**
 * Get all tasks
 */
export function getAllTasks(): TranscriptTask[] {
  return tasksStore;
}
