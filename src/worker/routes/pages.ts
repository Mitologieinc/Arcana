import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { createDb } from "../db/client";
import * as schema from "../db/schema";
import { getMembership, getSessionUser } from "../auth";
import { canEdit, canView, listVisiblePages, resolvePagePermission } from "../lib/acl";
import type { AppEnv } from "../types";
import { DEFAULT_DB_PROPERTIES_JSON } from "./workspace";

export const pageRoutes = new Hono<AppEnv>();

async function context(c: Parameters<Parameters<typeof pageRoutes.use>[1]>[0]) {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return { error: c.json({ error: "未ログイン" }, 401) } as const;
  const db = createDb(c.env.DB);
  const membership = await getMembership(db, user.id);
  if (!membership) return { error: c.json({ error: "ワークスペースがありません" }, 403) } as const;
  return { user, db, membership };
}

pageRoutes.get("/api/pages", async (c) => {
  const ctx = await context(c);
  if ("error" in ctx) return ctx.error;
  const list = await listVisiblePages(ctx.db, ctx.membership.workspaceId, ctx.user.id, ctx.membership.role);
  return c.json({ pages: list });
});

pageRoutes.post("/api/pages", async (c) => {
  const ctx = await context(c);
  if ("error" in ctx) return ctx.error;
  if (ctx.membership.role === "guest") return c.json({ error: "作成権限がありません" }, 403);

  const body = await c.req.json<{
    parentId?: string | null;
    type?: schema.PageType;
    title?: string;
    icon?: string;
    properties?: Record<string, unknown>;
  }>();

  const type = body.type === "database" ? "database" : "page";
  if (body.parentId) {
    const { permission } = await resolvePagePermission(ctx.db, {
      pageId: body.parentId,
      userId: ctx.user.id,
    });
    if (!canEdit(permission)) return c.json({ error: "作成権限がありません" }, 403);
  }

  const siblings = await ctx.db
    .select({ position: schema.pages.position })
    .from(schema.pages)
    .where(
      and(
        eq(schema.pages.workspaceId, ctx.membership.workspaceId),
        body.parentId
          ? eq(schema.pages.parentId, body.parentId)
          : isNull(schema.pages.parentId),
      ),
    );
  const position = siblings.reduce((m, s) => Math.max(m, s.position), 0) + 1;
  const now = new Date();
  const id = crypto.randomUUID();

  await ctx.db.insert(schema.pages).values({
    id,
    workspaceId: ctx.membership.workspaceId,
    parentId: body.parentId ?? null,
    type,
    title: body.title ?? (type === "database" ? "無題のデータベース" : "無題"),
    icon: body.icon ?? (type === "database" ? "🗃️" : "📄"),
    position,
    properties: body.properties ? JSON.stringify(body.properties) : null,
    createdBy: ctx.user.id,
    createdAt: now,
    updatedAt: now,
  });

  if (type === "database") {
    await ctx.db.insert(schema.databaseSchemas).values({
      pageId: id,
      properties: DEFAULT_DB_PROPERTIES_JSON,
    });
    await ctx.db.insert(schema.databaseViews).values({
      id: crypto.randomUUID(),
      pageId: id,
      name: "テーブル",
      type: "table",
      config: JSON.stringify({ filters: [], sorts: [] }),
      position: 1,
    });
    await ctx.db.insert(schema.databaseViews).values({
      id: crypto.randomUUID(),
      pageId: id,
      name: "ボード",
      type: "board",
      config: JSON.stringify({ groupBy: "status", filters: [] }),
      position: 2,
    });
  }

  await c.env.DB.prepare(
    "INSERT INTO page_search (page_id, title, body_text) VALUES (?, ?, ?)",
  )
    .bind(id, body.title ?? "", "")
    .run();

  const created = await ctx.db.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  return c.json({ page: created[0] });
});

