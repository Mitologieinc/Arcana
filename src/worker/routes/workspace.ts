import { Hono } from "hono";
import type { Context } from "hono";
import { and, eq } from "drizzle-orm";
import { createDb } from "../db/client";
import * as schema from "../db/schema";
import { createAuth, getMembership, getSessionUser } from "../auth";
import type { AppEnv } from "../types";
import { emailAllowed, normalizeDomains } from "../lib/access";
import { allowAttempt, clientIp } from "../lib/rate-limit";

const DEFAULT_DB_PROPERTIES = [
  { id: "title", type: "title", name: "名前" },
  {
    id: "status",
    type: "select",
    name: "ステータス",
    options: [
      { id: "todo", name: "未着手", color: "gray" },
      { id: "doing", name: "進行中", color: "blue" },
      { id: "done", name: "完了", color: "green" },
    ],
  },
];

export const workspaceRoutes = new Hono<AppEnv>();

workspaceRoutes.get("/api/bootstrap", async (c) => {
  const db = createDb(c.env.DB);
  const existing = await db.select().from(schema.workspaces).limit(1);
  return c.json({
    needsSetup: existing.length === 0,
    workspaceName: existing[0]?.name ?? null,
    inviteOnly: existing[0]?.inviteOnly ?? false,
    allowedDomains: existing[0]?.allowedDomains ?? "",
    environment: c.env.ENVIRONMENT ?? "local",
  });
});

function parseInviteToken(raw?: string) {
  if (!raw?.trim()) return "";
  const v = raw.trim();
  try {
    const u = new URL(v, "https://arcana.local");
    return u.searchParams.get("invite") ?? v.split("/").filter(Boolean).at(-1) ?? v;
  } catch {
    return v;
  }
}

async function createCredentialUser(
  env: Env,
  request: Request,
  db: ReturnType<typeof createDb>,
  input: { name: string; email: string; password: string },
) {
  const auth = createAuth(env, request);
  const found = await db.select().from(schema.user).where(eq(schema.user.email, input.email)).limit(1);
  let userId = found[0]?.id;
  let cookieResponse: Response;

  if (userId) {
    cookieResponse = await auth.api.signInEmail({
      body: { email: input.email, password: input.password },
      headers: request.headers,
      asResponse: true,
    });
  } else {
    const users = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
    if (users.length > 0) {
      const hashed = await import("better-auth/crypto").then((m) => m.hashPassword(input.password));
      userId = crypto.randomUUID();
      const now = new Date();
      await db.insert(schema.user).values({
        id: userId,
        name: input.name,
        email: input.email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(schema.account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashed,
        createdAt: now,
        updatedAt: now,
      });
      cookieResponse = await auth.api.signInEmail({
        body: { email: input.email, password: input.password },
        headers: request.headers,
        asResponse: true,
      });
    } else {
      cookieResponse = await auth.api.signUpEmail({
        body: { email: input.email, password: input.password, name: input.name },
        headers: request.headers,
        asResponse: true,
      });
    }
  }

  if (!cookieResponse.ok) {
    const err = (await cookieResponse.json().catch(() => ({}))) as { message?: string };
    return { error: err.message || "認証に失敗しました", status: 400 as const };
  }

  const payload = (await cookieResponse.clone().json()) as { user?: { id: string } };
  userId = payload.user?.id ?? userId;
  if (!userId) return { error: "ユーザー作成に失敗しました", status: 500 as const };
  await db.update(schema.user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(schema.user.id, userId));
  return { userId, cookieResponse };
}

async function bootstrapWorkspace(
  env: Env,
  db: ReturnType<typeof createDb>,
  input: { workspaceName: string; userId: string; inviteOnly?: boolean; allowedDomains?: string },
) {
  const now = new Date();
  const workspaceId = crypto.randomUUID();
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    name: input.workspaceName,
    inviteOnly: input.inviteOnly ?? true,
    allowedDomains: normalizeDomains(input.allowedDomains),
    createdAt: now,
  });
  await db.insert(schema.workspaceMembers).values({
    workspaceId,
    userId: input.userId,
    role: "owner",
    createdAt: now,
  });
  const welcomeId = crypto.randomUUID();
  await db.insert(schema.pages).values({
    id: welcomeId,
    workspaceId,
    parentId: null,
    type: "page",
    title: "ようこそ",
    icon: "📖",
    position: 1,
    createdBy: input.userId,
    createdAt: now,
    updatedAt: now,
  });
  await env.DB.prepare("INSERT INTO page_search (page_id, title, body_text) VALUES (?, ?, ?)")
    .bind(welcomeId, "ようこそ", "")
    .run();

  const tasksId = crypto.randomUUID();
  await db.insert(schema.pages).values({
    id: tasksId,
    workspaceId,
    parentId: null,
    type: "database",
    title: "タスク",
    icon: "🗃️",
    position: 2,
    createdBy: input.userId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.databaseSchemas).values({
    pageId: tasksId,
    properties: JSON.stringify(DEFAULT_DB_PROPERTIES),
  });
  await db.insert(schema.databaseViews).values({
    id: crypto.randomUUID(),
    pageId: tasksId,
    name: "テーブル",
    type: "table",
    config: JSON.stringify({ filters: [], sorts: [] }),
    position: 1,
  });
  await db.insert(schema.databaseViews).values({
    id: crypto.randomUUID(),
    pageId: tasksId,
    name: "ボード",
    type: "board",
    config: JSON.stringify({ groupBy: "status", filters: [] }),
    position: 2,
  });
  await env.DB.prepare("INSERT INTO page_search (page_id, title, body_text) VALUES (?, ?, ?)")
    .bind(tasksId, "タスク", "")
    .run();
  return { workspaceId, welcomeId, starterIds: [welcomeId, tasksId] };
}

