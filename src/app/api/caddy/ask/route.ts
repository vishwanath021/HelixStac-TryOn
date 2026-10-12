import { NextResponse } from "next/server";
import { caddyKind } from "@/lib/caddy-ask";
import { appBaseUrl, rootDomain } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit, requestClientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

function appHost() {
  const raw = process.env.APP_DOMAIN || appBaseUrl();
  try {
    if (raw.includes("://")) return new URL(raw).hostname;
  } catch {
    return "";
  }
  return raw.split(":")[0]?.toLowerCase() || "";
}

export async function GET(req: Request) {
  const limited = await sharedRateLimit(`caddy:${requestClientIp(req)}`, 120, 60 * 1000);
  if (!limited.ok) return new NextResponse(null, { status: 429 });
  const domain = new URL(req.url).searchParams.get("domain") || "";
  const decision = caddyKind(domain, rootDomain(), appHost());
  if (decision.kind === "no") return new NextResponse(null, { status: 404 });
  if (decision.kind === "apex") return new NextResponse(null, { status: 200 });
  if (decision.kind === "salon" && decision.slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug: decision.slug }, select: { id: true } });
    if (!tenant) return new NextResponse(null, { status: 404 });
    return new NextResponse(null, { status: 200 });
  }
  const host = domain.trim().toLowerCase().split(":")[0] || "";
  const row = await prisma.domain.findFirst({ where: { host, verified: true }, select: { id: true } });
  if (!row) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, { status: 200 });
}
