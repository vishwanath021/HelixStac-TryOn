import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { passwordProblem } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
  password: z.string().max(200).optional(),
});

const removeSchema = z.object({
  userId: z.string().min(1),
});

export async function POST(req: Request) {
  const access = await requireOwner();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.isSuperAdmin) {
    return NextResponse.json({ error: "FORBIDDEN", message: "That email cannot be invited." }, { status: 403 });
  }
  let userId = existing?.id || "";
  if (!existing) {
    const problem = passwordProblem(parsed.data.password || "");
    if (problem) return NextResponse.json({ error: "WEAK", message: problem }, { status: 400 });
    const created = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name,
        passwordHash: await hash(parsed.data.password || "", 12),
      },
    });
    userId = created.id;
  }
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId, tenantId: access.tenant.id } },
    update: {},
    create: { userId, tenantId: access.tenant.id, role: "STAFF" },
  });
  return NextResponse.json({ ok: true, userId });
}

export async function DELETE(req: Request) {
  const access = await requireOwner();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const parsed = removeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  if (parsed.data.userId === access.session.user.id) {
    return NextResponse.json({ error: "SELF", message: "You cannot remove yourself." }, { status: 400 });
  }
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: parsed.data.userId, tenantId: access.tenant.id } },
  });
  if (!membership) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (membership.role === "OWNER") {
    const owners = await prisma.membership.count({ where: { tenantId: access.tenant.id, role: "OWNER" } });
    if (owners <= 1) {
      return NextResponse.json({ error: "LAST_OWNER", message: "The salon needs at least one owner." }, { status: 400 });
    }
  }
  await prisma.membership.delete({ where: { id: membership.id } });
  await prisma.auditLog.create({
    data: {
      actorId: access.session.user.id,
      action: "TEAM_REMOVE",
      target: parsed.data.userId,
      meta: JSON.stringify({ tenantId: access.tenant.id, role: membership.role }),
    },
  });
  return NextResponse.json({ ok: true });
}
