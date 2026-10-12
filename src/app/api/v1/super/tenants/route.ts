import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SHADES } from "@/data/shades";
import { STYLES } from "@/data/styles";
import { PLANS, TRIAL_DAYS, isPlanId } from "@/data/plans";
import { isReservedSlug } from "@/lib/host";
import { passwordProblem } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { requireSuper } from "@/lib/session";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(40),
  plan: z.string().optional(),
  city: z.string().max(80).optional(),
  whatsapp: z.string().max(20).optional(),
  ownerEmail: z.string().email().optional(),
  ownerName: z.string().trim().min(2).max(80).optional(),
  ownerPassword: z.string().min(12).max(200).optional(),
});

function validSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !isReservedSlug(slug);
}

export async function POST(req: Request) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  if (!("session" in access)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID", message: "Name, slug, and optional owner details are required." }, { status: 400 });
  const slug = parsed.data.slug.toLowerCase();
  if (!validSlug(slug)) return NextResponse.json({ error: "SLUG", message: "Use a short lowercase slug. Reserved words are not allowed." }, { status: 400 });
  const planId = parsed.data.plan && isPlanId(parsed.data.plan) ? parsed.data.plan : "STARTER";
  const plan = PLANS[planId];
  if (parsed.data.ownerEmail) {
    const problem = passwordProblem(parsed.data.ownerPassword || "");
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.ownerEmail.toLowerCase() } });
    if (!existing && problem) return NextResponse.json({ error: "PASSWORD", message: problem }, { status: 400 });
  }
  const taken = await prisma.tenant.findUnique({ where: { slug } });
  if (taken) return NextResponse.json({ error: "SLUG", message: "That salon address is already used." }, { status: 409 });
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: parsed.data.name,
      logoUrl: "/brand/lookuvi-mark.svg",
      primaryColor: "#69517D",
      accentColor: "#B6A0C9",
      languages: JSON.stringify(["en", "hi"]),
      plan: plan.id,
      status: "TRIAL",
      trialEndsAt: trialEnds,
      creditBalance: plan.credits,
      dailyCap: plan.credits,
      city: parsed.data.city || "",
      whatsapp: parsed.data.whatsapp || "",
      toolColour: true,
      toolStyle: true,
      toolBrows: true,
      toolBeard: true,
      toolNails: true,
    },
  });
  await prisma.creditLedger.create({
    data: { tenantId: tenant.id, delta: plan.credits, reason: "TRIAL_GRANT", balanceAfter: plan.credits, refId: "create" },
  });
  if (STYLES.length) {
    await prisma.tenantStyle.createMany({
      data: STYLES.map((style) => ({ tenantId: tenant.id, styleId: style.id, enabled: true, serviceIds: "[]" })),
    });
  }
  if (SHADES.length) {
    await prisma.tenantShade.createMany({
      data: SHADES.map((shade) => ({ tenantId: tenant.id, shadeId: shade.id, enabled: true, serviceIds: "[]" })),
    });
  }
  let ownerExisted = false;
  if (parsed.data.ownerEmail) {
    const email = parsed.data.ownerEmail.toLowerCase();
    let owner = await prisma.user.findUnique({ where: { email } });
    ownerExisted = Boolean(owner);
    if (!owner) {
      owner = await prisma.user.create({
        data: {
          email,
          name: parsed.data.ownerName || parsed.data.name,
          passwordHash: await hash(parsed.data.ownerPassword || "", 12),
        },
      });
    }
    await prisma.membership.create({ data: { userId: owner.id, tenantId: tenant.id, role: "OWNER" } });
  }
  await prisma.auditLog.create({
    data: { actorId: access.session.user.id, action: "TENANT_CREATE", target: tenant.id, meta: JSON.stringify({ slug, plan: plan.id }) },
  });
  return NextResponse.json({ ok: true, id: tenant.id, slug: tenant.slug, ownerExisted });
}
