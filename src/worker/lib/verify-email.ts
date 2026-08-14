import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import * as schema from "../db/schema";
import { mailReady, sendVerificationMail } from "./mail";

const OTP_TTL_MS = 15 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;

function otpIdentifier(email: string) {
  return `email-otp:${email.trim().toLowerCase()}`;
}

async function hashOtp(secret: string, email: string, code: string) {
  const data = new TextEncoder().encode(`${secret}:${email}:${code}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newCode() {
  return String(100000 + Math.floor(Math.random() * 900000));
}

export async function issueEmailOtp(
  env: Env,
  input: { email: string; mailFrom: string; workspaceName?: string; force?: boolean },
): Promise<{ ok: true } | { ok: false; error: string; status: 400 | 429 | 502 }> {
  if (!mailReady(env, input.mailFrom)) {
    return { ok: false, error: "確認メールの送信元が設定されていません。", status: 400 };
  }
  const email = input.email.trim().toLowerCase();
  const db = createDb(env.DB);
  const identifier = otpIdentifier(email);
  const existing = await db
    .select()
    .from(schema.verification)
    .where(eq(schema.verification.identifier, identifier))
    .limit(1);
  const last = existing[0];
  const lastCreated = last ? (last.createdAt instanceof Date ? last.createdAt.getTime() : Number(last.createdAt)) : 0;
  if (!input.force && last && Date.now() - lastCreated < RESEND_GAP_MS) {
    return { ok: false, error: "少し待ってから再送信してください。", status: 429 };
  }

  const code = newCode();
  const now = new Date();
  const value = await hashOtp(env.BETTER_AUTH_SECRET, email, code);
  await db.delete(schema.verification).where(eq(schema.verification.identifier, identifier));
  await db.insert(schema.verification).values({
    id: crypto.randomUUID(),
    identifier,
    value,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    createdAt: now,
    updatedAt: now,
  });

  const sent = await sendVerificationMail(env, {
    from: input.mailFrom,
    to: email,
    code,
    workspaceName: input.workspaceName,
  });
  if (!sent.ok) return { ok: false, error: sent.error, status: 502 };
  return { ok: true };
}

export async function consumeEmailOtp(env: Env, email: string, code: string) {
  const normalized = email.trim().toLowerCase();
  const trimmed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(trimmed)) return false;
  const db = createDb(env.DB);
  const identifier = otpIdentifier(normalized);
  const rows = await db
    .select()
    .from(schema.verification)
    .where(eq(schema.verification.identifier, identifier))
    .limit(1);
  const row = rows[0];
  if (!row || (row.expiresAt instanceof Date ? row.expiresAt.getTime() : Number(row.expiresAt)) < Date.now()) return false;
  const expected = await hashOtp(env.BETTER_AUTH_SECRET, normalized, trimmed);
  if (expected !== row.value) return false;
  await db.delete(schema.verification).where(eq(schema.verification.identifier, identifier));
  await db
    .update(schema.user)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(schema.user.email, normalized));
  return true;
}

export async function markEmailVerified(env: Env, userId: string) {
  const db = createDb(env.DB);
  await db
    .update(schema.user)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(schema.user.id, userId));
}
