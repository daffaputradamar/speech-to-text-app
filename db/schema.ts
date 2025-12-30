import { pgTable, uuid, text, integer, bigint, timestamp, jsonb, pgEnum, varchar, boolean, index } from "drizzle-orm/pg-core";

// ============================================
// ENUMS
// ============================================

export const userStatusEnum = pgEnum("user_status", ["PENDING", "APPROVED", "REJECTED"]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "uploading",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

// ============================================
// USERS TABLE (synced from portal API)
// ============================================

export const users = pgTable(
  "users",
  {
    id: varchar("id").primaryKey(), // Keycloak sub
    npk: varchar("npk", { length: 50 }),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    status: userStatusEnum("status").default("APPROVED").notNull(),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_users_email").on(table.email),
    index("idx_users_npk").on(table.npk),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ============================================
// TASKS TABLE
// ============================================

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileName: text("file_name").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  status: taskStatusEnum("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  result: text("result"),
  error: text("error"),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
},
(table) => [
  index("idx_tasks_user_id").on(table.userId),
]);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
