import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

import dotenv from "dotenv";
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Drizzle will not connect.");
}

const client = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : undefined;

export const db = client ? drizzle(client, { schema }) : undefined;
export type Database = typeof db;