pageRoutes.get("/api/pages/:id", async (c) => {
  const shareToken = c.req.query("token") ?? null;
  const user = await getSessionUser(c.env, c.req.raw);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const { permission, workspaceId } = await resolvePagePermission(db, {
    pageId: id,
    userId: user?.id,
    shareToken,
  });
  if (!canView(permission)) return c.json({ error: "閲覧できません" }, 403);

  const pageRows = await db.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  const page = pageRows[0];
  if (!page) return c.json({ error: "見つかりません" }, 404);

  const children = await db
    .select()
    .from(schema.pages)
    .where(and(eq(schema.pages.parentId, id), isNull(schema.pages.archivedAt)));

  let database: { schema: unknown; views: unknown[] } | null = null;
  if (page.type === "database") {
    const sch = await db
      .select()
      .from(schema.databaseSchemas)
      .where(eq(schema.databaseSchemas.pageId, id))
      .limit(1);
    const views = await db
      .select()
      .from(schema.databaseViews)
      .where(eq(schema.databaseViews.pageId, id));
    database = {
      schema: sch[0] ? JSON.parse(sch[0].properties) : [],
      views: views.map((v) => ({ ...v, config: JSON.parse(v.config) })),
    };
  }

  return c.json({ page, children, database, permission, workspaceId });
});

pageRoutes.patch("/api/pages/:id", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(db, { pageId: id, userId: user.id });
  if (!canEdit(permission)) return c.json({ error: "編集できません" }, 403);

  const body = await c.req.json<{
    title?: string;
    icon?: string;
    parentId?: string | null;
    position?: number;
    properties?: Record<string, unknown> | null;
  }>();

  const updates: Partial<typeof schema.pages.$inferInsert> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.icon !== undefined) updates.icon = body.icon;
  if (body.parentId !== undefined) updates.parentId = body.parentId;
  if (body.position !== undefined) updates.position = body.position;
  if (body.properties !== undefined) {
    updates.properties = body.properties ? JSON.stringify(body.properties) : null;
  }

  await db.update(schema.pages).set(updates).where(eq(schema.pages.id, id));

  if (body.title !== undefined) {
    await c.env.DB.prepare(
      "UPDATE page_search SET title = ? WHERE page_id = ?",
    )
      .bind(body.title, id)
      .run();
  }

  const page = await db.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  return c.json({ page: page[0] });
});

pageRoutes.delete("/api/pages/:id", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(db, { pageId: id, userId: user.id });
  if (permission !== "full") return c.json({ error: "削除できません" }, 403);
  await db.update(schema.pages).set({ archivedAt: new Date() }).where(eq(schema.pages.id, id));
  await c.env.DB.prepare("DELETE FROM page_search WHERE page_id = ?").bind(id).run();
  return c.json({ ok: true });
});

pageRoutes.put("/api/pages/:id/schema", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(db, { pageId: id, userId: user.id });
  if (!canEdit(permission)) return c.json({ error: "編集できません" }, 403);
  const body = await c.req.json<{ properties: unknown }>();
  await db
    .update(schema.databaseSchemas)
    .set({ properties: JSON.stringify(body.properties) })
    .where(eq(schema.databaseSchemas.pageId, id));
  return c.json({ ok: true });
});

pageRoutes.patch("/api/views/:id", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const viewId = c.req.param("id");
  const views = await db.select().from(schema.databaseViews).where(eq(schema.databaseViews.id, viewId)).limit(1);
  const view = views[0];
  if (!view) return c.json({ error: "見つかりません" }, 404);
  const { permission } = await resolvePagePermission(db, { pageId: view.pageId, userId: user.id });
  if (!canEdit(permission)) return c.json({ error: "編集できません" }, 403);
  const body = await c.req.json<{ name?: string; config?: unknown }>();
  await db
    .update(schema.databaseViews)
    .set({
      ...(body.name ? { name: body.name } : {}),
      ...(body.config ? { config: JSON.stringify(body.config) } : {}),
    })
    .where(eq(schema.databaseViews.id, viewId));
  return c.json({ ok: true });
});
