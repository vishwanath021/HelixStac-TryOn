import { BilledProviderError, UnbilledProviderError, UncertainBillingError, UnknownModelError, isUnknownModelResponse } from "@/lib/ai/errors";
import { buildOpenRouterChatBody, openRouterAspect, openRouterModel } from "@/lib/ai/openrouter-models";
import type { UsageNumbers } from "@/lib/ai/tiers";
import { numberEnv } from "@/lib/env";

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

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
    model?: string;
    choices?: { message?: { images?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
  };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    throw new UncertainBillingError("OpenRouter returned a response that could not be read. The call was not sent again.");
  }
  const usage = usageFrom(payload);
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
  return { image, usage, model: row.id, costFromUsage: usage?.reportedCostUsd != null };
}
