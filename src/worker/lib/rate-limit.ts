const buckets = new Map<string, { n: number; resetAt: number }>();

/** アイソレート単位。分散攻撃には弱いが、単一 Worker への噴射は止められる。 */
export function allowAttempt(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { n: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.n >= limit) return false;
  current.n += 1;
  return true;
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}
