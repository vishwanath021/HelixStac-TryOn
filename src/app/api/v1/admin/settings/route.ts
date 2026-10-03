import { NextResponse } from "next/server";
import { z } from "zod";
import { planById } from "@/data/plans";
import { isLocale, LOCALES } from "@/data/i18n";
import { prisma } from "@/lib/prisma";
import { requireMembership, requireOwner } from "@/lib/session";

const schema = z.object({
  name: z.string().min(2).max(80).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  whatsapp: z.string().max(20).optional(),
  address: z.string().max(200).optional(),
  mapsUrl: z.string().max(300).optional(),
  city: z.string().max(80).optional(),
  languages: z.array(z.string()).optional(),
  defaultLang: z.string().optional(),
  logoUrl: z.string().max(200_000).optional().nullable(),
  removeBranding: z.boolean().optional(),
  onboardingDone: z.boolean().optional(),
  showMen: z.boolean().optional(),
  showWomen: z.boolean().optional(),
  showKids: z.boolean().optional(),
  toolColour: z.boolean().optional(),
  toolStyle: z.boolean().optional(),
  toolBrows: z.boolean().optional(),
  toolBeard: z.boolean().optional(),
  toolNails: z.boolean().optional(),
  anonDailyCap: z.number().int().min(0).max(500).optional(),
  memberDailyCap: z.number().int().min(0).max(500).optional(),
  requireLoginToBook: z.boolean().optional(),
  gstin: z.string().max(20).optional().nullable(),
});

export async function GET() {
  const access = await requireMembership();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  return NextResponse.json({ tenant: access.tenant, role: access.membership.role });
}

export async function PUT(req: Request) {
  const access = await requireMembership();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const plan = planById(access.tenant.plan);
  const data = parsed.data;
  if (data.removeBranding && !plan.removeBranding) {
    return NextResponse.json({ error: "PLAN", message: "Removing the HelixStac mark needs Pro or Chain." }, { status: 403 });
  }
  const languages = data.languages?.filter(isLocale);
  if (languages && plan.languages && languages.length > plan.languages) {
    return NextResponse.json({ error: "PLAN", message: `This plan includes ${plan.languages} languages.` }, { status: 403 });
  }
  const { defaultLang, logoUrl, ...rest } = data;
  delete rest.languages;
  const tenant = await prisma.tenant.update({
    where: { id: access.tenant.id },
    data: {
      ...rest,
      languages: languages ? JSON.stringify(languages) : undefined,
      defaultLang: defaultLang && isLocale(defaultLang) ? defaultLang : undefined,
      logoUrl,
    },
  });
  return NextResponse.json({ ok: true, slug: tenant.slug, languages: LOCALES });
}

export async function DELETE() {
  const access = await requireOwner();
  if ("error" in access && access.error) return access.error;
  return NextResponse.json({ error: "NO_DELETE", message: "Ask support to close a salon." }, { status: 405 });
}
