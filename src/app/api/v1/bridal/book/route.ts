import { NextResponse } from "next/server";
import { z } from "zod";
import { bridalEventById, bridalLookById } from "@/data/bridal";
import { shareableLookUrl } from "@/lib/media-link";
import { tooMany } from "@/lib/http/guard";
import { prisma } from "@/lib/prisma";
import { loadTenantBySlug } from "@/lib/salon";
import { buildBridalTrialText, buildWhatsAppLink } from "@/lib/whatsapp";

const bodySchema = z.object({
  slug: z.string().min(1),
  sessionId: z.string().min(8).max(80),
  name: z.string().trim().min(2).max(80),
  eventId: z.string().min(1),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lookIds: z.array(z.string()).min(1).max(6),
  lookUrls: z.array(z.string().max(2000)).max(6).optional(),
  lang: z.string().default("en"),
});

export async function POST(req: Request) {
  const limited = await tooMany(req, "bridal-book", 20, 60 * 60 * 1000);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID", message: "Add your name, the event, and a date." }, { status: 400 });
  const tenant = await loadTenantBySlug(parsed.data.slug);
  if (!tenant || tenant.status === "SUSPENDED") return NextResponse.json({ error: "TENANT" }, { status: 404 });
  if (!tenant.productBridal) return NextResponse.json({ error: "PRODUCT", message: "Bridal is turned off for this salon." }, { status: 404 });
  const event = bridalEventById(parsed.data.eventId);
  if (!event) return NextResponse.json({ error: "EVENT", message: "Choose the event." }, { status: 400 });
  const looks = parsed.data.lookIds.map((id) => bridalLookById(id)).filter((look) => look !== null);
  if (!looks.length) return NextResponse.json({ error: "LOOK", message: "Choose a bridal look first." }, { status: 400 });
  const urls = (parsed.data.lookUrls || []).map((url) => shareableLookUrl(url)).filter(Boolean);
  const phone = tenant.whatsapp;
  const text = buildBridalTrialText({
    name: parsed.data.name,
    eventLabel: event.label,
    eventDate: parsed.data.eventDate,
    looks: looks.map((look) => look.name),
    urls,
  });
  const link = buildWhatsAppLink({
    phone,
    salonName: tenant.name,
    lookName: looks.map((look) => look.name).join(", "),
    services: [],
    lang: parsed.data.lang,
  });
  if (!link.url) {
    return NextResponse.json({ error: "WHATSAPP", message: "This salon has not added a WhatsApp number yet." }, { status: 400 });
  }
  const whatsappUrl = `https://wa.me/${link.phone}?text=${encodeURIComponent(text)}`;
  const lead = await prisma.lead.create({
    data: {
      tenantId: tenant.id,
      sessionId: parsed.data.sessionId,
      name: parsed.data.name,
      lookName: looks.map((look) => look.name).join(", "),
      services: "[]",
      lang: parsed.data.lang,
      src: "bridal",
      status: "NEW",
      type: "BRIDAL",
      eventName: event.label,
      eventDate: parsed.data.eventDate,
    },
  });
  await prisma.usageEvent.create({
    data: {
      tenantId: tenant.id,
      sessionId: parsed.data.sessionId,
      name: "bridal_trial",
      props: JSON.stringify({ leadId: lead.id, event: event.id, looks: looks.map((look) => look.id) }),
    },
  });
  return NextResponse.json({ leadId: lead.id, whatsappUrl, text });
}
