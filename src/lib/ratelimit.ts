const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const prev = (buckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
  if (prev.length >= limit) {
    buckets.set(key, prev);
    return { ok: false as const, remaining: 0, retryAfterMs: Math.max(0, windowMs - (now - prev[0])) };
  }
  prev.push(now);
  buckets.set(key, prev);
  return { ok: true as const, remaining: limit - prev.length, retryAfterMs: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}

/**
 * When the load balancer overwrites or appends X-Forwarded-For, the trusted hop is the
 * rightmost address (or TRUSTED_PROXY_HOPS from the right). The left-most value is client-supplied.
 * Without TRUST_PROXY the header is ignored so a caller cannot pick a fresh bucket.
 */
export function clientIp(headerValue: string | null, trustProxy = process.env.TRUST_PROXY === "true") {
  if (!headerValue) return "unknown";
  const parts = headerValue.split(",").map((part) => part.trim()).filter(Boolean);
  if (!trustProxy || parts.length === 0) return "unknown";
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS || 1));
  return parts[Math.max(0, parts.length - hops)] || "unknown";
}

export function requestClientIp(req: { headers: { get(name: string): string | null } }) {
  if (process.env.TRUST_PROXY !== "true") return "direct";
  const cf = req.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();
  return clientIp(req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"), true);
}

/** Memory in dev and tests. Postgres in production. Redis when REDIS_URL is set. */
export async function sharedRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (process.env.REDIS_URL && process.env.NODE_ENV === "production") {
    try {
      const { redisIncrement } = await import("@/lib/redis-limit");
      const hits = await redisIncrement(key, windowMs);
      if (hits <= limit) return { ok: true as const, remaining: limit - hits, retryAfterMs: 0 };
      return { ok: false as const, remaining: 0, retryAfterMs: windowMs };
    } catch {
      // Fall through to the database so a Redis blip does not open the gate.
    }
  }
  const database = process.env.DATABASE_URL || "";
  const useDb = process.env.RATE_LIMIT_STORE === "database" || (process.env.NODE_ENV === "production" && database.startsWith("postgres"));
  if (useDb) {
    const { prisma } = await import("@/lib/prisma");
    const { createHash } = await import("node:crypto");
    const bucket = Math.floor(now / windowMs);
    const id = createHash("sha256").update(`${key}:${bucket}`).digest("hex");
    const resetAt = new Date((bucket + 1) * windowMs);
    await prisma.rateBucket.upsert({ where: { id }, create: { id, hits: 0, resetAt }, update: {} });
    const updated = await prisma.rateBucket.updateMany({ where: { id, hits: { lt: limit } }, data: { hits: { increment: 1 } } });
    if (updated.count === 1) return { ok: true as const, remaining: 0, retryAfterMs: 0 };
    return { ok: false as const, remaining: 0, retryAfterMs: Math.max(0, resetAt.getTime() - now) };
  }
  return rateLimit(key, limit, windowMs, now);
}
