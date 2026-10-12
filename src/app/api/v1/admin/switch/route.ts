import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SALON_COOKIE } from "@/lib/session";

const bodySchema = z.object({ tenantId: z.string().min(1) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: session.user.id, tenantId: parsed.data.tenantId } },
    include: { tenant: true },
  });
  if (!membership) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const res = NextResponse.json({ ok: true, slug: membership.tenant.slug, name: membership.tenant.name });
  res.cookies.set(SALON_COOKIE, membership.tenantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
