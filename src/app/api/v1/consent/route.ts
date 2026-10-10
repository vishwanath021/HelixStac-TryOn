import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CONSENT_HASH, CONSENT_VERSION } from "@/data/consent";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  slug: z.string().min(1),
  sessionId: z.string().min(8).max(80),
  lang: z.string().min(2).max(8),
  accepted: z.boolean(),
  ageGate: z.boolean(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const tenant = await prisma.tenant.findUnique({ where: { slug: parsed.data.slug } });
  if (!tenant || tenant.status === "SUSPENDED") return NextResponse.json({ error: "TENANT" }, { status: 404 });
  const ua = req.headers.get("user-agent") || "";
  const uaHash = createHash("sha256").update(ua).digest("hex").slice(0, 16);
  const row = await prisma.consentLog.create({
    data: {
      tenantId: tenant.id,
      sessionId: parsed.data.sessionId,
      purpose: "TRYON_PREVIEW",
      textVersion: CONSENT_VERSION,
      textHash: CONSENT_HASH,
      lang: parsed.data.lang,
      accepted: parsed.data.accepted,
      ageGate: parsed.data.ageGate,
      uaHash,
    },
  });
  return NextResponse.json({ id: row.id, accepted: row.accepted });
}
