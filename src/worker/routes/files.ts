import { Hono } from "hono";
import { getMembership, getSessionUser } from "../auth";
import { createDb } from "../db/client";
import type { AppEnv } from "../types";

export const fileRoutes = new Hono<AppEnv>();

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

  const id = crypto.randomUUID();
  const key = `${membership.workspaceId}/${id}`;
  await c.env.FILES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { filename: file.name, uploadedBy: user.id },
  });
  return c.json({ id, url: `/api/files/${id}`, key });
});

fileRoutes.get("/api/files/:id", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  const token = c.req.query("token");
  if (!user && !token) return c.json({ error: "未ログイン" }, 401);

  const id = c.req.param("id");
  const db = createDb(c.env.DB);
  const membership = user ? await getMembership(db, user.id) : null;
  const key = membership ? `${membership.workspaceId}/${id}` : id;
  const object = (await c.env.FILES.get(key)) ?? (await c.env.FILES.get(id));
  if (!object) return c.json({ error: "見つかりません" }, 404);

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
});
