import { Hono } from "hono";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { createDb } from "../db/client";
import * as schema from "../db/schema";
import { getMembership, getSessionUser } from "../auth";
import { canEdit, canView, resolvePagePermission } from "../lib/acl";
import { purgeSubtree, restoreSubtree } from "../lib/page-tree";
import { normalizeTipTapDoc, plainTextToDoc, tiptapJsonToUpdate } from "../lib/ydoc-import";
import type { AppEnv } from "../types";

export const extraRoutes = new Hono<AppEnv>();

type ExtraDb = ReturnType<typeof createDb>;

function mentionIdsFrom(
  text: string,
  rawIds: string[] | undefined,
  members: { userId: string; name: string }[],
  actorId: string,
) {
  const byName = [...members].sort((a, b) => b.name.length - a.name.length);
  const fromBody = byName.filter((m) => m.name && text.includes(`@${m.name}`)).map((m) => m.userId);
  const allowed = new Set(members.map((m) => m.userId));
  return [...new Set([...(rawIds ?? []), ...fromBody])].filter((id) => id && id !== actorId && allowed.has(id));
}

async function notifyMentions(
  db: ExtraDb,
  opts: {
    actorId: string;
    actorName: string;
    pageId: string;
    pageTitle: string;
    userIds: string[];
    memberIds: string[];
  },
) {
  const allowed = new Set(opts.memberIds);
  const unique = [...new Set(opts.userIds)].filter((id) => id && id !== opts.actorId && allowed.has(id));
  if (!unique.length) return;
  const recent = await db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.actorId, opts.actorId), eq(schema.notifications.pageId, opts.pageId), eq(schema.notifications.type, "mention")));
  const cutoff = Date.now() - 5 * 60 * 1000;
  const now = new Date();
  for (const userId of unique) {
    const last = recent.find((n) => n.userId === userId);
    const lastAt = last?.createdAt instanceof Date ? last.createdAt.getTime() : Number(last?.createdAt ?? 0);
    if (last && lastAt > cutoff) continue;
    await db.insert(schema.notifications).values({
      id: crypto.randomUUID(),
      userId,
      actorId: opts.actorId,
      pageId: opts.pageId,
      type: "mention",
      body: `${opts.actorName} が「${opts.pageTitle}」であなたをメンションしました`,
      createdAt: now,
    });
  }
}

async function authed(c: Parameters<Parameters<typeof extraRoutes.use>[1]>[0]) {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return { error: c.json({ error: "未ログイン" }, 401) } as const;
  const db = createDb(c.env.DB);
  const membership = await getMembership(db, user.id);
  if (!membership) return { error: c.json({ error: "ワークスペースがありません" }, 403) } as const;
  return { user, db, membership };
}

extraRoutes.get("/api/favorites", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const rows = await ctx.db.select().from(schema.favorites).where(eq(schema.favorites.userId, ctx.user.id));
  const ids = rows.map((r) => r.pageId);
  if (!ids.length) return c.json({ pages: [] });
  const pages = await ctx.db.select().from(schema.pages);
  return c.json({
    pages: pages.filter((p) => ids.includes(p.id) && !p.archivedAt),
  });
});

extraRoutes.put("/api/favorites/:pageId", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const pageId = c.req.param("pageId");
  const { permission } = await resolvePagePermission(ctx.db, { pageId, userId: ctx.user.id });
  if (!canView(permission)) return c.json({ error: "閲覧できません" }, 403);
  const existing = await ctx.db
    .select()
    .from(schema.favorites)
    .where(and(eq(schema.favorites.userId, ctx.user.id), eq(schema.favorites.pageId, pageId)))
    .limit(1);
  if (existing[0]) {
    await ctx.db
      .delete(schema.favorites)
      .where(and(eq(schema.favorites.userId, ctx.user.id), eq(schema.favorites.pageId, pageId)));
    return c.json({ favorited: false });
  }
  await ctx.db.insert(schema.favorites).values({
    userId: ctx.user.id,
    pageId,
    createdAt: new Date(),
  });
  return c.json({ favorited: true });
});

