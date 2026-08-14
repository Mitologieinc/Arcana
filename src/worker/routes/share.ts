import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import * as schema from "../db/schema";
import { getSessionUser } from "../auth";
import { canEdit, resolvePagePermission } from "../lib/acl";
import type { AppEnv } from "../types";

export const shareRoutes = new Hono<AppEnv>();

shareRoutes.get("/api/pages/:id/acl", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(db, { pageId: id, userId: user.id });
  if (!canEdit(permission)) return c.json({ error: "閲覧できません" }, 403);
  const acls = await db.select().from(schema.pageAcl).where(eq(schema.pageAcl.pageId, id));
  const links = await db.select().from(schema.shareLinks).where(eq(schema.shareLinks.pageId, id));
  return c.json({ acls, links, permission });
});

shareRoutes.put("/api/pages/:id/acl", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(db, { pageId: id, userId: user.id });
  if (permission !== "full") return c.json({ error: "権限を変更できません" }, 403);
  const body = await c.req.json<{
    acls: { principalType: "user" | "workspace"; principalId?: string | null; permission: schema.Permission }[];
  }>();
  await db.delete(schema.pageAcl).where(eq(schema.pageAcl.pageId, id));
  const allowedPerm: schema.Permission[] = ["full", "edit", "view", "none"];
  for (const acl of body.acls) {
    if (acl.principalType !== "user" && acl.principalType !== "workspace") continue;
    if (!allowedPerm.includes(acl.permission)) continue;
    await db.insert(schema.pageAcl).values({
      id: crypto.randomUUID(),
      pageId: id,
      principalType: acl.principalType,
      principalId: acl.principalId ?? null,
      permission: acl.permission,
    });
  }
  return c.json({ ok: true });
});

shareRoutes.post("/api/pages/:id/share-links", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const { permission } = await resolvePagePermission(db, { pageId: id, userId: user.id });
  if (!canEdit(permission)) return c.json({ error: "共有できません" }, 403);
  const body = await c.req.json<{ permission?: schema.Permission }>();
  const perm = body.permission === "edit" ? "edit" : "view";
  const token = crypto.randomUUID().replaceAll("-", "");
  await db.insert(schema.shareLinks).values({
    id: crypto.randomUUID(),
    pageId: id,
    token,
    permission: perm,
    createdAt: new Date(),
  });
  const origin = new URL(c.req.url).origin;
  return c.json({ token, url: `${origin}/share/${token}`, permission: perm });
});

shareRoutes.delete("/api/share-links/:id", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const linkId = c.req.param("id");
  const links = await db.select().from(schema.shareLinks).where(eq(schema.shareLinks.id, linkId)).limit(1);
  const link = links[0];
  if (!link) return c.json({ error: "見つかりません" }, 404);
  const { permission } = await resolvePagePermission(db, { pageId: link.pageId, userId: user.id });
  if (permission !== "full") return c.json({ error: "削除できません" }, 403);
  await db.delete(schema.shareLinks).where(eq(schema.shareLinks.id, linkId));
  return c.json({ ok: true });
});

shareRoutes.get("/api/share/:token", async (c) => {
  const db = createDb(c.env.DB);
  const token = c.req.param("token");
  const links = await db.select().from(schema.shareLinks).where(eq(schema.shareLinks.token, token)).limit(1);
  const link = links[0];
  if (!link || (link.expiresAt && link.expiresAt.getTime() < Date.now())) {
    return c.json({ error: "リンクが無効です" }, 404);
  }
  const page = await db.select().from(schema.pages).where(eq(schema.pages.id, link.pageId)).limit(1);
  return c.json({ page: page[0], permission: link.permission, token });
});
