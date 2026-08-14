import { Hono } from "hono";
import { hc } from "hono/client";
import { YDurableObjects, type YDurableObjectsAppType } from "y-durableobjects";
import { upgrade } from "y-durableobjects/helpers/upgrade";
import { createAuth, getSessionUser } from "./auth";
import { createDb } from "./db/client";
import * as schema from "./db/schema";
import { eq } from "drizzle-orm";
import { canView, resolvePagePermission } from "./lib/acl";
import { workspaceRoutes } from "./routes/workspace";
import { pageRoutes } from "./routes/pages";
import { shareRoutes } from "./routes/share";
import { searchRoutes } from "./routes/search";
import { fileRoutes } from "./routes/files";
import { extraRoutes } from "./routes/extras";
import type { AppEnv } from "./types";

export class PageRoom extends YDurableObjects<AppEnv> {}

const app = new Hono<AppEnv>();

app.get("/api/health", (c) =>
  c.json({ ok: true, name: "arcana", seatBilling: false }),
);

function isOpenApi(path: string, method: string) {
  if (path === "/api/health" || path === "/api/bootstrap") return true;
  if (path === "/api/register" || path === "/api/setup") return true;
  if (path.startsWith("/api/auth")) return true;
  if (path === "/api/me") return true;
  if (path.startsWith("/api/verify-email")) return true;
  if (path.startsWith("/api/share")) return true;
  if (method === "GET" && /^\/api\/invites\/[^/]+$/.test(path)) return true;
  if (method === "POST" && /^\/api\/invites\/[^/]+\/accept$/.test(path)) return true;
  return false;
}

app.use("/api/*", async (c, next) => {
  if (isOpenApi(c.req.path, c.req.method)) return next();
  const user = await getSessionUser(c.env, c.req.raw);
  if (user && user.emailVerified === false) {
    const db = createDb(c.env.DB);
    const row = await db
      .select({ emailVerified: schema.user.emailVerified })
      .from(schema.user)
      .where(eq(schema.user.id, user.id))
      .limit(1);
    if (!row[0]?.emailVerified) {
      return c.json({ error: "メールを確認してください", needsVerification: true }, 403);
    }
  }
  return next();
});

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, c.req.raw);
  return auth.handler(c.req.raw);
});

app.route("/", workspaceRoutes);
app.route("/", pageRoutes);
app.route("/", shareRoutes);
app.route("/", searchRoutes);
app.route("/", fileRoutes);

app.route("/", extraRoutes);

app.get("/api/collab/:id", upgrade(), async (c) => {
  const pageId = c.req.param("id");
  const user = await getSessionUser(c.env, c.req.raw);
  const token = new URL(c.req.url).searchParams.get("token");
  const db = createDb(c.env.DB);
  const { permission } = await resolvePagePermission(db, {
    pageId,
    userId: user?.id,
    shareToken: token,
  });
  if (!canView(permission)) {
    return c.json({ error: "接続できません" }, 403);
  }

  const stub = c.env.Y_DURABLE_OBJECTS.get(c.env.Y_DURABLE_OBJECTS.idFromName(pageId));
  const client = hc<YDurableObjectsAppType>(new URL("/", c.req.url).toString(), {
    fetch: stub.fetch.bind(stub),
  });
  const res = await client.rooms[":roomId"].$get(
    { param: { roomId: pageId } },
    { init: { headers: c.req.raw.headers } },
  );
  return new Response(null, {
    webSocket: res.webSocket,
    status: res.status,
    statusText: res.statusText,
  });
});

export default app;
