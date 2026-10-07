import { BilledProviderError, UnbilledProviderError, UncertainBillingError, UnknownModelError, isUnknownModelResponse } from "@/lib/ai/errors";
import { buildOpenRouterChatBody, openRouterAspect, openRouterModel } from "@/lib/ai/openrouter-models";
import type { UsageNumbers } from "@/lib/ai/tiers";
import { numberEnv } from "@/lib/env";

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const GENERATION_URL = "https://openrouter.ai/api/v1/generation";

export function openRouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function scrub(text: string, apiKey: string) {
  const hidden = apiKey ? text.split(apiKey).join("[redacted]") : text;
  return hidden
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, "data:image/[redacted]")
    .replace(/sk-(?:or-)?[A-Za-z0-9_\-]{8,}/g, "sk-[redacted]")
    .replace(/Bearer\s+[^\s"]+/gi, "Bearer [redacted]")
    .slice(0, 400);
}

function dataUrl(bytes: Buffer, mime: string) {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function reportedCost(usage: { cost?: unknown } | undefined): number | undefined {
  return typeof usage?.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0 ? usage.cost : undefined;
}

/** Documented generation id: https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation */
export function openRouterGenerationId(id: unknown) {
  if (typeof id !== "string" || id.length > 128) return "";
  return /^gen-[0-9A-Za-z-]+$/.test(id) ? id : "";
}

/** total_cost is the billed USD on GET /api/v1/generation?id= */
export function openRouterTotalCost(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { total_cost?: unknown; data?: { total_cost?: unknown } };
  const value = root.data && typeof root.data === "object" ? root.data.total_cost : root.total_cost;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function usageFrom(payload: { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number } }): UsageNumbers | undefined {
  const usage = payload.usage;
  if (!usage) return undefined;
  const cost = reportedCost(usage);
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    ...(cost === undefined ? {} : { reportedCostUsd: cost }),
  };
}

/** Official assistant image field: image_url.url is a data URL. Remote URLs are not fetched. */
export function openRouterImageBytes(message: { images?: unknown } | undefined): Buffer | null {
  const images = message?.images;
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  if (!first || typeof first !== "object") return null;
  const url = (first as { image_url?: { url?: unknown } }).image_url?.url;
  if (typeof url !== "string") return null;
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  return bytes.length > 0 ? bytes : null;
}

type FetchImpl = typeof fetch;

/**
 * One chat completion. No retry. A timeout or a dropped connection is an unknown bill.
 * A different model id in the response is not kept.
 */
export async function postOpenRouterReferenceEdit(args: {
  apiKey: string;
  modelId: string;
  prompt: string;
  selfiePng: Buffer;
  referenceJpeg: Buffer;
  width: number;
  height: number;
  estimateUsd: number;
  fetchImpl?: FetchImpl;
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
}) {
  const row = openRouterModel(args.modelId);
  if (!row) throw new UnknownModelError(`${args.modelId} is not a configured OpenRouter comparison model. No other model was called.`);
  const aspect = openRouterAspect(args.width, args.height);
  const body = buildOpenRouterChatBody(row.id, {
    prompt: args.prompt,
    selfieDataUrl: dataUrl(args.selfiePng, "image/png"),
    referenceDataUrl: dataUrl(args.referenceJpeg, "image/jpeg"),
    aspectRatio: aspect,
  });
  if (!body) throw new UnknownModelError(`${row.id} is not a configured OpenRouter comparison model. No other model was called.`);
  const fetchImpl = args.fetchImpl ?? fetch;
  const deadlineMs = args.deadlineMs ?? numberEnv("OPENROUTER_DEADLINE_MS", 180_000);
  let response: Response;
  try {
    response = await fetchImpl(CHAT_URL, {
      method: "POST",
      headers: openRouterHeaders(args.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1, deadlineMs)),
    });
  } catch {
    throw new UncertainBillingError("OpenRouter did not answer. The call was not sent again.");
  }
  const raw = await response.text().catch(() => "");
  if (response.status === 401 || response.status === 403) {
    throw new UnbilledProviderError("OpenRouter rejected the key. No image was returned.");
  }
  if (isUnknownModelResponse(response.status, scrub(raw, args.apiKey))) {
    throw new UnknownModelError(`${row.id} is not available on this key. No other model was called.`);
  }
  if (response.status >= 500) {
    throw new UncertainBillingError("OpenRouter returned an error after the request was sent. The call was not sent again.");
  }
  if (!response.ok) {
    throw new UnbilledProviderError(scrub(raw, args.apiKey) || "OpenRouter refused the request before an image was returned.");
  }
  let payload: {
    id?: string;
    model?: string;
    choices?: { message?: { images?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
  };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    throw new UncertainBillingError("OpenRouter returned a response that could not be read. The call was not sent again.");
  }
  let usage = usageFrom(payload);
  const generationId = openRouterGenerationId(payload.id);
  let costReport: "usage.cost" | "generation" | "none" = usage?.reportedCostUsd != null ? "usage.cost" : "none";
  if (costReport === "none" && generationId) {
    const billed = await generationTotalCost({
      apiKey: args.apiKey,
      id: generationId,
      fetchImpl,
      sleep: args.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    });
    if (billed != null) {
      usage = { ...(usage ?? {}), reportedCostUsd: billed };
      costReport = "generation";
    }
  }
  const cost = usage?.reportedCostUsd ?? args.estimateUsd;
  if (typeof payload.model === "string" && payload.model !== row.id) {
    throw new BilledProviderError(
      cost,
      usage,
      `OpenRouter returned ${payload.model} instead of ${row.id}. The image was not kept. The call was not retried.`,
    );
  }
  const image = openRouterImageBytes(payload.choices?.[0]?.message);
  if (!image) {
    throw new BilledProviderError(cost, usage, "OpenRouter did not return a base64 image in message.images. The call was not retried.");
  }
  return { image, usage, model: row.id, costFromUsage: usage?.reportedCostUsd != null, generationId, costReport };
}

/** GET the generation stats. A short wait covers the case where total_cost is not written yet. The image call is not repeated. */
async function generationTotalCost(args: {
  apiKey: string;
  id: string;
  fetchImpl: FetchImpl;
  sleep: (ms: number) => Promise<void>;
}) {
  const delays = [0, 600, 1500];
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) await args.sleep(delays[attempt]);
    let response: Response;
    try {
      response = await args.fetchImpl(`${GENERATION_URL}?id=${encodeURIComponent(args.id)}`, {
        headers: openRouterHeaders(args.apiKey),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      continue;
    }
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) continue;
    const cost = openRouterTotalCost(await response.json().catch(() => null));
    if (cost != null) return cost;
  }
  return null;
}
