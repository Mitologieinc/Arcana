import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { createDb } from "../db/client";
import * as schema from "../db/schema";
import { getMembership, getSessionUser } from "../auth";
import { normalizeTipTapDoc } from "../lib/ydoc-import";
import type { AppEnv } from "../types";

export const templateRoutes = new Hono<AppEnv>();

const MAX_NAME = 80;
const MAX_TITLE = 200;
const MAX_ICON = 64;
const MAX_BODY = 500_000;

async function authed(c: Parameters<Parameters<typeof templateRoutes.use>[1]>[0]) {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return { error: c.json({ error: "未ログイン" }, 401) } as const;
  const db = createDb(c.env.DB);
  const membership = await getMembership(db, user.id);
  if (!membership) return { error: c.json({ error: "ワークスペースがありません" }, 403) } as const;
  return { user, db, membership };
}

function canManage(role: schema.MemberRole) {
  return role !== "guest";
}

function clip(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toJson(row: typeof schema.pageTemplates.$inferSelect) {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(row.bodyJson) as unknown;
  } catch {
    parsed = null;
  }
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    title: row.title,
    doc: normalizeTipTapDoc(parsed) ?? { type: "doc" as const, content: [] },
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

templateRoutes.get("/api/templates", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const rows = await ctx.db
    .select()
    .from(schema.pageTemplates)
    .where(eq(schema.pageTemplates.workspaceId, ctx.membership.workspaceId))
    .orderBy(desc(schema.pageTemplates.updatedAt));
  return c.json({ templates: rows.map(toJson) });
});

templateRoutes.post("/api/templates", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  if (!canManage(ctx.membership.role)) return c.json({ error: "作成権限がありません" }, 403);

  const body = await c.req.json<{ name?: string; icon?: string | null; title?: string; doc?: unknown }>();
  const name = clip(body.name, MAX_NAME);
  if (!name) return c.json({ error: "名前を入力してください" }, 400);
  const doc = normalizeTipTapDoc(body.doc);
  if (!doc) return c.json({ error: "本文がありません" }, 400);
  const bodyJson = JSON.stringify(doc);
  if (bodyJson.length > MAX_BODY) return c.json({ error: "テンプレートが大きすぎます" }, 400);

  const now = new Date();
  const id = crypto.randomUUID();
  await ctx.db.insert(schema.pageTemplates).values({
    id,
    workspaceId: ctx.membership.workspaceId,
    name,
    icon: clip(body.icon, MAX_ICON) || null,
    title: clip(body.title, MAX_TITLE),
    bodyJson,
    createdBy: ctx.user.id,
    createdAt: now,
    updatedAt: now,
  });
  const rows = await ctx.db.select().from(schema.pageTemplates).where(eq(schema.pageTemplates.id, id)).limit(1);
  return c.json({ template: toJson(rows[0]!) });
});

templateRoutes.patch("/api/templates/:id", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  if (!canManage(ctx.membership.role)) return c.json({ error: "編集権限がありません" }, 403);

  const id = c.req.param("id");
  const existing = await ctx.db
    .select()
    .from(schema.pageTemplates)
    .where(and(eq(schema.pageTemplates.id, id), eq(schema.pageTemplates.workspaceId, ctx.membership.workspaceId)))
    .limit(1);
  if (!existing[0]) return c.json({ error: "見つかりません" }, 404);

  const body = await c.req.json<{ name?: string; icon?: string | null; title?: string; doc?: unknown }>();
  const patch: Partial<typeof schema.pageTemplates.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = clip(body.name, MAX_NAME);
    if (!name) return c.json({ error: "名前を入力してください" }, 400);
    patch.name = name;
  }
  if (body.icon !== undefined) patch.icon = clip(body.icon, MAX_ICON) || null;
  if (body.title !== undefined) patch.title = clip(body.title, MAX_TITLE);
  if (body.doc !== undefined) {
    const doc = normalizeTipTapDoc(body.doc);
    if (!doc) return c.json({ error: "本文がありません" }, 400);
    const bodyJson = JSON.stringify(doc);
    if (bodyJson.length > MAX_BODY) return c.json({ error: "テンプレートが大きすぎます" }, 400);
    patch.bodyJson = bodyJson;
  }

  await ctx.db.update(schema.pageTemplates).set(patch).where(eq(schema.pageTemplates.id, id));
  const rows = await ctx.db.select().from(schema.pageTemplates).where(eq(schema.pageTemplates.id, id)).limit(1);
  return c.json({ template: toJson(rows[0]!) });
});

templateRoutes.delete("/api/templates/:id", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  if (!canManage(ctx.membership.role)) return c.json({ error: "削除権限がありません" }, 403);

  const id = c.req.param("id");
  const existing = await ctx.db
    .select({ id: schema.pageTemplates.id })
    .from(schema.pageTemplates)
    .where(and(eq(schema.pageTemplates.id, id), eq(schema.pageTemplates.workspaceId, ctx.membership.workspaceId)))
    .limit(1);
  if (!existing[0]) return c.json({ error: "見つかりません" }, 404);
  await ctx.db.delete(schema.pageTemplates).where(eq(schema.pageTemplates.id, id));
  return c.json({ ok: true });
});
