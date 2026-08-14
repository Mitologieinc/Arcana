import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { getMembership, getSessionUser } from "../auth";
import { createDb } from "../db/client";
import * as schema from "../db/schema";
import { canEdit, canView, resolvePagePermission } from "../lib/acl";
import type { AppEnv } from "../types";

export const searchRoutes = new Hono<AppEnv>();

searchRoutes.get("/api/search", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const membership = await getMembership(db, user.id);
  if (!membership) return c.json({ error: "ワークスペースがありません" }, 403);

  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ results: [] });

  const like = `%${q.replaceAll("%", "").replaceAll("_", "")}%`;
  const ftsQuery = `"${q.replaceAll('"', "")}"`;
  let fts: { id: string; title: string; icon: string | null; type: string; snippet: string }[] = [];
  try {
    const ran = await c.env.DB.prepare(
      `SELECT p.id, p.title, p.icon, p.type, snippet(page_search, 2, '', '', '…', 12) AS snippet
       FROM page_search
       JOIN pages p ON p.id = page_search.page_id
       WHERE p.workspace_id = ? AND p.archived_at IS NULL
         AND page_search MATCH ?
       LIMIT 30`,
    )
      .bind(membership.workspaceId, ftsQuery)
      .all<{ id: string; title: string; icon: string | null; type: string; snippet: string }>();
    fts = ran.results;
  } catch {
    fts = [];
  }

  const fallback = await c.env.DB.prepare(
    `SELECT id, title, icon, type, '' AS snippet FROM pages
     WHERE workspace_id = ? AND archived_at IS NULL AND title LIKE ?
     LIMIT 30`,
  )
    .bind(membership.workspaceId, like)
    .all<{ id: string; title: string; icon: string | null; type: string; snippet: string }>();

  const seen = new Set(fts.map((r) => r.id));
  const combined = [...fts, ...fallback.results.filter((r) => !seen.has(r.id))];
  const results = [];
  for (const row of combined) {
    const { permission } = await resolvePagePermission(db, { pageId: row.id, userId: user.id });
    if (canView(permission)) results.push(row);
  }
  return c.json({ results });
});

searchRoutes.post("/api/pages/:id/index", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(db, { pageId: id, userId: user.id });
  if (!canEdit(permission)) return c.json({ error: "編集できません" }, 403);
  const body = await c.req.json<{ title?: string; bodyText?: string }>();
  await c.env.DB.prepare("DELETE FROM page_search WHERE page_id = ?").bind(id).run();
  await c.env.DB.prepare(
    "INSERT INTO page_search (page_id, title, body_text) VALUES (?, ?, ?)",
  )
    .bind(id, body.title ?? "", body.bodyText ?? "")
    .run();

  const last = await db
    .select()
    .from(schema.pageRevisions)
    .where(eq(schema.pageRevisions.pageId, id))
    .orderBy(desc(schema.pageRevisions.createdAt))
    .limit(1);
  const nextBody = body.bodyText ?? "";
  const nextTitle = body.title ?? "";
  if (!last[0] || last[0].bodyText !== nextBody || last[0].title !== nextTitle) {
    await db.insert(schema.pageRevisions).values({
      id: crypto.randomUUID(),
      pageId: id,
      title: nextTitle,
      bodyText: nextBody,
      createdBy: user.id,
      createdAt: new Date(),
    });
  }
  return c.json({ ok: true });
});
