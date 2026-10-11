/** Cookie-authenticated writes must come from this app. Webhooks and guest try-on are not checked here. */
export function csrfBlocked(req: { method: string; headers: { get(name: string): string | null }; nextUrl?: { pathname: string }; url?: string }) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return false;
  const pathname = req.nextUrl?.pathname || new URL(req.url || "http://localhost").pathname;
  const guarded = pathname.startsWith("/api/v1/admin") || pathname.startsWith("/api/v1/super") || pathname.startsWith("/api/v1/auth");
  if (!guarded) return false;
  const origin = req.headers.get("origin");
  if (!origin) return process.env.NODE_ENV === "production";
  const forwarded = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const host = forwarded.split(",")[0]?.trim() || "";
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
