import { actualIsKnown, matchFalBillingEvents, type FalBillingEvent } from "@/lib/ai/cost-source";
import { resolveFalCostKey } from "@/lib/ai/credentials";
import { exactInr } from "@/lib/ai/tiers";
import { prisma } from "@/lib/prisma";

const BILLING_URL = "https://api.fal.ai/v1/models/billing-events";

/**
 * billing-events accepts a BILLING preset key (read-only) or FULL.
 * The generation key is API-scoped and is refused with 403. Do not replace it with this key.
 */
export const FAL_BILLING_KEY_NOTE =
  "fal's billing-events API needs a separate key on the read-only BILLING preset. The generation key can run models and gets 403 on GET https://api.fal.ai/v1/models/billing-events. Save the billing key on AI settings, then sync again. Docs: https://fal.ai/docs/platform-apis/v1/models/billing-events";

/** @deprecated Use FAL_BILLING_KEY_NOTE. The generation key stays API-scoped. */
export const FAL_BILLING_ADMIN_NOTE = FAL_BILLING_KEY_NOTE;

const NO_KEY_NOTE =
  "Save a fal billing key (read-only BILLING preset) on AI settings. Sync uses that key when it is saved, and the generation key only when it is not. An API-scoped generation key cannot read billing-events.";

type FetchImpl = typeof fetch;

function eventUsd(raw: { cost_total?: unknown; cost_estimate_nano_usd?: unknown }) {
  if (typeof raw.cost_total === "number" && Number.isFinite(raw.cost_total) && raw.cost_total >= 0) return raw.cost_total;
  if (typeof raw.cost_estimate_nano_usd === "number" && Number.isFinite(raw.cost_estimate_nano_usd) && raw.cost_estimate_nano_usd >= 0) {
    return raw.cost_estimate_nano_usd / 1_000_000_000;
  }
  return null;
}

function readEvents(payload: unknown): FalBillingEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const list = (payload as { billing_events?: unknown }).billing_events;
  if (!Array.isArray(list)) return [];
  const events: FalBillingEvent[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as { request_id?: unknown; endpoint_id?: unknown; timestamp?: unknown; cost_total?: unknown; cost_estimate_nano_usd?: unknown };
    const usd = eventUsd(row);
    if (typeof row.request_id !== "string" || typeof row.endpoint_id !== "string" || typeof row.timestamp !== "string" || usd == null) continue;
    events.push({ request_id: row.request_id, endpoint_id: row.endpoint_id, timestamp: row.timestamp, cost_total: usd });
  }
  return events;
}

async function fetchPages(args: {
  apiKey: string;
  fetchImpl: FetchImpl;
  params: URLSearchParams;
  maxPages: number;
  timeoutMs: number;
}): Promise<{ ok: true; events: FalBillingEvent[] } | { ok: false; status: number }> {
  const events: FalBillingEvent[] = [];
  let cursor = "";
  for (let page = 0; page < args.maxPages; page += 1) {
    const params = new URLSearchParams(args.params);
    params.set("limit", args.maxPages === 1 ? "50" : "100");
    if (cursor) params.set("cursor", cursor);
    let response: Response;
    try {
      response = await args.fetchImpl(`${BILLING_URL}?${params.toString()}`, {
        headers: { Authorization: `Key ${args.apiKey}` },
        signal: AbortSignal.timeout(args.timeoutMs),
      });
    } catch {
      return { ok: false, status: 0 };
    }
    if (response.status === 401 || response.status === 403) return { ok: false, status: response.status };
    if (!response.ok) return { ok: false, status: response.status };
    const payload = (await response.json().catch(() => null)) as { next_cursor?: unknown; has_more?: unknown } | null;
    events.push(...readEvents(payload));
    const next = payload && typeof payload.next_cursor === "string" ? payload.next_cursor : "";
    if (!payload?.has_more || !next) break;
    cursor = next;
  }
  return { ok: true, events };
}

