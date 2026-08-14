import { Hono } from "hono";
import { hc } from "hono/client";
import { YDurableObjects, type YDurableObjectsAppType } from "y-durableobjects";
import { upgrade } from "y-durableobjects/helpers/upgrade";
import { createAuth, getSessionUser } from "./auth";
import { createDb } from "./db/client";
import { canView, resolvePagePermission } from "./lib/acl";
import { workspaceRoutes } from "./routes/workspace";
import { pageRoutes } from "./routes/pages";
import { shareRoutes } from "./routes/share";
import { searchRoutes } from "./routes/search";
import { fileRoutes } from "./routes/files";
import type { AppEnv } from "./types";

export class PageRoom extends YDurableObjects<AppEnv> {}

const app = new Hono<AppEnv>();

app.get("/api/health", (c) =>
  c.json({ ok: true, name: "arcana", seatBilling: false }),
);

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, c.req.raw);
  return auth.handler(c.req.raw);
});

app.route("/", workspaceRoutes);
app.route("/", pageRoutes);
app.route("/", shareRoutes);
app.route("/", searchRoutes);
app.route("/", fileRoutes);

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
