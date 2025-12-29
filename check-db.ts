import { db } from "@/server/db";
import { sql } from "drizzle-orm";

try {
  const result = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'access_token'
  `);

  if (result.length === 0) {
    console.log("access_token column not found, adding it...");
    await db.execute(sql`
      ALTER TABLE sessions ADD COLUMN access_token text NOT NULL DEFAULT ''
    `);
    console.log("Column added successfully!");
  } else {
    console.log("access_token column already exists");
  }
} catch (error) {
  console.error("Error:", error);
}

process.exit(0);