extraRoutes.get("/api/trash", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  if (ctx.membership.role === "guest") return c.json({ error: "ゴミ箱を開けません" }, 403);
  const pages = await ctx.db
    .select()
    .from(schema.pages)
    .where(and(eq(schema.pages.workspaceId, ctx.membership.workspaceId), isNotNull(schema.pages.archivedAt)))
    .orderBy(desc(schema.pages.archivedAt));
  const archived = new Set(pages.map((p) => p.id));
  return c.json({
    pages: pages.filter((p) => !p.parentId || !archived.has(p.parentId)),
  });
});

extraRoutes.post("/api/pages/:id/restore", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(ctx.db, {
    pageId: id,
    userId: ctx.user.id,
    allowArchived: true,
  });
  if (permission !== "full") return c.json({ error: "復元できません" }, 403);
  const rows = await ctx.db.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  const page = rows[0];
  if (!page || page.workspaceId !== ctx.membership.workspaceId) {
    return c.json({ error: "見つかりません" }, 404);
  }
  await restoreSubtree(ctx.db, c.env, id);
  return c.json({ ok: true });
});

extraRoutes.delete("/api/pages/:id/purge", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    return c.json({ error: "完全削除できません" }, 403);
  }
  const id = c.req.param("id");
  const rows = await ctx.db.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  const page = rows[0];
  if (!page || page.workspaceId !== ctx.membership.workspaceId) {
    return c.json({ error: "見つかりません" }, 404);
  }
  await purgeSubtree(ctx.db, c.env, id);
  return c.json({ ok: true });
});

extraRoutes.get("/api/pages/:id/comments", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(ctx.db, { pageId: id, userId: ctx.user.id });
  if (!canView(permission)) return c.json({ error: "閲覧できません" }, 403);
  const rows = await ctx.db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.pageId, id))
    .orderBy(asc(schema.comments.createdAt));
  const users = await ctx.db.select().from(schema.user);
  const byId = new Map(users.map((u) => [u.id, u]));
  return c.json({
    comments: rows.map((r) => ({
      ...r,
      name: byId.get(r.userId)?.name ?? "不明",
    })),
  });
});

extraRoutes.post("/api/pages/:id/comments", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(ctx.db, { pageId: id, userId: ctx.user.id });
  if (!canEdit(permission) && permission !== "view") return c.json({ error: "投稿できません" }, 403);
  if (!canView(permission)) return c.json({ error: "投稿できません" }, 403);
  const bodyJson = await c.req.json<{ body: string; mentionIds?: string[] }>();
  const text = (bodyJson.body ?? "").trim();
  if (!text) return c.json({ error: "本文が空です" }, 400);
  const now = new Date();
  const commentId = crypto.randomUUID();
  await ctx.db.insert(schema.comments).values({
    id: commentId,
    pageId: id,
    userId: ctx.user.id,
    body: text,
    createdAt: now,
  });
  const pageRows = await ctx.db.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  const page = pageRows[0];
  const members = await ctx.db
    .select({
      userId: schema.workspaceMembers.userId,
      name: schema.user.name,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, ctx.membership.workspaceId));
  const mentioned = mentionIdsFrom(text, bodyJson.mentionIds, members, ctx.user.id);
  const targets = mentioned.length ? mentioned : members.map((m) => m.userId).filter((uid) => uid !== ctx.user.id);
  const title = page?.title || "無題";
  for (const userId of targets) {
    await ctx.db.insert(schema.notifications).values({
      id: crypto.randomUUID(),
      userId,
      actorId: ctx.user.id,
      pageId: id,
      type: mentioned.includes(userId) ? "mention" : "comment",
      body: mentioned.includes(userId)
        ? `${ctx.user.name} が「${title}」であなたをメンションしました`
        : `${ctx.user.name} が「${title}」にコメントしました`,
      createdAt: now,
    });
  }
  return c.json({ ok: true, id: commentId });
});

