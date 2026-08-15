import { eq, inArray } from "drizzle-orm";
import { createDb } from "../db/client";
import * as schema from "../db/schema";

type Db = ReturnType<typeof createDb>;

export async function collectSubtreeIds(db: Db, rootId: string) {
  const ids = [rootId];
  const queue = [rootId];
  const seen = new Set([rootId]);
  while (queue.length) {
    const parentId = queue.pop()!;
    const kids = await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.parentId, parentId));
    for (const kid of kids) {
      if (seen.has(kid.id)) continue;
      seen.add(kid.id);
      ids.push(kid.id);
      queue.push(kid.id);
    }
  }
  return ids;
}

export async function dropSearch(env: { DB: D1Database }, ids: string[]) {
  for (const id of ids) {
    await env.DB.prepare("DELETE FROM page_search WHERE page_id = ?").bind(id).run();
  }
}

export async function putSearch(env: { DB: D1Database }, pageId: string, title: string, bodyText: string) {
  await env.DB.prepare("DELETE FROM page_search WHERE page_id = ?").bind(pageId).run();
  await env.DB.prepare("INSERT INTO page_search (page_id, title, body_text) VALUES (?, ?, ?)")
    .bind(pageId, title, bodyText)
    .run();
}

export async function archiveSubtree(db: Db, env: { DB: D1Database }, rootId: string) {
  const ids = await collectSubtreeIds(db, rootId);
  const now = new Date();
  await db.update(schema.pages).set({ archivedAt: now, updatedAt: now }).where(inArray(schema.pages.id, ids));
  await dropSearch(env, ids);
  return ids;
}

export async function restoreSubtree(
  db: Db,
  env: { DB: D1Database; Y_DURABLE_OBJECTS: DurableObjectNamespace },
  rootId: string,
) {
  const ids = await collectSubtreeIds(db, rootId);
  const now = new Date();
  await db.update(schema.pages).set({ archivedAt: null, updatedAt: now }).where(inArray(schema.pages.id, ids));
  const rows = await db.select().from(schema.pages).where(inArray(schema.pages.id, ids));
  for (const page of rows) {
    let bodyText = "";
    try {
      const stub = env.Y_DURABLE_OBJECTS.get(env.Y_DURABLE_OBJECTS.idFromName(page.id));
      bodyText = await stub.exportText();
    } catch {
      bodyText = "";
    }
    await putSearch(env, page.id, page.title, bodyText);
  }
  return ids;
}

export async function purgeSubtree(
  db: Db,
  env: { DB: D1Database; FILES: R2Bucket; Y_DURABLE_OBJECTS: DurableObjectNamespace },
  rootId: string,
) {
  const ids = await collectSubtreeIds(db, rootId);
  const rows = ids.length
    ? await db.select().from(schema.pages).where(inArray(schema.pages.id, ids))
    : [];
  for (const page of rows) {
    const ws = page.workspaceId;
    if (page.coverR2Key && !page.coverR2Key.startsWith("preset:")) {
      await env.FILES.delete(`${ws}/${page.coverR2Key}`).catch(() => undefined);
    }
    if (page.icon?.startsWith("file:")) {
      await env.FILES.delete(`${ws}/${page.icon.slice(5)}`).catch(() => undefined);
    }
    try {
      const stub = env.Y_DURABLE_OBJECTS.get(env.Y_DURABLE_OBJECTS.idFromName(page.id));
      await stub.wipe();
    } catch {
      /* already gone */
    }
  }
  if (ids.length) {
    await db.delete(schema.comments).where(inArray(schema.comments.pageId, ids));
    await db.delete(schema.favorites).where(inArray(schema.favorites.pageId, ids));
    await db.delete(schema.pageRevisions).where(inArray(schema.pageRevisions.pageId, ids));
    await db.delete(schema.notifications).where(inArray(schema.notifications.pageId, ids));
    await dropSearch(env, ids);
  }
  await db.delete(schema.pages).where(eq(schema.pages.id, rootId));
  return ids;
}
