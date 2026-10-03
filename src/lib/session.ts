import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireMembership() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  }
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    include: { tenant: true },
    orderBy: { role: "asc" },
  });
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

export async function requireSuper() {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) {
    return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  }
  return { session };
}

export async function pageTenant() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    include: { tenant: true },
    orderBy: { role: "asc" },
  });
  if (!membership) {
    if (session.user.isSuperAdmin) redirect("/super");
    redirect("/login?error=no-salon");
  }
  return { session, membership, tenant: membership.tenant };
}

export async function pageSuper() {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) redirect("/login");
  return session;
}
