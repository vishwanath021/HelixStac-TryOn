import { NextResponse, type NextRequest } from "next/server";
import { parseHost } from "@/lib/host";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/super") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/embed") ||
    pathname.startsWith("/mediapipe") ||
    pathname.startsWith("/brand") ||
    pathname.startsWith("/samples")
  ) {
    return NextResponse.next();
  }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const parsed = parseHost(host, process.env.ROOT_DOMAIN || "localhost");
  if (parsed.kind === "platform" || pathname.startsWith("/s/")) return NextResponse.next();
  const url = req.nextUrl.clone();
  const suffix = pathname === "/" ? "" : pathname;
  url.pathname = parsed.kind === "subdomain" ? `/s/${parsed.slug}${suffix}` : `/s/by-host${suffix}`;
  const response = NextResponse.rewrite(url);
  response.headers.set("x-tenant-host", parsed.host);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|embed.js).*)"],
};
