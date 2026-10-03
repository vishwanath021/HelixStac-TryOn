import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { NextResponse } from "next/server";
import { z } from "zod";
import { planById } from "@/data/plans";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";

const schema = z.object({
  host: z.string().min(3).max(200),
  verify: z.boolean().optional(),
});

export async function POST(req: Request) {
  const access = await requireOwner();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  if (!planById(access.tenant.plan).customDomain) {
    return NextResponse.json({ error: "PLAN", message: "Custom domains are on Pro and Chain." }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const host = parsed.data.host.toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  const existing = await prisma.domain.findUnique({ where: { host } });
  const token = existing?.token || `helix-verify=${randomBytes(12).toString("hex")}`;
  const domain = await prisma.domain.upsert({
    where: { host },
    update: { tenantId: access.tenant.id },
    create: { host, tenantId: access.tenant.id, token, verified: false },
  });
  if (!parsed.data.verify) {
    return NextResponse.json({ host, token: domain.token, verified: domain.verified, hint: `Add a TXT record for ${host} with ${domain.token}, then verify.` });
  }
  try {
    const records = await dns.resolveTxt(host);
    const flat = records.map((row) => row.join("")).join(" ");
    if (!flat.includes(domain.token)) {
      return NextResponse.json({ error: "DNS", message: "The TXT record was not found yet. DNS can take time.", token: domain.token }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "DNS", message: "Could not read TXT records for that host.", token: domain.token }, { status: 400 });
  }
  await prisma.domain.update({ where: { id: domain.id }, data: { verified: true } });
  return NextResponse.json({ host, verified: true });
}
