import { NextResponse } from "next/server";
import { z } from "zod";
import { shadeById } from "@/data/shades";
import { resolveLook } from "@/lib/guidance";
import { loadTenantBySlug, servicesForLook, toSalonConfig } from "@/lib/salon";
import { prisma } from "@/lib/prisma";
import { buildWhatsAppLink } from "@/lib/whatsapp";

const bodySchema = z.object({
  slug: z.string().min(1),
  sessionId: z.string().min(8).max(80),
  styleId: z.string().min(1),
  tool: z.enum(["style", "brows", "beard", "nails"]).optional(),
  shadeId: z.string().optional().nullable(),
  lang: z.string().default("en"),
  name: z.string().max(80).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  src: z.string().max(40).optional().nullable(),
  outletId: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const tenant = await loadTenantBySlug(parsed.data.slug);
  if (!tenant || tenant.status === "SUSPENDED") return NextResponse.json({ error: "TENANT" }, { status: 404 });
  const config = toSalonConfig(tenant);
  const tool = parsed.data.tool ?? "style";
  const look = resolveLook(tool, parsed.data.styleId);
  const enabled =
    tool === "brows" ? config.brows.some((item) => item.id === parsed.data.styleId) :
    tool === "beard" ? config.beards.some((item) => item.id === parsed.data.styleId) :
    tool === "nails" ? config.nails.some((item) => item.id === parsed.data.styleId) :
    config.styles.some((item) => item.id === parsed.data.styleId);
  if (!look || !enabled) return NextResponse.json({ error: "STYLE" }, { status: 400 });
  const shade = tool === "style" ? shadeById(parsed.data.shadeId) : null;
  const keys = [...look.serviceKeys, ...(shade?.serviceKeys ?? [])];
  const services = servicesForLook(config, keys).map((service) => ({
    name: service.nameI18n[parsed.data.lang] || service.name,
    priceInr: service.priceInr,
  }));
  const lookName = look.name;
  const outlet = config.outlets.find((item) => item.id === parsed.data.outletId) || config.outlets.find((item) => item.isPrimary);
  const phone = outlet?.whatsapp || config.whatsapp;
  const link = buildWhatsAppLink({
    phone,
    salonName: config.name,
    lookName,
    shadeName: shade?.name,
    services,
    lang: parsed.data.lang,
  });
  const lead = await prisma.lead.create({
    data: {
      tenantId: tenant.id,
      sessionId: parsed.data.sessionId,
      name: parsed.data.name || null,
      phone: parsed.data.phone || null,
      lookName,
      shadeName: shade?.name || null,
      services: JSON.stringify(services),
      lang: parsed.data.lang,
      src: parsed.data.src || "tryon",
      status: "NEW",
    },
  });
  await prisma.usageEvent.create({
    data: {
      tenantId: tenant.id,
      sessionId: parsed.data.sessionId,
      name: "whatsapp_clicked",
      props: JSON.stringify({ look: lookName, shade: shade?.name || null, leadId: lead.id, tool }),
    },
  });
  return NextResponse.json({ leadId: lead.id, whatsappUrl: link.url, text: link.text });
}
