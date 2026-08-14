import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getMembership, getSessionUser } from "../auth";
import { createDb } from "../db/client";
import * as schema from "../db/schema";
import type { AppEnv } from "../types";

export const fileRoutes = new Hono<AppEnv>();

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

fileRoutes.post("/api/files", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const membership = await getMembership(db, user.id);
  if (!membership || membership.role === "guest") {
    return c.json({ error: "アップロードできません" }, 403);
  }

  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "ファイルがありません" }, 400);
  if (file.size > 15 * 1024 * 1024) return c.json({ error: "15MBまでです" }, 400);
  const type = file.type || "application/octet-stream";
  if (!IMAGE_TYPES.has(type)) return c.json({ error: "画像（JPEG / PNG / GIF / WebP）だけ送れます" }, 400);

  const id = crypto.randomUUID();
  const key = `${membership.workspaceId}/${id}`;
  await c.env.FILES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: type },
    customMetadata: { filename: file.name, uploadedBy: user.id },
  });
  return c.json({ id, url: `/api/files/${id}`, key });
});

fileRoutes.get("/api/files/:id", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  const token = c.req.query("token");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  let workspaceId: string | null = null;
  if (user) {
    const membership = await getMembership(db, user.id);
    workspaceId = membership?.workspaceId ?? null;
  } else if (token) {
    const links = await db.select().from(schema.shareLinks).where(eq(schema.shareLinks.token, token)).limit(1);
    const link = links[0];
    if (!link || (link.expiresAt && link.expiresAt.getTime() < Date.now())) {
      return c.json({ error: "未ログイン" }, 401);
    }
    const page = await db.select().from(schema.pages).where(eq(schema.pages.id, link.pageId)).limit(1);
    workspaceId = page[0]?.workspaceId ?? null;
  }
  if (!workspaceId) return c.json({ error: "未ログイン" }, 401);

  const object = await c.env.FILES.get(`${workspaceId}/${id}`);
  if (!object) return c.json({ error: "見つかりません" }, 404);

  const type = object.httpMetadata?.contentType || "application/octet-stream";
  const headers = new Headers();
  headers.set("Content-Type", IMAGE_TYPES.has(type) ? type : "application/octet-stream");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "private, max-age=31536000, immutable");
  headers.set("Content-Disposition", "inline");
  return new Response(object.body, { headers });
});