extraRoutes.post("/api/pages/:id/mentions", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(ctx.db, { pageId: id, userId: ctx.user.id });
  if (!canEdit(permission)) return c.json({ error: "編集できません" }, 403);
  const body = await c.req.json<{ userIds?: string[] }>().catch(() => ({ userIds: [] as string[] }));
  const pageRows = await ctx.db.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  const page = pageRows[0];
  if (!page || page.workspaceId !== ctx.membership.workspaceId) {
    return c.json({ error: "見つかりません" }, 404);
  }
  const members = await ctx.db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, ctx.membership.workspaceId));
  await notifyMentions(ctx.db, {
    actorId: ctx.user.id,
    actorName: ctx.user.name,
    pageId: id,
    pageTitle: page.title || "無題",
    userIds: body.userIds ?? [],
    memberIds: members.map((m) => m.userId),
  });
  return c.json({ ok: true });
});

extraRoutes.delete("/api/comments/:id", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const id = c.req.param("id");
  const rows = await ctx.db.select().from(schema.comments).where(eq(schema.comments.id, id)).limit(1);
  const row = rows[0];
  if (!row) return c.json({ error: "見つかりません" }, 404);
  if (row.userId !== ctx.user.id && ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    return c.json({ error: "削除できません" }, 403);
  }
  await ctx.db.delete(schema.comments).where(eq(schema.comments.id, id));
  return c.json({ ok: true });
});

extraRoutes.get("/api/notifications", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const rows = await ctx.db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, ctx.user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(40);
  return c.json({ notifications: rows, unread: rows.filter((r) => !r.readAt).length });
});

extraRoutes.post("/api/notifications/read", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const body = await c.req.json<{ id?: string }>().catch(() => ({} as { id?: string }));
  if (body.id) {
    await ctx.db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.id, body.id), eq(schema.notifications.userId, ctx.user.id)));
  } else {
    await ctx.db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.userId, ctx.user.id), isNull(schema.notifications.readAt)));
  }
  return c.json({ ok: true });
});

extraRoutes.get("/api/pages/:id/revisions", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(ctx.db, { pageId: id, userId: ctx.user.id });
  if (!canView(permission)) return c.json({ error: "閲覧できません" }, 403);
  const rows = await ctx.db
    .select()
    .from(schema.pageRevisions)
    .where(eq(schema.pageRevisions.pageId, id))
    .orderBy(desc(schema.pageRevisions.createdAt))
    .limit(40);
  return c.json({ revisions: rows });
});

extraRoutes.post("/api/pages/:id/revisions/:revId/restore", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const id = c.req.param("id");
  const revId = c.req.param("revId");
  const { permission } = await resolvePagePermission(ctx.db, { pageId: id, userId: ctx.user.id });
  if (!canEdit(permission)) return c.json({ error: "復元できません" }, 403);
  const rows = await ctx.db
    .select()
    .from(schema.pageRevisions)
    .where(and(eq(schema.pageRevisions.id, revId), eq(schema.pageRevisions.pageId, id)))
    .limit(1);
  const rev = rows[0];
  if (!rev) return c.json({ error: "見つかりません" }, 404);
  await ctx.db
    .update(schema.pages)
    .set({ title: rev.title, updatedAt: new Date() })
    .where(eq(schema.pages.id, id));
  let update: Uint8Array | null = null;
  if (rev.bodyJson) {
    try {
      const doc = normalizeTipTapDoc(JSON.parse(rev.bodyJson) as unknown);
      if (doc) update = tiptapJsonToUpdate(doc);
    } catch {
      update = null;
    }
  }
  if (!update) update = tiptapJsonToUpdate(plainTextToDoc(rev.bodyText));
  const stub = c.env.Y_DURABLE_OBJECTS.get(c.env.Y_DURABLE_OBJECTS.idFromName(id));
  await stub.replaceYjs(update);
  await c.env.DB.prepare("DELETE FROM page_search WHERE page_id = ?").bind(id).run();
  await c.env.DB.prepare("INSERT INTO page_search (page_id, title, body_text) VALUES (?, ?, ?)")
    .bind(id, rev.title, rev.bodyText)
    .run();
  return c.json({ ok: true, title: rev.title });
});

