import { Hono } from "hono";
import { and, asc, eq, isNull } from "drizzle-orm";
import { createDb } from "../db/client";
import * as schema from "../db/schema";
import { getMembership, getSessionUser } from "../auth";
import { canEdit, canView, listVisiblePages, resolvePagePermission } from "../lib/acl";
import { applySchemaChange, mergePageProperties } from "../lib/db-props";
import { archiveSubtree } from "../lib/page-tree";
import { normalizeTipTapDoc, plainTextFromDoc, tiptapJsonToUpdate } from "../lib/ydoc-import";
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
    templateId?: string;
  }>();

  const type = body.type === "database" || body.type === "canvas" ? body.type : "page";
  let template: typeof schema.pageTemplates.$inferSelect | null = null;
  if (body.templateId) {
    if (type !== "page") return c.json({ error: "ページ以外にはテンプレートを使えません" }, 400);
    const rows = await ctx.db
      .select()
      .from(schema.pageTemplates)
      .where(
        and(
          eq(schema.pageTemplates.id, body.templateId),
          eq(schema.pageTemplates.workspaceId, ctx.membership.workspaceId),
        ),
      )
      .limit(1);
    if (!rows[0]) return c.json({ error: "テンプレートが見つかりません" }, 404);
    template = rows[0];
  }
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
  const title =
    body.title ??
    template?.title ??
    (type === "database" ? "無題のデータベース" : type === "canvas" ? "無題のキャンバス" : "無題");
  const icon =
    body.icon ?? template?.icon ?? (type === "database" ? "🗃️" : type === "canvas" ? "🎨" : "📄");

  await ctx.db.insert(schema.pages).values({
    id,
    workspaceId: ctx.membership.workspaceId,
    parentId: body.parentId ?? null,
    type,
    title,
    icon,
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

  let bodyText = "";
  if (template) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(template.bodyJson) as unknown;
    } catch {
      parsed = null;
    }
    const doc = normalizeTipTapDoc(parsed);
    if (doc) {
      const stub = c.env.Y_DURABLE_OBJECTS.get(c.env.Y_DURABLE_OBJECTS.idFromName(id));
      await stub.importYjs(tiptapJsonToUpdate(doc));
      bodyText = plainTextFromDoc(doc);
    }
  }

  await c.env.DB.prepare(
    "INSERT INTO page_search (page_id, title, body_text) VALUES (?, ?, ?)",
  )
    .bind(id, title, bodyText)
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

  const childRows = await db
    .select()
    .from(schema.pages)
    .where(and(eq(schema.pages.parentId, id), isNull(schema.pages.archivedAt)))
    .orderBy(asc(schema.pages.position));
  const children = [];
  for (const child of childRows) {
    const childPerm = await resolvePagePermission(db, {
      pageId: child.id,
      userId: user?.id,
      shareToken,
    });
    if (canView(childPerm.permission)) children.push(child);
  }

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

  let parentDatabase: { schema: unknown } | null = null;
  if (page.parentId) {
    const parents = await db.select().from(schema.pages).where(eq(schema.pages.id, page.parentId)).limit(1);
    const parent = parents[0];
    if (parent?.type === "database") {
      const sch = await db
        .select()
        .from(schema.databaseSchemas)
        .where(eq(schema.databaseSchemas.pageId, parent.id))
        .limit(1);
      parentDatabase = { schema: sch[0] ? JSON.parse(sch[0].properties) : [] };
    }
  }

  const ancestors: typeof page[] = [];
  let parentId = page.parentId;
  const seen = new Set<string>([page.id]);
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parents = await db.select().from(schema.pages).where(eq(schema.pages.id, parentId)).limit(1);
    const parent = parents[0];
    if (!parent || parent.archivedAt) break;
    const parentPerm = await resolvePagePermission(db, {
      pageId: parent.id,
      userId: user?.id,
      shareToken,
    });
    if (!canView(parentPerm.permission)) break;
    ancestors.unshift(parent);
    parentId = parent.parentId;
  }

  return c.json({ page, children, database, parentDatabase, permission, workspaceId, ancestors });
});

pageRoutes.patch("/api/pages/:id", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const { permission, workspaceId } = await resolvePagePermission(db, { pageId: id, userId: user.id });
  if (!canEdit(permission)) return c.json({ error: "編集できません" }, 403);

  const body = await c.req.json<{
    title?: string;
    icon?: string;
    parentId?: string | null;
    position?: number;
    properties?: Record<string, unknown> | null;
    coverR2Key?: string | null;
    ifUpdatedAt?: string | number;
  }>();

  const current = await db.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  if (!current[0]) return c.json({ error: "見つかりません" }, 404);

  if (body.ifUpdatedAt != null) {
    const incoming = new Date(body.ifUpdatedAt).getTime();
    const stored =
      current[0].updatedAt instanceof Date
        ? current[0].updatedAt.getTime()
        : new Date(current[0].updatedAt as unknown as string).getTime();
    if (Number.isFinite(incoming) && Number.isFinite(stored) && incoming !== stored) {
      return c.json({ error: "他の人が先に更新しました", conflict: true }, 409);
    }
  }

  const updates: Partial<typeof schema.pages.$inferInsert> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.icon !== undefined) updates.icon = body.icon;
  if (body.position !== undefined) updates.position = body.position;
  if (body.properties !== undefined) {
    updates.properties = mergePageProperties(current[0].properties, body.properties);
  }
  if (body.parentId !== undefined) {
    if (body.parentId === null) {
      updates.parentId = null;
    } else {
      const parents = await db.select().from(schema.pages).where(eq(schema.pages.id, body.parentId)).limit(1);
      const parent = parents[0];
      if (!parent || parent.workspaceId !== workspaceId) {
        return c.json({ error: "移動先が不正です" }, 400);
      }
      updates.parentId = body.parentId;
    }
  }
  if (body.coverR2Key !== undefined) {
    const cover = body.coverR2Key;
    const ok =
      cover === null ||
      cover.startsWith("preset:") ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cover);
    if (!ok) return c.json({ error: "カバーが不正です" }, 400);
    updates.coverR2Key = cover;
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
  await archiveSubtree(db, c.env, id);
  return c.json({ ok: true });
});

pageRoutes.post("/api/pages/:id/body", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(db, { pageId: id, userId: user.id });
  if (!canEdit(permission)) return c.json({ error: "編集できません" }, 403);
  const body = await c.req.json<{ doc: unknown; text?: string }>();
  if (!body.doc || typeof body.doc !== "object") return c.json({ error: "本文がありません" }, 400);
  const update = tiptapJsonToUpdate(body.doc);
  const stub = c.env.Y_DURABLE_OBJECTS.get(c.env.Y_DURABLE_OBJECTS.idFromName(id));
  await stub.importYjs(update);
  const text = body.text ?? plainTextFromDoc(body.doc);
  const pageRows = await db.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  const title = pageRows[0]?.title ?? "";
  await c.env.DB.prepare("DELETE FROM page_search WHERE page_id = ?").bind(id).run();
  await c.env.DB.prepare("INSERT INTO page_search (page_id, title, body_text) VALUES (?, ?, ?)").bind(id, title, text).run();
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
  const applied = await applySchemaChange(db, id, body.properties);
  return c.json({ ok: true, properties: applied.properties });
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
