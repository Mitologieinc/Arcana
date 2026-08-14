import { Hono } from "hono";
import { hc } from "hono/client";
import { YDurableObjects, type YDurableObjectsAppType } from "y-durableobjects";
import { upgrade } from "y-durableobjects/helpers/upgrade";
import { applyUpdate, encodeStateAsUpdate } from "yjs";
import { createAuth, getSessionUser } from "./auth";
import { createDb } from "./db/client";
import { canEdit, canView, resolvePagePermission } from "./lib/acl";
import { workspaceRoutes } from "./routes/workspace";
import { pageRoutes } from "./routes/pages";
import { shareRoutes } from "./routes/share";
import { searchRoutes } from "./routes/search";
import { fileRoutes } from "./routes/files";
import { extraRoutes } from "./routes/extras";
import { importRoutes } from "./routes/import";
import { allowAttempt, clientIp } from "./lib/rate-limit";
import type { AppEnv } from "./types";

export class PageRoom extends YDurableObjects<AppEnv> {
  private pendingReadOnly = false;

  fetch(request: Request) {
    this.pendingReadOnly = request.headers.get("X-Arcana-Collab") === "read";
    return super.fetch(request);
  }

  protected createRoom(roomId: string) {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({
      roomId,
      connectedAt: new Date(),
      readOnly: this.pendingReadOnly,
    });
    this.state.acceptWebSocket(server);
    this.registerWebSocket(server);
    return client;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const meta = ws.deserializeAttachment() as { readOnly?: boolean } | undefined;
    if (meta?.readOnly) {
      if (!(message instanceof ArrayBuffer)) return;
      const bytes = new Uint8Array(message);
      const sync = 0;
      const awareness = 1;
      const step1 = 0;
      const allowed =
        (bytes.length >= 2 && bytes[0] === sync && bytes[1] === step1) ||
        (bytes.length >= 1 && bytes[0] === awareness);
      if (!allowed) return;
    }
    return super.webSocketMessage(ws, message);
  }

  async importYjs(update: Uint8Array) {
    applyUpdate(this.doc, update);
    await this.storage.storeUpdate(update);
  }

  async replaceYjs(update: Uint8Array) {
    const xml = this.doc.getXmlFragment("prosemirror");
    if (xml.length > 0) xml.delete(0, xml.length);
    applyUpdate(this.doc, update);
    await this.storage.storeUpdate(encodeStateAsUpdate(this.doc));
  }
}

const app = new Hono<AppEnv>();

app.use("/api/*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin && origin !== new URL(c.req.url).origin && c.req.method !== "GET" && c.req.method !== "HEAD") {
    return c.json({ error: "不正なリクエストです" }, 403);
  }
  await next();
  if (c.res.webSocket) return;
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

app.use("/api/auth/*", async (c, next) => {
  if (c.req.method === "POST" && !allowAttempt(`auth:${clientIp(c.req.raw)}`, 30, 10 * 60 * 1000)) {
    return c.json({ error: "少し待ってからやり直してください" }, 429);
  }
  return next();
});

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

app.route("/", extraRoutes);
app.route("/", importRoutes);

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

  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Arcana-Collab", canEdit(permission) ? "write" : "read");

  const stub = c.env.Y_DURABLE_OBJECTS.get(c.env.Y_DURABLE_OBJECTS.idFromName(pageId));
  const client = hc<YDurableObjectsAppType>(new URL("/", c.req.url).toString(), {
    fetch: stub.fetch.bind(stub),
  });
  const res = await client.rooms[":roomId"].$get(
    { param: { roomId: pageId } },
    { init: { headers } },
  );
  return new Response(null, {
    webSocket: res.webSocket,
    status: res.status,
    statusText: res.statusText,
  });
});

export default app;
