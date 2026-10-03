import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const BANNED = /photo|image|dataurl|base64|selfie|buffer/i;

const bodySchema = z.object({
  slug: z.string().min(1),
  sessionId: z.string().min(8).max(80),
  events: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        props: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
      }),
    )
    .max(20),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const tenant = await prisma.tenant.findUnique({ where: { slug: parsed.data.slug } });
  if (!tenant) return NextResponse.json({ error: "TENANT" }, { status: 404 });
  const rows = [];
  for (const event of parsed.data.events) {
    const props = event.props ?? {};
    if (Object.keys(props).some((key) => BANNED.test(key))) continue;
    const encoded = JSON.stringify(props);
    if (encoded.length > 2000) continue;
    rows.push({ tenantId: tenant.id, sessionId: parsed.data.sessionId, name: event.name, props: encoded });
  }
  if (rows.length) await prisma.usageEvent.createMany({ data: rows });
  return NextResponse.json({ ok: true, stored: rows.length });
}
