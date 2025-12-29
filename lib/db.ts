import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

import dotenv from "dotenv";
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Drizzle will not connect.");
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  : undefined;

export const db = pool ? drizzle(pool, { schema }) : undefined;
export type Database = typeof db;
