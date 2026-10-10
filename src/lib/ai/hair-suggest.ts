import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { STANDARD_CREDIT_COST } from "@/data/plans";
import { CreditError, reserveCredits, settleCredits } from "@/lib/credits";
import { hairReadingSchema, suggestStyles, type HairReading, type TaggedStyle } from "@/lib/hair-suitability";
import { logError, logProviderCall } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { suggestEstimateUsd, type SuggestModelId } from "@/lib/ai/suggest-models";
import { beginPaidCall, finalizePaidCall, releasePaidCall } from "@/lib/ai/spend";
import { bufferedInr, costUsdFromUsage, type UsageNumbers } from "@/lib/ai/tiers";

const VISION_URL = "https://api.openai.com/v1/chat/completions";
const BUSY_MS = 2 * 60 * 1000;

const READING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    density: { type: "string", enum: ["thin", "medium", "thick"] },
    texture: { type: "string", enum: ["straight", "wavy", "curly"] },
    hairline: { type: "string", enum: ["low", "medium", "high", "receding"] },
    faceShape: { type: "string", enum: ["oval", "round", "square", "heart", "oblong", "diamond"] },
    confidence: { type: "number" },
  },
  required: ["density", "texture", "hairline", "faceShape", "confidence"],
} as const;

const PROMPT = [
  "Read this salon selfie for a haircut suggestion.",
  "density is how much hair you can see: thin, medium, or thick.",
  "texture is the curl pattern: straight, wavy, or curly.",
  "hairline is where the hairline sits: low, medium, high, or receding.",
  "faceShape is the face outline: oval, round, square, heart, oblong, or diamond.",
  "confidence is a number from 0 to 1.",
  "Do not name a hairstyle.",
].join(" ");

export type SuggestionCard = {
  id: string;
  name: string;
  reason: string;
  serviceKeys: string[];
};

export type SuggestSuccess = {
  ok: true;
  cached: boolean;
  reading: HairReading;
  suggestions: SuggestionCard[];
  callId: string;
};

export type SuggestFailure = {
  ok: false;
  status: number;
  error: string;
  message: string;
};

export type SuggestResult = SuggestSuccess | SuggestFailure;

class VisionFailed extends Error {
  constructor(
    public usage: UsageNumbers | null,
    public requestId: string,
  ) {
    super("VISION");
  }
}

export function suggestionCards(styles: TaggedStyle[], reading: Pick<HairReading, "density" | "texture" | "faceShape">): SuggestionCard[] {
  return suggestStyles(styles, reading).map((row) => ({
    id: row.style.id,
    name: row.style.name,
    reason: row.reason,
    serviceKeys: row.style.serviceKeys ?? [],
  }));
}

function usageFrom(body: { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; input_tokens?: number; output_tokens?: number } }): UsageNumbers | null {
  const usage = body.usage;
  if (!usage) return null;
  const input = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const output = usage.completion_tokens ?? usage.output_tokens ?? 0;
  if (input <= 0 && output <= 0) return null;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: usage.total_tokens ?? input + output,
    textTokens: input,
    imageTokens: 0,
  };
}

