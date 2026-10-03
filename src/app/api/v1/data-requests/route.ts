import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  slug: z.string().min(1),
  kind: z.enum(["withdraw", "delete", "access"]),
  contact: z.string().min(3).max(120),
  sessionId: z.string().max(80).optional().nullable(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const tenant = await prisma.tenant.findUnique({ where: { slug: parsed.data.slug } });
  if (!tenant) return NextResponse.json({ error: "TENANT" }, { status: 404 });
  if (parsed.data.kind === "withdraw" && parsed.data.sessionId) {
    await prisma.lead.deleteMany({ where: { tenantId: tenant.id, sessionId: parsed.data.sessionId } });
  }
  const row = await prisma.dataRequest.create({
    data: {
      tenantId: tenant.id,
      kind: parsed.data.kind,
      contact: parsed.data.contact,
      sessionId: parsed.data.sessionId || null,
      status: parsed.data.kind === "withdraw" ? "DONE" : "OPEN",
      note: parsed.data.kind === "withdraw" ? "Session leads removed. No photo was stored." : "",
    },
  });
  return NextResponse.json({
    id: row.id,
    status: row.status,
    message: "Request recorded. Photos are not stored, so there is no photo file to delete. Open lead requests are handled within 30 days.",
  });
}
