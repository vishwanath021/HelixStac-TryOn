import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { actualHeading, actualIsKnown, costSourceLabel } from "@/lib/ai/cost-source";
import { resolveOpenAIKey } from "@/lib/ai/credentials";
import { runHairSuggest } from "@/lib/ai/hair-suggest";
import { resolveSuggestModel } from "@/lib/ai/suggest-models";
import { ImageError, sanitizeSelfie } from "@/lib/images";
import { loadTenantBySlug, toSalonConfig } from "@/lib/salon";
import { prisma } from "@/lib/prisma";
import { isSuperSession } from "@/lib/session";
import type { Gender } from "@/data/styles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const genderSchema = z.enum(["women", "men", "kids"]);

function photoDigest(jpeg: Buffer) {
  return createHash("sha256").update(jpeg).digest("hex");
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "INVALID", message: "Send the selfie that is already on screen." }, { status: 400 });
  const slug = String(form.get("slug") || "");
  const sessionId = String(form.get("sessionId") || "");
  const consentId = String(form.get("consentId") || "");
  const gender = genderSchema.safeParse(String(form.get("gender") || "women"));
  const photo = form.get("photo");
  if (!slug || sessionId.length < 8 || !gender.success || !(photo instanceof File)) {
    return NextResponse.json({ error: "INVALID", message: "Photo, salon, and session are required." }, { status: 400 });
  }
  if (photo.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "SIZE", message: "Please use a photo under 2 MB." }, { status: 413 });
  }

  const tenant = await loadTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "TENANT", message: "Salon not found." }, { status: 404 });
  if (tenant.status === "SUSPENDED") {
    return NextResponse.json({ error: "SUSPENDED", message: "This salon's try-on is paused." }, { status: 403 });
  }
  if (!tenant.toolStyle || !tenant.hairSuggestOn) {
    return NextResponse.json({ error: "OFF", message: "AI hair suggestions are turned off for this salon." }, { status: 403 });
  }

  const consent = await prisma.consentLog.findFirst({
    where: { id: consentId, tenantId: tenant.id, sessionId, accepted: true, ageGate: true },
  });
  if (!consent || Date.now() - consent.createdAt.getTime() > 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "CONSENT", message: "Agree to the preview notice before a hair suggestion." }, { status: 403 });
  }

  const model = resolveSuggestModel();
  if (!model) {
    return NextResponse.json({ error: "MODEL", message: "That suggestion model is not available. Nothing was sent." }, { status: 400 });
  }
  const apiKey = await resolveOpenAIKey();
  if (!apiKey) {
    return NextResponse.json({ error: "KEY", message: "Hair suggestions need an OpenAI key on the platform. Nothing was sent." }, { status: 503 });
  }

  let jpeg: Buffer;
  try {
    jpeg = await sanitizeSelfie(Buffer.from(await photo.arrayBuffer()));
  } catch (error) {
    const code = error instanceof ImageError ? error.code : "DECODE";
    return NextResponse.json({ error: code, message: "Use a JPEG, PNG, or WebP selfie under 2 MB." }, { status: 400 });
  }

  const config = toSalonConfig(tenant);
  const audience = gender.data as Gender;
  const styles = config.styles.filter((style) => style.gender === audience);
  const result = await runHairSuggest({
    tenantId: tenant.id,
    photoHash: photoDigest(jpeg),
    imageJpeg: jpeg,
    styles,
    chargeCredits: tenant.hairSuggestUsesCredits,
    apiKey,
    model,
  });
  if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });

  const revealCost = await isSuperSession();
  const body: Record<string, unknown> = {
    density: result.reading.density,
    texture: result.reading.texture,
    hairline: result.reading.hairline,
    faceShape: result.reading.faceShape,
    confidence: result.reading.confidence,
    cached: result.cached,
    suggestions: result.suggestions,
  };
  if (revealCost && result.callId) {
    const call = await prisma.aiCall.findUnique({ where: { id: result.callId } });
    if (call) {
      const known = actualIsKnown(call.costSource);
      body.showCost = true;
      body.rupees = call.estimatePaise / 100;
      body.actualKnown = known;
      body.actualDollars = call.costUsdMicros / 1_000_000;
      body.actualRupees = call.costInrPaise / 100;
      body.actualLabel = actualHeading(call.costSource);
      body.sourceLabel = costSourceLabel(call.costSource, call.status);
    }
  }
  return NextResponse.json(body);
}