/** One chat completion. Callers must not loop this. */
export async function readHairVision(args: { apiKey: string; model: SuggestModelId; imageJpeg: Buffer; fetchImpl?: typeof fetch }) {
  const fetchImpl = args.fetchImpl ?? fetch;
  const started = Date.now();
  let response: Response;
  try {
    response = await fetchImpl(VISION_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${args.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${args.imageJpeg.toString("base64")}` } },
            ],
          },
        ],
        response_format: { type: "json_schema", json_schema: { name: "hair_reading", strict: true, schema: READING_SCHEMA } },
        max_completion_tokens: 300,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    logError("hair suggest vision", { code: error instanceof Error ? error.name : "fetch" });
    throw new VisionFailed(null, "");
  }
  const json = (await response.json().catch(() => null)) as {
    id?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; input_tokens?: number; output_tokens?: number };
  } | null;
  const usage = json ? usageFrom(json) : null;
  const requestId = json && typeof json.id === "string" ? json.id.slice(0, 128) : "";
  if (!response.ok || !json) throw new VisionFailed(usage, requestId);
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new VisionFailed(usage, requestId);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new VisionFailed(usage, requestId);
  }
  const reading = hairReadingSchema.safeParse(parsed);
  if (!reading.success) throw new VisionFailed(usage, requestId);
  return { reading: reading.data, usage, requestId, latencyMs: Date.now() - started };
}

async function visionJpeg(input: Buffer) {
  const jpeg = await sharp(input, { failOn: "none" })
    .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const meta = await sharp(jpeg, { failOn: "none" }).metadata();
  return { jpeg, imageSize: `${meta.width || 0}x${meta.height || 0}` };
}

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function cachedResult(styles: TaggedStyle[], reading: HairReading, callId: string): SuggestSuccess {
  return { ok: true, cached: true, reading, suggestions: suggestionCards(styles, reading), callId };
}

export async function runHairSuggest(args: {
  tenantId: string;
  photoHash: string;
  imageJpeg: Buffer;
  styles: TaggedStyle[];
  chargeCredits: boolean;
  apiKey: string;
  model: SuggestModelId;
  fetchImpl?: typeof fetch;
}): Promise<SuggestResult> {
  const existing = await prisma.hairSuggest.findUnique({
    where: { tenantId_photoHash: { tenantId: args.tenantId, photoHash: args.photoHash } },
  });
  if (existing?.resultJson) {
    try {
      const reading = hairReadingSchema.safeParse(JSON.parse(existing.resultJson));
      if (reading.success) return cachedResult(args.styles, reading.data, existing.callId);
    } catch {
      /* An unreadable cache is not a photo. The click below may read it once. */
    }
    await prisma.hairSuggest.delete({ where: { id: existing.id } }).catch(() => undefined);
  } else if (existing && Date.now() - existing.createdAt.getTime() < BUSY_MS) {
    return { ok: false, status: 409, error: "BUSY", message: "That photo is already being read. It was not sent again." };
  } else if (existing) {
    await prisma.hairSuggest.delete({ where: { id: existing.id } }).catch(() => undefined);
  }

  let placeholder: { id: string };
  try {
    placeholder = await prisma.hairSuggest.create({
      data: { tenantId: args.tenantId, photoHash: args.photoHash, model: args.model, resultJson: "", callId: "" },
      select: { id: true },
    });
  } catch (error) {
    if (isUnique(error)) {
      return { ok: false, status: 409, error: "BUSY", message: "That photo is already being read. It was not sent again." };
    }
    throw error;
  }

  const dollars = suggestEstimateUsd(args.model);
  const rupees = bufferedInr(dollars);
  const prepared = await visionJpeg(args.imageJpeg);
  const reserved = await beginPaidCall({
    provider: "openai",
    quality: "suggest",
    model: args.model,
    tenantId: args.tenantId,
    tool: "suggest",
    tier: "suggest",
    imageSize: prepared.imageSize,
    estimateInr: rupees,
    estimateUsd: dollars,
  });
  if (!reserved.ok) {
    await prisma.hairSuggest.delete({ where: { id: placeholder.id } }).catch(() => undefined);
    return { ok: false, status: 402, error: "SPEND_CAP", message: "The platform spend cap is reached. Nothing was sent." };
  }

  let creditRef = "";
  if (args.chargeCredits) {
    creditRef = reserved.id;
    try {
      await reserveCredits(args.tenantId, STANDARD_CREDIT_COST, creditRef);
    } catch (error) {
      await releasePaidCall(reserved.id, "REFUNDED");
      await prisma.hairSuggest.delete({ where: { id: placeholder.id } }).catch(() => undefined);
      if (error instanceof CreditError && error.code === "INSUFFICIENT") {
        return { ok: false, status: 402, error: "CREDITS", message: "This salon has used its preview credits." };
      }
      return { ok: false, status: 403, error: "SUSPENDED", message: "This salon's try-on is paused." };
    }
  }

  try {
    const vision = await readHairVision({
      apiKey: args.apiKey,
      model: args.model,
      imageJpeg: prepared.jpeg,
      fetchImpl: args.fetchImpl,
    });
    const usd = vision.usage ? costUsdFromUsage(args.model, vision.usage) : null;
    await finalizePaidCall(reserved.id, {
      model: args.model,
      billed: true,
      charged: true,
      costUsd: usd ?? 0,
      usage: vision.usage ?? undefined,
      latencyMs: vision.latencyMs,
      imageSize: prepared.imageSize,
      costSource: usd != null ? "usage" : "estimate",
      providerRequestId: vision.requestId,
    });
    logProviderCall({
      provider: "openai",
      model: args.model,
      salonId: args.tenantId,
      status: "ok",
      latencyMs: vision.latencyMs,
      costUsd: usd ?? 0,
      requestId: vision.requestId,
    });
    if (creditRef) await settleCredits(args.tenantId, creditRef, "COMMIT");
    await prisma.hairSuggest.update({
      where: { id: placeholder.id },
      data: { resultJson: JSON.stringify(vision.reading), callId: reserved.id, model: args.model },
    });
    return {
      ok: true,
      cached: false,
      reading: vision.reading,
      suggestions: suggestionCards(args.styles, vision.reading),
      callId: reserved.id,
    };
  } catch (error) {
    const failed = error instanceof VisionFailed ? error : new VisionFailed(null, "");
    if (failed.usage) {
      const usd = costUsdFromUsage(args.model, failed.usage);
      await finalizePaidCall(reserved.id, {
        model: args.model,
        billed: true,
        charged: true,
        costUsd: usd ?? 0,
        usage: failed.usage,
        imageSize: prepared.imageSize,
        costSource: usd != null ? "usage" : "estimate",
        providerRequestId: failed.requestId,
      });
    } else {
      await releasePaidCall(reserved.id, "REFUNDED");
    }
    if (creditRef) await settleCredits(args.tenantId, creditRef, "REFUND");
    await prisma.hairSuggest.delete({ where: { id: placeholder.id } }).catch(() => undefined);
    const failedUsd = failed.usage ? costUsdFromUsage(args.model, failed.usage) : null;
    logProviderCall({
      provider: "openai",
      model: args.model,
      salonId: args.tenantId,
      status: "failed",
      latencyMs: 0,
      costUsd: failedUsd ?? 0,
      requestId: failed.requestId,
    });
    logError("hair suggest failed", { code: failed.usage ? "unusable" : "unread" });
    return { ok: false, status: 502, error: "VISION", message: "The hair reading did not complete. It was not sent again." };
  }
}
