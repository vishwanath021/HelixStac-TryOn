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

export function clientIp(headerValue: string | null) {
  if (!headerValue) return "unknown";
  return headerValue.split(",")[0]?.trim() || "unknown";
}
