import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import * as schema from "../db/schema";

export async function hashCredentialPassword(password: string) {
  const { hashPassword } = await import("better-auth/crypto");
  return hashPassword(password);
}

export async function verifyCredentialPassword(hash: string, password: string) {
  const { verifyPassword } = await import("better-auth/crypto");
  return verifyPassword({ hash, password });
}

export async function setCredentialPassword(db: Database, userId: string, password: string) {
  const hashed = await hashCredentialPassword(password);
  const now = new Date();
  const rows = await db
    .select()
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")))
    .limit(1);
  if (rows[0]) {
    await db
      .update(schema.account)
      .set({ password: hashed, updatedAt: now })
      .where(eq(schema.account.id, rows[0].id));
    return;
  }
  await db.insert(schema.account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: hashed,
    createdAt: now,
    updatedAt: now,
  });
}
