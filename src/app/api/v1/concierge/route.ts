import { NextResponse } from "next/server";
import { z } from "zod";
import { answerConcierge } from "@/lib/concierge";
import { ownerFeatures } from "@/lib/features";
import { tooMany } from "@/lib/http/guard";
import { loadTenantBySlug, toSalonConfig } from "@/lib/salon";

const bodySchema = z.object({
  slug: z.string().min(1),
  message: z.string().min(1).max(400),
  lang: z.string().default("en"),
});

export async function POST(req: Request) {
  if (!ownerFeatures().concierge) return NextResponse.json({ error: "OFF", message: "The concierge is not available." }, { status: 404 });
  const limited = await tooMany(req, "concierge", 30, 60 * 60 * 1000);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const tenant = await loadTenantBySlug(parsed.data.slug);
  if (!tenant) return NextResponse.json({ error: "TENANT" }, { status: 404 });
  const config = toSalonConfig(tenant);
  let source: "rules" | "gemini" = "rules";
  let answer = answerConcierge(parsed.data.message, {
    name: config.name,
    address: config.address,
    services: config.services.map((service) => ({
      name: service.nameI18n[parsed.data.lang] || service.name,
      priceInr: service.priceInr,
      durationMin: service.durationMin,
    })),
  });
  if (process.env.CONCIERGE_LLM === "gemini" && process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_TEXT_MODEL || "gemini-3.1-flash-lite",
        contents: `You are a salon receptionist for ${config.name}. Answer in the customer's language if you can. Use only this menu: ${answer}. Do not invent prices. Do not claim the preview is exact. Question: ${parsed.data.message}`,
      });
      if (response.text) {
        answer = response.text;
        source = "gemini";
      }
    } catch {
      source = "rules";
    }
  }
  return NextResponse.json({ answer, source });
}
