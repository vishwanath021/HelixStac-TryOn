import { actualIsKnown, matchFalBillingEvents, type FalBillingEvent } from "@/lib/ai/cost-source";
import { exactInr } from "@/lib/ai/tiers";
import { prisma } from "@/lib/prisma";

const BILLING_URL = "https://api.fal.ai/v1/models/billing-events";

/** billing-events is adminApiKey. An API-scoped key is refused. An ADMIN key can also run models. */
export const FAL_BILLING_ADMIN_NOTE =
  "fal's billing-events API needs an ADMIN-scoped key. An API-scoped key can run models and cannot read GET https://api.fal.ai/v1/models/billing-events. An ADMIN key can do both. Save that ADMIN key as the fal key on this page, then sync again. Docs: https://fal.ai/docs/platform-apis/v1/models/billing-events";

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
}): Promise<{ ok: true; events: FalBillingEvent[] } | { ok: false; status: number }> {
  const events: FalBillingEvent[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams(args.params);
    params.set("limit", "100");
    if (cursor) params.set("cursor", cursor);
    let response: Response;
    try {
      response = await args.fetchImpl(`${BILLING_URL}?${params.toString()}`, {
        headers: { Authorization: `Key ${args.apiKey}` },
        signal: AbortSignal.timeout(20_000),
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

export async function syncFalBillingCosts(args: { apiKey: string; fetchImpl?: FetchImpl; now?: Date }) {
  const fetchImpl = args.fetchImpl ?? fetch;
  const now = args.now ?? new Date();
  const rows = await prisma.aiCall.findMany({
    where: { provider: "fal", charged: true, costSource: { not: "manual" } },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return { ok: true as const, updated: 0, message: "No fal ledger rows to sync." };
  const oldest = rows[0].createdAt.getTime();
  const start = new Date(Math.max(oldest - 60 * 60 * 1000, now.getTime() - 89 * 24 * 60 * 60 * 1000));
  const end = new Date(now.getTime() + 60 * 1000);
  const params = new URLSearchParams();
  params.set("start", start.toISOString());
  params.set("end", end.toISOString());
  const fetched = await fetchPages({ apiKey: args.apiKey, fetchImpl, params });
  if (!fetched.ok) {
    if (fetched.status === 401 || fetched.status === 403) {
      return { ok: false as const, status: 403, message: FAL_BILLING_ADMIN_NOTE };
    }
    return { ok: false as const, status: 502, message: "fal billing events did not answer. No ledger row was changed." };
  }
  const pairs = matchFalBillingEvents(
    rows.map((row) => ({ id: row.id, model: row.model, createdAt: row.createdAt, providerRequestId: row.providerRequestId })),
    fetched.events,
  );
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
  }
  const skipped = rows.filter((row) => !pairs.some((pair) => pair.rowId === row.id) && !actualIsKnown(row.costSource)).length;
  const message = pairs.length
    ? `Updated ${pairs.length} fal row${pairs.length === 1 ? "" : "s"} from cost_total.`
    : "fal returned no billing event that matched a ledger row.";
  return { ok: true as const, updated: pairs.length, unmatched: skipped, message };
}
