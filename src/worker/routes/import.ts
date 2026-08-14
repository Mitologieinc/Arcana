import { Hono } from "hono";
import type { Context } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { getMembership, getSessionUser } from "../auth";
import { createDb } from "../db/client";
import * as schema from "../db/schema";
import { canEdit, resolvePagePermission } from "../lib/acl";
import {
  loadNestedBlocks,
  notionBlockChildren,
  notionComments,
  notionDatabase,
  notionPage,
  notionQueryDatabase,
  notionRelationPageIds,
  notionSearchPage,
  notionWhoAmI,
  richPlain,
} from "../lib/notion";
import {
  blocksToDoc,
  mapDatabaseSchema,
  mapRowProperties,
  notionFileUrl,
  remapRelationSchema,
  remapRelationValues,
} from "../lib/notion-convert";
import { allowAttempt, clientIp } from "../lib/rate-limit";
import { plainTextFromDoc, tiptapJsonToUpdate } from "../lib/ydoc-import";
import { isAllowedFileType, isImageType } from "../lib/files";
import type { AppEnv } from "../types";

export const importRoutes = new Hono<AppEnv>();

async function importer(c: Context<AppEnv>) {
  if (!allowAttempt(`import:${clientIp(c.req.raw)}`, 80, 10 * 60 * 1000)) {
    return { error: c.json({ error: "少し待ってからやり直してください" }, 429) } as const;
  }
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return { error: c.json({ error: "未ログイン" }, 401) } as const;
  const db = createDb(c.env.DB);
  const membership = await getMembership(db, user.id);
  if (!membership) return { error: c.json({ error: "ワークスペースがありません" }, 403) } as const;
  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: c.json({ error: "取り込む権限がありません" }, 403) } as const;
  }
  return { user, db, membership };
}

function readToken(body: { token?: string }) {
  const token = body.token?.trim() ?? "";
  if (!token.startsWith("secret_") && !token.startsWith("ntn_")) {
    throw new Error("Notion の Internal Integration Secret を貼ってください");
  }
  return token;
}

async function canCreateUnder(
  ctx: Exclude<Awaited<ReturnType<typeof importer>>, { error: Response }>,
  parentId: string | null | undefined,
) {
  if (!parentId) return true;
  const { permission } = await resolvePagePermission(ctx.db, {
    pageId: parentId,
    userId: ctx.user.id,
  });
  return canEdit(permission);
}

async function nextPosition(db: ReturnType<typeof createDb>, workspaceId: string, parentId: string | null) {
  const siblings = await db
    .select({ position: schema.pages.position })
    .from(schema.pages)
    .where(
      and(
        eq(schema.pages.workspaceId, workspaceId),
        parentId ? eq(schema.pages.parentId, parentId) : isNull(schema.pages.parentId),
      ),
    );
  return siblings.reduce((m, s) => Math.max(m, s.position), 0) + 1;
}

async function insertPage(
  env: Env,
  db: ReturnType<typeof createDb>,
  input: {
    workspaceId: string;
    parentId: string | null;
    userId: string;
    type: "page" | "database";
    title: string;
    icon: string;
    properties?: Record<string, unknown> | null;
  },
) {
  const now = new Date();
  const id = crypto.randomUUID();
  const position = await nextPosition(db, input.workspaceId, input.parentId);
  await db.insert(schema.pages).values({
    id,
    workspaceId: input.workspaceId,
    parentId: input.parentId,
    type: input.type,
    title: input.title,
    icon: input.icon,
    position,
    properties: input.properties ? JSON.stringify(input.properties) : null,
    createdBy: input.userId,
    createdAt: now,
    updatedAt: now,
  });
  if (input.type === "database") {
    await db.insert(schema.databaseSchemas).values({ pageId: id, properties: "[]" });
    await db.insert(schema.databaseViews).values({
      id: crypto.randomUUID(),
      pageId: id,
      name: "テーブル",
      type: "table",
      config: JSON.stringify({ filters: [], sorts: [] }),
      position: 1,
    });
    await db.insert(schema.databaseViews).values({
      id: crypto.randomUUID(),
      pageId: id,
      name: "ボード",
      type: "board",
      config: JSON.stringify({ groupBy: "status", filters: [] }),
      position: 2,
    });
  }
  await env.DB.prepare("INSERT INTO page_search (page_id, title, body_text) VALUES (?, ?, ?)").bind(id, input.title, "").run();
  return id;
}

