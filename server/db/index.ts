import { env } from "@/lib/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";

const client = postgres(env.DATABASE_URL);
export const db = drizzle(client, { schema });

export async function getUserByEmail(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  return await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, normalizedEmail),
  });
}

export async function getUserById(userId: string) {
  return await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.userId, userId),
  });
}