function withSession(cookieResponse: Response, extra: Record<string, unknown>) {
  const headers = new Headers(cookieResponse.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ ok: true, ...extra }), { status: 200, headers });
}

async function registerHandler(c: Context<AppEnv>) {
  const db = createDb(c.env.DB);
  const body = await c.req.json<{
    name: string;
    email: string;
    password: string;
    workspaceName?: string;
    inviteToken?: string;
    inviteOnly?: boolean;
    allowedDomains?: string;
  }>();

  if (!body.email || !body.password || !body.name) {
    return c.json({ error: "名前、メール、パスワードが必要です" }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: "パスワードは 8 文字以上にしてください" }, 400);
  }
  if (!allowAttempt(`register:${clientIp(c.req.raw)}`, 15, 10 * 60 * 1000)) {
    return c.json({ error: "少し待ってからやり直してください" }, 429);
  }

  const email = body.email.trim().toLowerCase();
  const existingWs = await db.select().from(schema.workspaces).limit(1);

  if (existingWs.length === 0) {
    if (!body.workspaceName?.trim()) {
      return c.json({ error: "ワークスペース名が必要です" }, 400);
    }
    const created = await createCredentialUser(c.env, c.req.raw, db, {
      name: body.name,
      email,
      password: body.password,
    });
    if ("error" in created) return c.json({ error: created.error }, created.status);
    const boot = await bootstrapWorkspace(c.env, db, {
      workspaceName: body.workspaceName.trim(),
      userId: created.userId,
      inviteOnly: body.inviteOnly,
      allowedDomains: body.allowedDomains,
    });
    return withSession(created.cookieResponse, boot);
  }

  const workspace = existingWs[0];
  let workspaceId = workspace.id;
  let role: schema.MemberRole = "member";
  let joinEmail = email;
  let consumedInviteId: string | null = null;
  const token = parseInviteToken(body.inviteToken);

  if (workspace.inviteOnly && !token) {
    return c.json({ error: "招待リンクが必要です" }, 403);
  }

  if (token) {
    const rows = await db.select().from(schema.invites).where(eq(schema.invites.token, token)).limit(1);
    const invite = rows[0];
    if (!invite || invite.expiresAt.getTime() < Date.now()) {
      return c.json({ error: "招待が無効です" }, 404);
    }
    workspaceId = invite.workspaceId;
    role = invite.role;
    joinEmail = invite.email.toLowerCase();
    consumedInviteId = invite.id;
  }

  if (role !== "guest" && !emailAllowed(joinEmail, workspace.allowedDomains)) {
    const domains = workspace.allowedDomains || "指定ドメイン";
    return c.json({ error: `${domains} のメールだけ参加できます` }, 403);
  }

  const created = await createCredentialUser(c.env, c.req.raw, db, {
    name: body.name,
    email: joinEmail,
    password: body.password,
  });
  if ("error" in created) return c.json({ error: created.error }, created.status);

  const already = await db
    .select()
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, created.userId),
      ),
    )
    .limit(1);
  if (already.length === 0) {
    await db.insert(schema.workspaceMembers).values({
      workspaceId,
      userId: created.userId,
      role,
      createdAt: new Date(),
    });
  }
  if (consumedInviteId) {
    await db.delete(schema.invites).where(eq(schema.invites.id, consumedInviteId));
  }

  return withSession(created.cookieResponse, { workspaceId });
}