async function writeBody(env: Env, db: ReturnType<typeof createDb>, pageId: string, doc: unknown) {
  const update = tiptapJsonToUpdate(doc);
  const stub = env.Y_DURABLE_OBJECTS.get(env.Y_DURABLE_OBJECTS.idFromName(pageId));
  await stub.importYjs(update);
  const pageRows = await db.select().from(schema.pages).where(eq(schema.pages.id, pageId)).limit(1);
  const title = pageRows[0]?.title ?? "";
  const text = plainTextFromDoc(doc);
  await env.DB.prepare("DELETE FROM page_search WHERE page_id = ?").bind(pageId).run();
  await env.DB.prepare("INSERT INTO page_search (page_id, title, body_text) VALUES (?, ?, ?)").bind(pageId, title, text).run();
}

async function saveAsset(env: Env, workspaceId: string, userId: string, url: string) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const type = (res.headers.get("content-type") || "").split(";")[0].trim();
  if (!isAllowedFileType(type)) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 15 * 1024 * 1024) return null;
  const id = crypto.randomUUID();
  const name = url.split("/").pop()?.split("?")[0] || "file";
  await env.FILES.put(`${workspaceId}/${id}`, buf, {
    httpMetadata: { contentType: type },
    customMetadata: { uploadedBy: userId, imported: "notion", filename: name },
  });
  return { src: `/api/files/${id}`, type, name, id };
}

async function applyCover(
  env: Env,
  db: ReturnType<typeof createDb>,
  workspaceId: string,
  userId: string,
  pageId: string,
  cover: unknown,
) {
  const url = notionFileUrl(cover);
  if (!url) return;
  const asset = await saveAsset(env, workspaceId, userId, url);
  if (asset && isImageType(asset.type)) {
    await db.update(schema.pages).set({ coverR2Key: asset.id }).where(eq(schema.pages.id, pageId));
  }
}

async function resolveIcon(
  env: Env,
  workspaceId: string,
  userId: string,
  icon: { type?: string; emoji?: string } | null | undefined,
  fallback: string,
) {
  if (icon?.type === "emoji" && icon.emoji) return icon.emoji;
  const url = notionFileUrl(icon);
  if (!url) return fallback;
  const asset = await saveAsset(env, workspaceId, userId, url);
  if (asset && isImageType(asset.type)) return `file:${asset.id}`;
  return fallback;
}

importRoutes.post("/api/import/notion/whoami", async (c) => {
  const ctx = await importer(c);
  if ("error" in ctx) return ctx.error;
  try {
    const token = readToken(await c.req.json<{ token?: string }>());
    const who = await notionWhoAmI(token);
    return c.json(who);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "接続できませんでした" }, 400);
  }
});

importRoutes.post("/api/import/notion/search", async (c) => {
  const ctx = await importer(c);
  if ("error" in ctx) return ctx.error;
  try {
    const body = await c.req.json<{ token?: string; cursor?: string | null }>();
    const data = await notionSearchPage(readToken(body), body.cursor);
    return c.json(data);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "検索できませんでした" }, 400);
  }
});

importRoutes.post("/api/import/notion/root", async (c) => {
  const ctx = await importer(c);
  if ("error" in ctx) return ctx.error;
  const id = await insertPage(c.env, ctx.db, {
    workspaceId: ctx.membership.workspaceId,
    parentId: null,
    userId: ctx.user.id,
    type: "page",
    title: "Notion から",
    icon: "📦",
  });
  return c.json({ id });
});