export async function syncFalBillingCosts(args: {
  apiKey?: string;
  fetchImpl?: FetchImpl;
  now?: Date;
  /** One billing-events call filtered by these ids. Skips the historical crawl. */
  requestIds?: string[];
  timeoutMs?: number;
} = {}) {
  const requestIds = [...new Set((args.requestIds ?? []).map((id) => id.trim()).filter(Boolean))].slice(0, 50);
  const cheap = requestIds.length > 0;
  let apiKey = args.apiKey?.trim() || "";
  if (!apiKey) {
    const resolved = await resolveFalCostKey();
    if (!resolved.ok) {
      const message = resolved.reason === "off"
        ? "The generation key is saved and off, and no fal billing key is saved. Save a read-only BILLING preset key on AI settings, then sync again."
        : NO_KEY_NOTE;
      return { ok: false as const, status: 400, message, updated: 0 };
    }
    apiKey = resolved.apiKey;
  }
  const fetchImpl = args.fetchImpl ?? fetch;
  const now = args.now ?? new Date();
  const rows = await prisma.aiCall.findMany({
    where: {
      provider: "fal",
      charged: true,
      costSource: { not: "manual" },
      ...(cheap ? { providerRequestId: { in: requestIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return { ok: true as const, updated: 0, applied: [], message: "No fal ledger rows to sync." };
  const oldest = rows[0].createdAt.getTime();
  const start = new Date(Math.max(oldest - 60 * 60 * 1000, now.getTime() - 89 * 24 * 60 * 60 * 1000));
  const end = new Date(now.getTime() + 60 * 1000);
  const params = new URLSearchParams();
  params.set("start", start.toISOString());
  params.set("end", end.toISOString());
  if (cheap) params.set("request_id", requestIds.join(","));
  const fetched = await fetchPages({
    apiKey,
    fetchImpl,
    params,
    maxPages: cheap ? 1 : 20,
    timeoutMs: args.timeoutMs ?? (cheap ? 8_000 : 20_000),
  });
  if (!fetched.ok) {
    if (fetched.status === 401 || fetched.status === 403) {
      return { ok: false as const, status: 403, message: FAL_BILLING_KEY_NOTE, updated: 0 };
    }
    return { ok: false as const, status: 502, message: "fal billing events did not answer. No ledger row was changed.", updated: 0 };
  }
  const pairs = matchFalBillingEvents(
    rows.map((row) => ({ id: row.id, model: row.model, createdAt: row.createdAt, providerRequestId: row.providerRequestId })),
    fetched.events,
  );
  const applied: { rowId: string; requestId: string; usd: number }[] = [];
  for (const pair of pairs) {
    const inr = exactInr(pair.usd);
    await prisma.aiCall.update({
      where: { id: pair.rowId },
      data: {
        costUsdMicros: Math.round(pair.usd * 1_000_000),
        costInrPaise: Math.round(inr * 100),
        costSource: "billing",
        providerRequestId: pair.requestId,
        billed: true,
        charged: true,
      },
    });
    applied.push(pair);
  }
  const skipped = rows.filter((row) => !pairs.some((pair) => pair.rowId === row.id) && !actualIsKnown(row.costSource)).length;
  const message = pairs.length
    ? `Updated ${pairs.length} fal row${pairs.length === 1 ? "" : "s"} from cost_total.`
    : "fal returned no billing event that matched a ledger row.";
  return { ok: true as const, updated: pairs.length, unmatched: skipped, applied, message };
}

/** One request_id lookup after a generation. A miss or a 403 leaves the price-list figure in place. */
export async function syncFalCostAfterGeneration(requestId: string, fetchImpl?: FetchImpl) {
  const id = requestId.trim();
  if (!id) return null;
  try {
    const synced = await syncFalBillingCosts({ requestIds: [id], fetchImpl, timeoutMs: 8_000 });
    if (!synced.ok || synced.updated < 1) return null;
    return synced.applied.find((row) => row.requestId === id) ?? synced.applied[0] ?? null;
  } catch {
    return null;
  }
}

let billingTimer: ReturnType<typeof setInterval> | null = null;
let billingRunning = false;

async function runScheduledFalBilling() {
  if (billingRunning) return;
  billingRunning = true;
  try {
    await syncFalBillingCosts();
  } catch {
    // The next hour retries. A missing key or a 403 must not crash the process.
  } finally {
    billingRunning = false;
  }
}

/** Hourly billing-events sync. Skipped under vitest so tests do not call fal. */
export function falBillingLoopStarted() {
  return Boolean(billingTimer);
}

export function startFalBillingLoop() {
  if (billingTimer || process.env.NODE_ENV === "test") return;
  void runScheduledFalBilling();
  billingTimer = setInterval(() => {
    void runScheduledFalBilling();
  }, 60 * 60 * 1000);
  billingTimer.unref?.();
}