extraRoutes.get("/api/pages/:id/export", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(ctx.db, { pageId: id, userId: ctx.user.id });
  if (!canView(permission)) return c.json({ error: "閲覧できません" }, 403);
  const pages = await ctx.db.select().from(schema.pages).where(eq(schema.pages.id, id)).limit(1);
  const page = pages[0];
  if (!page) return c.json({ error: "見つかりません" }, 404);
  const search = await c.env.DB.prepare("SELECT body_text FROM page_search WHERE page_id = ?")
    .bind(id)
    .first<{ body_text: string }>();
  const md = `# ${page.title || "無題"}\n\n${search?.body_text ?? ""}\n`;
  return c.json({ markdown: md, title: page.title || "無題" });
});

extraRoutes.post("/api/pages/:id/views", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(ctx.db, { pageId: id, userId: ctx.user.id });
  if (!canEdit(permission)) return c.json({ error: "編集できません" }, 403);
  const body = await c.req.json<{ name?: string; type?: "table" | "board" | "calendar" | "gallery"; groupBy?: string }>();
  const type = body.type ?? "table";
  const names: Record<string, string> = { table: "テーブル", board: "ボード", calendar: "カレンダー", gallery: "ギャラリー" };
  const existing = await ctx.db.select().from(schema.databaseViews).where(eq(schema.databaseViews.pageId, id));
  const position = existing.reduce((m, v) => Math.max(m, v.position), 0) + 1;
  const sch = await ctx.db.select().from(schema.databaseSchemas).where(eq(schema.databaseSchemas.pageId, id)).limit(1);
  let props: { id: string; type: string; name: string }[] = [];
  try {
    props = sch[0] ? (JSON.parse(sch[0].properties) as { id: string; type: string; name: string }[]) : [];
  } catch {
    props = [];
  }
  let groupBy = body.groupBy;
  if (type === "board") {
    groupBy =
      groupBy ??
      props.find((p) => p.type === "status" || p.id === "status")?.id ??
      props.find((p) => p.type === "select")?.id;
  }
  if (type === "calendar") {
    let date = props.find((p) => p.type === "date");
    if (!date) {
      date = { id: crypto.randomUUID().slice(0, 8), type: "date", name: "日付" };
      props = [...props, date];
      if (sch[0]) {
        await ctx.db
          .update(schema.databaseSchemas)
          .set({ properties: JSON.stringify(props) })
          .where(eq(schema.databaseSchemas.pageId, id));
      }
    }
    groupBy = groupBy ?? date.id;
  }
  const viewId = crypto.randomUUID();
  await ctx.db.insert(schema.databaseViews).values({
    id: viewId,
    pageId: id,
    name: body.name ?? names[type] ?? "ビュー",
    type,
    config: JSON.stringify({ groupBy, filters: [], sorts: [] }),
    position,
  });
  return c.json({ id: viewId });
});

extraRoutes.delete("/api/views/:id", async (c) => {
  const ctx = await authed(c);
  if ("error" in ctx) return ctx.error;
  const viewId = c.req.param("id");
  const views = await ctx.db.select().from(schema.databaseViews).where(eq(schema.databaseViews.id, viewId)).limit(1);
  const view = views[0];
  if (!view) return c.json({ error: "見つかりません" }, 404);
  const { permission } = await resolvePagePermission(ctx.db, { pageId: view.pageId, userId: ctx.user.id });
  if (!canEdit(permission)) return c.json({ error: "削除できません" }, 403);
  const siblings = await ctx.db.select().from(schema.databaseViews).where(eq(schema.databaseViews.pageId, view.pageId));
  if (siblings.length <= 1) return c.json({ error: "最後のビューは削除できません" }, 400);
  await ctx.db.delete(schema.databaseViews).where(eq(schema.databaseViews.id, viewId));
  return c.json({ ok: true });
});
