import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { passkey } from "@better-auth/passkey";
import { createDb } from "./db/client";
import * as schema from "./db/schema";
import { count, eq } from "drizzle-orm";

export function createAuth(env: Env, request: Request) {
  const url = new URL(request.url);
  const baseURL = `${url.protocol}//${url.host}`;
  const db = createDb(env.DB);
  const rpID = url.hostname;

  return betterAuth({
    appName: "CF Bible",
    baseURL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
      transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
    },
    plugins: [
      passkey({
        rpID,
        rpName: "CF Bible",
        origin: baseURL,
      }),
    ],
    trustedOrigins: [baseURL],
    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: url.protocol === "https:",
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const workspaces = await db.select({ n: count() }).from(schema.workspaces);
        if ((workspaces[0]?.n ?? 0) === 0) return;
        throw new APIError("FORBIDDEN", {
          message: "アカウント作成は登録画面から行ってください。",
        });
      }),
    },
  });
}

export async function getSessionUser(env: Env, request: Request) {
  const auth = createAuth(env, request);
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

export async function getMembership(db: ReturnType<typeof createDb>, userId: string) {
  const rows = await db
    .select()
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