importRoutes.post("/api/import/notion/database", async (c) => {
  const ctx = await importer(c);
  if ("error" in ctx) return ctx.error;
  try {
    const body = await c.req.json<{ token?: string; notionId: string; parentId?: string | null }>();
    const token = readToken(body);
    if (!(await canCreateUnder(ctx, body.parentId))) return c.json({ error: "作成権限がありません" }, 403);
    const dbObj = await notionDatabase(token, body.notionId);
    const title = Array.isArray(dbObj.title) ? richPlain(dbObj.title) : "無題のデータベース";
    const icon = await resolveIcon(c.env, ctx.membership.workspaceId, ctx.user.id, dbObj.icon as { type?: string; emoji?: string }, "🗃️");
    const { properties, keyMap } = mapDatabaseSchema((dbObj.properties as Record<string, unknown>) ?? {});
    const id = await insertPage(c.env, ctx.db, {
      workspaceId: ctx.membership.workspaceId,
      parentId: body.parentId ?? null,
      userId: ctx.user.id,
      type: "database",
      title: title || "無題のデータベース",
      icon,
    });
    await ctx.db.update(schema.databaseSchemas).set({ properties: JSON.stringify(properties) }).where(eq(schema.databaseSchemas.pageId, id));
    await applyCover(c.env, ctx.db, ctx.membership.workspaceId, ctx.user.id, id, dbObj.cover);
    const group = properties.find((p) => p.type === "status") ?? properties.find((p) => p.type === "select");
    const views = await ctx.db.select().from(schema.databaseViews).where(eq(schema.databaseViews.pageId, id));
    const board = views.find((v) => v.type === "board");
    if (board && group) {
      await ctx.db
        .update(schema.databaseViews)
        .set({ config: JSON.stringify({ groupBy: group.id, filters: [], sorts: [] }) })
        .where(eq(schema.databaseViews.id, board.id));
    } else if (board && views.length > 1) {
      await ctx.db.delete(schema.databaseViews).where(eq(schema.databaseViews.id, board.id));
    }
    return c.json({ id, keyMap, properties });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "データベースを取り込みできませんでした" }, 400);
  }
});

importRoutes.post("/api/import/notion/rows", async (c) => {
  const ctx = await importer(c);
  if ("error" in ctx) return ctx.error;
  try {
    const body = await c.req.json<{
      token?: string;
      notionId: string;
      databaseId: string;
      cursor?: string | null;
      keyMap: Record<string, string>;
    }>();
    const token = readToken(body);
    const { permission } = await resolvePagePermission(ctx.db, {
      pageId: body.databaseId,
      userId: ctx.user.id,
    });
    if (!canEdit(permission)) return c.json({ error: "作成権限がありません" }, 403);
    const schemaRows = await ctx.db.select().from(schema.databaseSchemas).where(eq(schema.databaseSchemas.pageId, body.databaseId)).limit(1);
    const dbSchema = schemaRows[0] ? (JSON.parse(schemaRows[0].properties) as Parameters<typeof mapRowProperties>[2]) : [];
    const page = await notionQueryDatabase(token, body.notionId, body.cursor);
    const created: { notionId: string; id: string }[] = [];
    for (const row of page.results) {
      if (row.object !== "page" || row.archived) continue;
      const props = (row.properties as Record<string, unknown>) ?? {};
      const mapped = mapRowProperties(props, body.keyMap, dbSchema);
      for (const [name, raw] of Object.entries(props)) {
        const p = raw as { id?: string; type?: string; has_more?: boolean };
        if (p.type !== "relation" || !p.has_more || !p.id) continue;
        const key = body.keyMap[p.id] || body.keyMap[name];
        if (!key) continue;
        mapped.values[key] = await notionRelationPageIds(token, String(row.id), p.id);
      }
      const icon = await resolveIcon(c.env, ctx.membership.workspaceId, ctx.user.id, row.icon as { type?: string; emoji?: string }, "📄");
      const id = await insertPage(c.env, ctx.db, {
        workspaceId: ctx.membership.workspaceId,
        parentId: body.databaseId,
        userId: ctx.user.id,
        type: "page",
        title: mapped.title,
        icon,
        properties: mapped.values,
      });
      created.push({ notionId: String(row.id), id });
      await applyCover(c.env, ctx.db, ctx.membership.workspaceId, ctx.user.id, id, row.cover);
    }
    return c.json({ created, next_cursor: page.next_cursor, has_more: page.has_more });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "行を取り込みできませんでした" }, 400);
  }
});