workspaceRoutes.post("/api/register", registerHandler);
workspaceRoutes.post("/api/setup", registerHandler);

workspaceRoutes.get("/api/me", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ user: null, workspace: null }, 200);
  const db = createDb(c.env.DB);
  const membership = await getMembership(db, user.id);
  if (!membership) return c.json({ user, workspace: null });
  const ws = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, membership.workspaceId))
    .limit(1);
  return c.json({
    user,
    workspace: ws[0] ? { ...ws[0], role: membership.role } : null,
  });
});

workspaceRoutes.get("/api/members", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const membership = await getMembership(db, user.id);
  if (!membership) return c.json({ error: "ワークスペースがありません" }, 403);

  const members = await db
    .select({
      userId: schema.workspaceMembers.userId,
      role: schema.workspaceMembers.role,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, membership.workspaceId));

  const isAdmin = membership.role === "owner" || membership.role === "admin";
  const pending = isAdmin
    ? await db
        .select({
          id: schema.invites.id,
          email: schema.invites.email,
          role: schema.invites.role,
          expiresAt: schema.invites.expiresAt,
          createdAt: schema.invites.createdAt,
        })
        .from(schema.invites)
        .where(eq(schema.invites.workspaceId, membership.workspaceId))
    : [];

  const publicMembers =
    membership.role === "guest" ? members.map((m) => ({ ...m, email: "" })) : members;

  return c.json({ members: publicMembers, invites: pending, seatLimit: null });
});

workspaceRoutes.patch("/api/workspace", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const membership = await getMembership(db, user.id);
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "変更する権限がありません" }, 403);
  }
  const body = await c.req.json<{ name?: string; inviteOnly?: boolean; allowedDomains?: string }>();
  const updates: Partial<typeof schema.workspaces.$inferInsert> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return c.json({ error: "名前が空です" }, 400);
    updates.name = name;
  }
  if (body.inviteOnly !== undefined) updates.inviteOnly = Boolean(body.inviteOnly);
  if (body.allowedDomains !== undefined) updates.allowedDomains = normalizeDomains(body.allowedDomains);
  if (!Object.keys(updates).length) return c.json({ error: "変更がありません" }, 400);
  await db.update(schema.workspaces).set(updates).where(eq(schema.workspaces.id, membership.workspaceId));
  const ws = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, membership.workspaceId)).limit(1);
  return c.json({ workspace: ws[0] ? { ...ws[0], role: membership.role } : null });
});

workspaceRoutes.post("/api/invites", async (c) => {
  const user = await getSessionUser(c.env, c.req.raw);
  if (!user) return c.json({ error: "未ログイン" }, 401);
  const db = createDb(c.env.DB);
  const membership = await getMembership(db, user.id);
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return c.json({ error: "招待する権限がありません" }, 403);
  }

  const body = await c.req.json<{ email: string; role?: schema.MemberRole }>();
  const email = body.email?.trim().toLowerCase();
  if (!email) return c.json({ error: "メールアドレスが必要です" }, 400);
  const role = body.role && ["admin", "member", "guest"].includes(body.role) ? body.role : "member";

  const ws = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, membership.workspaceId))
    .limit(1);
  if (role !== "guest" && ws[0] && !emailAllowed(email, ws[0].allowedDomains)) {
    return c.json({ error: `${ws[0].allowedDomains} のメールだけ招待できます` }, 400);
  }

  const token = crypto.randomUUID().replaceAll("-", "");
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(schema.invites).values({
    id,
    workspaceId: membership.workspaceId,
    email,
    role,
    token,
    expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    createdBy: user.id,
    createdAt: now,
  });

  const origin = new URL(c.req.url).origin;
  return c.json({
    id,
    token,
    url: `${origin}/signup?invite=${token}`,
    email,
    role,
  });
});

