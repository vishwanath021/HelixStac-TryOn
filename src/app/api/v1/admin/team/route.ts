import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const access = await requireOwner();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await hash(parsed.data.password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: parsed.data.name, passwordHash },
    create: { email, name: parsed.data.name, passwordHash },
  });
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: access.tenant.id } },
    update: { role: "STAFF" },
    create: { userId: user.id, tenantId: access.tenant.id, role: "STAFF" },
  });
  return NextResponse.json({ ok: true });
}
