import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const SALON_COOKIE = "helix_salon";

async function membershipFor(userId: string, sessionTenantId?: string) {
  const jar = await cookies();
  const picked = jar.get(SALON_COOKIE)?.value || "";
  if (picked) {
    const hit = await prisma.membership.findFirst({
      where: { userId, tenantId: picked },
      include: { tenant: true },
    });
    if (hit) return hit;
  }
  if (sessionTenantId) {
    const hit = await prisma.membership.findFirst({
      where: { userId, tenantId: sessionTenantId },
      include: { tenant: true },
    });
    if (hit) return hit;
  }
  return prisma.membership.findFirst({
    where: { userId },
    include: { tenant: true },
    orderBy: { role: "asc" },
  });
}

export async function requireMembership() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  }
  const membership = await membershipFor(session.user.id, session.user.tenantId);
  if (!membership) {
    return { error: NextResponse.json({ error: "NO_TENANT" }, { status: 403 }) };
  }
  return { session, membership, tenant: membership.tenant };
}

export async function requireOwner() {
  const result = await requireMembership();
  if ("error" in result && result.error) return result;
  if (!("membership" in result) || result.membership.role !== "OWNER") {
    return { error: NextResponse.json({ error: "OWNER_ONLY" }, { status: 403 }) };
  }
  return result;
}

export async function isSuperSession() {
  const session = await auth();
  return Boolean(session?.user?.isSuperAdmin);
}

async function superNeedsTotp(userId: string) {
  if (process.env.NODE_ENV !== "production") return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpEnabled: true } });
  return !user?.totpEnabled;
}

export async function requireSuper() {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) {
    return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  }
  if (await superNeedsTotp(session.user.id)) {
    return { error: NextResponse.json({ error: "TOTP_REQUIRED", message: "Turn on an authenticator app before using the platform." }, { status: 403 }) };
  }
  return { session };
}

export async function pageTenant() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const membership = await membershipFor(session.user.id, session.user.tenantId);
  if (!membership) {
    if (session.user.isSuperAdmin) redirect("/super");
    redirect("/login?error=no-salon");
  }
  return { session, membership, tenant: membership.tenant };
}

export async function pageSuper(options?: { allowEnrollment?: boolean }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) redirect("/login");
  if (!options?.allowEnrollment && (await superNeedsTotp(session.user.id))) redirect("/super/security");
  return session;
}