importRoutes.post("/api/import/notion/relink", async (c) => {
  const ctx = await importer(c);
  if ("error" in ctx) return ctx.error;
  try {
    const body = await c.req.json<{ databaseId: string; idMap?: Record<string, string> }>();
    const { permission } = await resolvePagePermission(ctx.db, {
      pageId: body.databaseId,
      userId: ctx.user.id,
    });
    if (!canEdit(permission)) return c.json({ error: "編集できません" }, 403);
    const idMap = body.idMap ?? {};
    const schemaRows = await ctx.db.select().from(schema.databaseSchemas).where(eq(schema.databaseSchemas.pageId, body.databaseId)).limit(1);
    const dbSchema = schemaRows[0] ? (JSON.parse(schemaRows[0].properties) as Parameters<typeof remapRelationSchema>[0]) : [];
    const remappedSchema = remapRelationSchema(dbSchema, idMap);
    if (schemaRows[0]) {
      await ctx.db
        .update(schema.databaseSchemas)
        .set({ properties: JSON.stringify(remappedSchema) })
        .where(eq(schema.databaseSchemas.pageId, body.databaseId));
    }
    const rows = await ctx.db.select().from(schema.pages).where(eq(schema.pages.parentId, body.databaseId));
    let updated = 0;
    for (const row of rows) {
      let values: Record<string, unknown> = {};
      if (row.properties) {
        try {
          values = JSON.parse(row.properties) as Record<string, unknown>;
        } catch {
          values = {};
        }
      }
      const next = remapRelationValues(values, remappedSchema, idMap);
      if (JSON.stringify(next) === JSON.stringify(values)) continue;
      await ctx.db
        .update(schema.pages)
        .set({ properties: JSON.stringify(next), updatedAt: new Date() })
        .where(eq(schema.pages.id, row.id));
      updated += 1;
    }
    return c.json({ ok: true, updated });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "リレーションを繋げませんでした" }, 400);
  }
});

importRoutes.post("/api/import/notion/page", async (c) => {
  const ctx = await importer(c);
  if ("error" in ctx) return ctx.error;
  try {
    const body = await c.req.json<{ token?: string; notionId: string; parentId?: string | null }>();
    const token = readToken(body);
    if (!(await canCreateUnder(ctx, body.parentId))) return c.json({ error: "作成権限がありません" }, 403);
    const page = await notionPage(token, body.notionId);
    const props = (page.properties as Record<string, { type?: string; title?: unknown }>) ?? {};
    const titleProp = Object.values(props).find((p) => p.type === "title");
    const title = richPlain(titleProp?.title) || "無題";
    const icon = await resolveIcon(c.env, ctx.membership.workspaceId, ctx.user.id, page.icon as { type?: string; emoji?: string }, "📄");
    const id = await insertPage(c.env, ctx.db, {
      workspaceId: ctx.membership.workspaceId,
      parentId: body.parentId ?? null,
      userId: ctx.user.id,
      type: "page",
      title,
      icon,
    });
    await applyCover(c.env, ctx.db, ctx.membership.workspaceId, ctx.user.id, id, page.cover);
    return c.json({ id });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "ページを取り込みできませんでした" }, 400);
  }
});

importRoutes.post("/api/import/notion/body", async (c) => {
  const ctx = await importer(c);
  if ("error" in ctx) return ctx.error;
  try {
    const body = await c.req.json<{ token?: string; notionId: string; pageId: string; idMap?: Record<string, string> }>();
    const token = readToken(body);
    const { permission } = await resolvePagePermission(ctx.db, {
      pageId: body.pageId,
      userId: ctx.user.id,
    });
    if (!canEdit(permission)) return c.json({ error: "編集できません" }, 403);
    const blocks = await notionBlockChildren(token, body.notionId);
    await loadNestedBlocks(token, blocks);
    const idMap = body.idMap ?? {};
    const doc = await blocksToDoc(blocks, idMap, (url) => saveAsset(c.env, ctx.membership.workspaceId, ctx.user.id, url));
    await writeBody(c.env, ctx.db, body.pageId, doc);
    try {
      const comments = await notionComments(token, body.notionId);
      for (const item of comments) {
        const text = item.body.trim();
        if (!text) continue;
        await ctx.db.insert(schema.comments).values({
          id: crypto.randomUUID(),
          pageId: body.pageId,
          userId: ctx.user.id,
          body: item.author ? `（${item.author}）\n${text}` : text,
          createdAt: item.createdAt,
        });
      }
    } catch {
      /* コメントは権限がなくても本文は残す */
    }
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "本文を取り込みできませんでした" }, 400);
  }
});
