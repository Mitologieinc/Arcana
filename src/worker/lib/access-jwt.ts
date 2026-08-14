import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

type AccessVars = {
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function teamDomain(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function isAccessEnabled(env: AccessVars): boolean {
  return Boolean(env.TEAM_DOMAIN?.trim() && env.POLICY_AUD?.trim());
}

function accessJwt(request: Request): string | null {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function jwksFor(issuer: string) {
  const cached = jwksCache.get(issuer);
  if (cached) return cached;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  jwksCache.set(issuer, jwks);
  return jwks;
}

/** Access の Bypass と揃える。未設定時は検証自体をしない。 */
export function shouldBypassAccessJwt(request: Request): boolean {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/health") return true;
  if (request.method === "GET" && /^\/api\/share\/[^/]+$/.test(path)) return true;
  if (url.searchParams.has("token")) {
    return (
      path.startsWith("/api/pages/") ||
      path.startsWith("/api/files/") ||
      path.startsWith("/api/collab/")
    );
  }
  return false;
}

export function cloudflareAccess(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const env = c.env as AccessVars;
    if (!isAccessEnabled(env) || shouldBypassAccessJwt(c.req.raw)) {
      return next();
    }

    const token = accessJwt(c.req.raw);
    if (!token) {
      return c.json({ error: "Cloudflare Access の認証が必要です" }, 401);
    }

    const issuer = teamDomain(env.TEAM_DOMAIN!);
    try {
      await jwtVerify(token, jwksFor(issuer), {
        issuer,
        audience: env.POLICY_AUD!.trim(),
      });
    } catch {
      return c.json({ error: "Cloudflare Access のトークンが無効です" }, 403);
    }

    return next();
  };
}