workspaceRoutes.get("/api/invites/:token", async (c) => {
  const db = createDb(c.env.DB);
  const token = c.req.param("token");
  const rows = await db.select().from(schema.invites).where(eq(schema.invites.token, token)).limit(1);
  const invite = rows[0];
  if (!invite || invite.expiresAt.getTime() < Date.now()) {
    return c.json({ error: "招待が無効です" }, 404);
  }
  const ws = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, invite.workspaceId))
    .limit(1);
  return c.json({
    email: invite.email,
    role: invite.role,
    workspaceName: ws[0]?.name ?? "",
  });
});

workspaceRoutes.post("/api/invites/:token/accept", async (c) => {
  const db = createDb(c.env.DB);
  const token = c.req.param("token");
  const rows = await db.select().from(schema.invites).where(eq(schema.invites.token, token)).limit(1);
  const invite = rows[0];
  if (!invite || invite.expiresAt.getTime() < Date.now()) {
    return c.json({ error: "招待が無効です" }, 404);
  }

  const body = await c.req.json<{ name: string; password: string; email?: string }>();
  const email = invite.email.trim().toLowerCase();
  if (!body.name || !body.password) {
    return c.json({ error: "名前とパスワードが必要です" }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: "パスワードは 8 文字以上にしてください" }, 400);
  }
  if (!allowAttempt(`invite-accept:${clientIp(c.req.raw)}`, 15, 10 * 60 * 1000)) {
    return c.json({ error: "少し待ってからやり直してください" }, 429);
  }
  const wsRow = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, invite.workspaceId)).limit(1);
  if (invite.role !== "guest" && wsRow[0] && !emailAllowed(email, wsRow[0].allowedDomains)) {
    return c.json({ error: `${wsRow[0].allowedDomains} のメールだけ参加できます` }, 403);
  }

  const existing = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  let userId = existing[0]?.id;

  const auth = createAuth(c.env, c.req.raw);
  let cookieResponse: Response | null = null;

  if (!userId) {
    const users = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
    if (users.length > 0) {
      const hashed = await import("better-auth/crypto").then((m) => m.hashPassword(body.password));
      userId = crypto.randomUUID();
      const now = new Date();
      await db.insert(schema.user).values({
        id: userId,
        name: body.name,
        email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(schema.account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashed,
        createdAt: now,
        updatedAt: now,
      });
      cookieResponse = await auth.api.signInEmail({
        body: { email, password: body.password },
        headers: c.req.raw.headers,
        asResponse: true,
      });
    } else {
      cookieResponse = await auth.api.signUpEmail({
        body: { email, password: body.password, name: body.name },
        headers: c.req.raw.headers,
        asResponse: true,
      });
      const session = await auth.api.getSession({ headers: new Headers(cookieResponse.headers) });
      userId = session?.user?.id ?? userId;
    }
  } else {
    cookieResponse = await auth.api.signInEmail({
      body: { email, password: body.password },
      headers: c.req.raw.headers,
      asResponse: true,
    });
  }

  if (!userId) return c.json({ error: "参加に失敗しました" }, 500);

  const already = await db
    .select()
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, invite.workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  if (already.length === 0) {
    await db.insert(schema.workspaceMembers).values({
      workspaceId: invite.workspaceId,
      userId,
      role: invite.role,
      createdAt: new Date(),
    });
  }

  await db.delete(schema.invites).where(eq(schema.invites.id, invite.id));

  if (!cookieResponse?.ok) {
    return c.json({ error: "参加に失敗しました" }, 500);
  }

  return withSession(cookieResponse, { workspaceId: invite.workspaceId });
});

export const DEFAULT_DB_PROPERTIES_JSON = JSON.stringify(DEFAULT_DB_PROPERTIES);
