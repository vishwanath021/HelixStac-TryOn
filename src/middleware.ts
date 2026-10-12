import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";
import { csrfBlocked } from "@/lib/http/csrf";
import { parseHost } from "@/lib/host";

function hasSessionCookie(req: NextRequest) {
  return Boolean(req.cookies.get("authjs.session-token") || req.cookies.get("__Secure-authjs.session-token"));
}

function applyCsp(req: NextRequest, response: NextResponse, nonce: string) {
  const csp = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV !== "production",
    embed: req.nextUrl.pathname.startsWith("/embed"),
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

function nextWithCsp(req: NextRequest, nonce: string, rewrite?: URL) {
  const csp = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV !== "production",
    embed: req.nextUrl.pathname.startsWith("/embed"),
  });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = rewrite
    ? NextResponse.rewrite(rewrite, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export function middleware(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const { pathname } = req.nextUrl;
  if (csrfBlocked(req)) return applyCsp(req, NextResponse.json({ error: "CSRF" }, { status: 403 }), nonce);
  if ((pathname.startsWith("/admin") || pathname.startsWith("/super")) && !hasSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return applyCsp(req, NextResponse.redirect(url), nonce);
  }
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
    pathname.startsWith("/samples") ||
    /\.(?:webp|png|jpe?g|gif|svg|avif|ico|json|txt|wasm|js|css)$/i.test(pathname)
  ) {
    return nextWithCsp(req, nonce);
  }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const parsed = parseHost(host, process.env.ROOT_DOMAIN || "localhost", process.env.APP_DOMAIN);
  if (parsed.kind === "platform" || pathname.startsWith("/s/")) return nextWithCsp(req, nonce);
  const url = req.nextUrl.clone();
  const suffix = pathname === "/" ? "" : pathname;
  url.pathname = parsed.kind === "subdomain" ? `/s/${parsed.slug}${suffix}` : `/s/by-host${suffix}`;
  const response = nextWithCsp(req, nonce, url);
  response.headers.set("x-tenant-host", parsed.host);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|embed.js).*)"],
};
