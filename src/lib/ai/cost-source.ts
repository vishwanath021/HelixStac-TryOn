/** How a ledger actual was obtained. The reserved estimate stays in estimatePaise. */

export const KNOWN_ACTUAL_SOURCES = ["usage", "billing", "price_list", "manual"] as const;

export function actualIsKnown(source: string) {
  return (KNOWN_ACTUAL_SOURCES as readonly string[]).includes(source);
}

/** Paise counted against the spend cap. Actual replaces the reservation once it is known. */
export function capPaise(row: { estimatePaise: number; costInrPaise: number; costSource: string; charged: boolean }) {
  if (!row.charged) return 0;
  if (actualIsKnown(row.costSource)) return row.costInrPaise;
  return row.estimatePaise;
}

export function costSourceLabel(source: string, status = "") {
  if (source === "usage") return "provider usage";
  if (source === "billing") return "provider billing API";
  if (source === "price_list") return "computed from price list";
  if (source === "manual") return "manual correction";
  if (source === "timeout" || status === "UNCERTAIN") return "unknown - timeout";
  return "unknown";
}

export function actualHeading(source: string) {
  if (source === "usage") return "Actual (from provider usage)";
  if (source === "billing") return "Actual (from provider billing API)";
  if (source === "price_list") return "Actual (computed from fal price list)";
  if (source === "manual") return "Actual (manual correction)";
  return "Actual";
}

function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function megapixels(width: number, height: number) {
  return (width * height) / 1_000_000;
}

/**
 * Dollars per output megapixel for blackforestlabs/flux-3/edit-image.
 * One value. Change it here if fal raises the rate.
 * An Oct 10 2026 dashboard charge for 832×1248 was $0.024, counted as 1.00 MP.
 */
export const FLUX3_USD_PER_OUTPUT_MEGAPIXEL = 0.024;

/**
 * fal bills whole output megapixels: width×height/1_000_000, rounded to the nearest
 * megapixel, and never below 1. 832×1248 is 1.038 MP and bills as 1.00.
 */
export function falBilledMegapixels(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return 1;
  return Math.max(1, Math.round(megapixels(width, height)));
}

const PER_IMAGE: Record<string, number> = {
  "fal-ai/nano-banana-pro/edit": 0.15,
  "fal-ai/nano-banana-2/edit": 0.08,
  "bytedance/seedream/v5/lite/edit": 0.035,
  "fal-ai/nano-banana/edit": 0.039,
};

const PER_OUTPUT_MP: Record<string, number> = {
  "fal-ai/flux-2/edit": 0.012,
  "fal-ai/flux-2/klein/9b/edit": 0.011,
  "fal-ai/qwen-image-edit-2511": 0.03,
  "fal-ai/flux-2/klein/4b/edit": 0.01,
};

/**
 * Documented unit price times the real output unit.
 * Per-image models bill one image. Megapixel models bill the downloaded width times height.
 * Inputs are omitted: the pages that mention them do not say how fal rounds them, and the billing API is the invoice.
 * openai/gpt-image-2/edit is token-billed, so this returns null.
 * flux-3 uses FLUX3_USD_PER_OUTPUT_MEGAPIXEL and fal's whole-megapixel count.
 */
export function falPriceListUsd(args: {
  model: string;
  outputWidth: number;
  outputHeight: number;
  at?: Date;
}): { usd: number; unit: "image" | "output megapixels" } | null {
  const width = args.outputWidth;
  const height = args.outputHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  const perImage = PER_IMAGE[args.model];
  if (perImage != null) return { usd: perImage, unit: "image" };
  const outMp = megapixels(width, height);
  if (args.model === "blackforestlabs/flux-3/edit-image") {
    return { usd: roundUsd(falBilledMegapixels(width, height) * FLUX3_USD_PER_OUTPUT_MEGAPIXEL), unit: "output megapixels" };
  }
  if (args.model === "fal-ai/flux-2-pro/edit") {
    const units = Math.max(1, Math.ceil(outMp - 1e-9));
    return { usd: roundUsd(0.03 + Math.max(0, units - 1) * 0.015), unit: "output megapixels" };
  }
  const rate = PER_OUTPUT_MP[args.model];
  if (rate == null) return null;
  return { usd: roundUsd(outMp * rate), unit: "output megapixels" };
}

export type FalBillingEvent = {
  request_id: string;
  endpoint_id: string;
  timestamp: string;
  cost_total: number;
};

const MATCH_WINDOW_MS = 70 * 60 * 1000;

function sameEndpoint(eventEndpoint: string, model: string) {
  if (eventEndpoint === model) return true;
  const app = model.split("/").filter(Boolean).slice(0, 2).join("/");
  return Boolean(app) && eventEndpoint === app;
}

/**
 * Pair ledger rows with fal billing events.
 * A stored request id wins. A row without one matches only when a single unused event
 * shares the endpoint and falls inside 70 minutes, and no other open row is in that window.
 */
export function matchFalBillingEvents(
  rows: { id: string; model: string; createdAt: Date; providerRequestId: string }[],
  events: FalBillingEvent[],
): { rowId: string; requestId: string; usd: number }[] {
  const used = new Set<string>();
  const matched = new Map<string, { rowId: string; requestId: string; usd: number }>();
  for (const row of rows) {
    const requestId = row.providerRequestId.trim();
    if (!requestId) continue;
    const event = events.find((item) => item.request_id === requestId);
    if (!event || used.has(event.request_id)) continue;
    used.add(event.request_id);
    matched.set(row.id, { rowId: row.id, requestId: event.request_id, usd: event.cost_total });
  }
  const open = rows.filter((row) => !row.providerRequestId.trim() && !matched.has(row.id));
  for (const row of open) {
    const candidates = events.filter((event) => {
      if (used.has(event.request_id) || !sameEndpoint(event.endpoint_id, row.model)) return false;
      const at = Date.parse(event.timestamp);
      return Number.isFinite(at) && Math.abs(at - row.createdAt.getTime()) <= MATCH_WINDOW_MS;
    });
    if (candidates.length !== 1) continue;
    const event = candidates[0];
    const rivals = open.filter((other) => {
      if (other.id === row.id || !sameEndpoint(event.endpoint_id, other.model)) return false;
      const at = Date.parse(event.timestamp);
      return Math.abs(at - other.createdAt.getTime()) <= MATCH_WINDOW_MS;
    });
    if (rivals.length > 0) continue;
    used.add(event.request_id);
    matched.set(row.id, { rowId: row.id, requestId: event.request_id, usd: event.cost_total });
  }
  return [...matched.values()];
}
