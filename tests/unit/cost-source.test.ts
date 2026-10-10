import { afterEach, describe, expect, it } from "vitest";
import { actualHeading, capPaise, costSourceLabel, falBilledMegapixels, falPriceListUsd, FLUX3_USD_PER_OUTPUT_MEGAPIXEL, matchFalBillingEvents } from "@/lib/ai/cost-source";
import { syncFalBillingCosts } from "@/lib/ai/fal-billing";
import { beginPaidCall, finalizePaidCall, spendSummary } from "@/lib/ai/spend";
import { costReport } from "@/lib/ai/cost-report";
import { exactInr } from "@/lib/ai/tiers";
import { prisma } from "@/lib/prisma";

describe("cost source", () => {
  afterEach(async () => {
    await prisma.aiCall.deleteMany();
    await prisma.auditLog.deleteMany();
    delete process.env.AI_SPEND_CAP_INR;
  });

  it("labels provider usage, the billing API, the price list, and a timeout", () => {
    expect(costSourceLabel("usage")).toBe("provider usage");
    expect(actualHeading("usage")).toBe("Actual (from provider usage)");
    expect(costSourceLabel("billing")).toBe("provider billing API");
    expect(costSourceLabel("price_list")).toBe("computed from price list");
    expect(actualHeading("price_list")).toBe("Actual (computed from fal price list)");
    expect(costSourceLabel("timeout")).toBe("unknown - timeout");
    expect(costSourceLabel("estimate", "UNCERTAIN")).toBe("unknown - timeout");
    expect(capPaise({ estimatePaise: 790, costInrPaise: 230, costSource: "billing", charged: true })).toBe(230);
    expect(capPaise({ estimatePaise: 790, costInrPaise: 0, costSource: "timeout", charged: true })).toBe(790);
  });

  it("computes fal actual from the documented unit and the downloaded size", () => {
    expect(FLUX3_USD_PER_OUTPUT_MEGAPIXEL).toBe(0.024);
    expect(falBilledMegapixels(832, 1248)).toBe(1);
    const billedRun = falPriceListUsd({
      model: "blackforestlabs/flux-3/edit-image",
      outputWidth: 832,
      outputHeight: 1248,
      at: new Date("2026-10-10T12:00:00Z"),
    });
    expect(billedRun).toEqual({ usd: 0.024, unit: "output megapixels" });
    const larger = falPriceListUsd({
      model: "blackforestlabs/flux-3/edit-image",
      outputWidth: 1024,
      outputHeight: 1536,
    });
    expect(larger?.usd).toBe(falBilledMegapixels(1024, 1536) * FLUX3_USD_PER_OUTPUT_MEGAPIXEL);
    expect(falPriceListUsd({ model: "fal-ai/nano-banana-pro/edit", outputWidth: 12, outputHeight: 18 })?.usd).toBe(0.15);
    expect(falPriceListUsd({ model: "openai/gpt-image-2/edit", outputWidth: 1024, outputHeight: 1536 })).toBeNull();
  });

  it("matches a billing event by request id even when the status path would differ", () => {
    const createdAt = new Date("2026-10-06T10:00:00Z");
    const pairs = matchFalBillingEvents(
      [
        { id: "row-flux", model: "blackforestlabs/flux-3/edit-image", createdAt, providerRequestId: "req-flux" },
        { id: "row-old", model: "blackforestlabs/flux-3/edit-image", createdAt: new Date("2026-10-06T10:05:00Z"), providerRequestId: "" },
        { id: "row-other", model: "blackforestlabs/flux-3/edit-image", createdAt: new Date("2026-10-06T10:06:00Z"), providerRequestId: "" },
      ],
      [
        { request_id: "req-flux", endpoint_id: "blackforestlabs/flux-3", timestamp: "2026-10-06T10:00:30Z", cost_total: 0.024 },
        { request_id: "req-ambiguous-a", endpoint_id: "blackforestlabs/flux-3/edit-image", timestamp: "2026-10-06T10:05:10Z", cost_total: 0.03 },
        { request_id: "req-ambiguous-b", endpoint_id: "blackforestlabs/flux-3/edit-image", timestamp: "2026-10-06T10:05:40Z", cost_total: 0.031 },
      ],
    );
    expect(pairs).toEqual([{ rowId: "row-flux", requestId: "req-flux", usd: 0.024 }]);
  });

  it("matches one open row to one event by endpoint and time", () => {
    const pairs = matchFalBillingEvents(
      [{ id: "row-seed", model: "fal-ai/bytedance/seedream/v4/edit", createdAt: new Date("2026-10-05T08:00:00Z"), providerRequestId: "" }],
      [{ request_id: "req-seed", endpoint_id: "fal-ai/bytedance", timestamp: "2026-10-05T08:02:00Z", cost_total: 0.03 }],
    );
    expect(pairs).toEqual([{ rowId: "row-seed", requestId: "req-seed", usd: 0.03 }]);
  });

  it("keeps the reserved estimate and syncs cost_total from fal billing", async () => {
    process.env.AI_SPEND_CAP_INR = "40";
    const reserved = await beginPaidCall({
      provider: "fal",
      quality: "edit",
      model: "blackforestlabs/flux-3/edit-image",
      tenantId: "cost-sync",
      estimateInr: 7.9,
      estimateUsd: 0.076,
    });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    await finalizePaidCall(reserved.id, {
      model: "blackforestlabs/flux-3/edit-image",
      billed: true,
      charged: true,
      costUsd: 0,
      estimateInr: 7.9,
      costSource: "timeout",
      providerRequestId: "req-billed",
    });
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({
        billing_events: [{
          request_id: "req-billed",
          endpoint_id: "blackforestlabs/flux-3",
          timestamp: new Date().toISOString(),
          cost_total: 0.024,
          cost_estimate_nano_usd: 24_000_000,
        }],
        has_more: false,
        next_cursor: null,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const synced = await syncFalBillingCosts({ apiKey: "fal-test-key", fetchImpl });
    expect(synced.ok).toBe(true);
    if (!synced.ok) return;
    expect(synced.updated).toBe(1);
    expect(calls[0]).toContain("https://api.fal.ai/v1/models/billing-events");
    expect(calls[0]).not.toContain("fal-test-key");
    const billed = await prisma.aiCall.findUnique({ where: { id: reserved.id } });
    expect(billed?.estimatePaise).toBe(790);
    expect(billed?.costSource).toBe("billing");
    expect(billed?.costUsdMicros).toBe(24_000);
    expect(billed?.costInrPaise).toBe(Math.round(exactInr(0.024) * 100));
    const summary = await spendSummary();
    expect(summary.spentInr).toBeCloseTo(exactInr(0.024), 2);
    const row = await prisma.aiCall.findUnique({ where: { id: reserved.id } });
    expect(row?.estimatePaise).toBe(790);
    expect(row?.costSource).toBe("billing");
  });

  it("does not change the ledger when fal refuses an API-scoped key", async () => {
    process.env.AI_SPEND_CAP_INR = "40";
    const reserved = await beginPaidCall({
      provider: "fal",
      quality: "edit",
      model: "blackforestlabs/flux-3/edit-image",
      tenantId: "cost-denied",
      estimateInr: 7.9,
    });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    await finalizePaidCall(reserved.id, {
      model: "blackforestlabs/flux-3/edit-image",
      billed: true,
      charged: true,
      costUsd: 0,
      costSource: "timeout",
      providerRequestId: "req-denied",
    });
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { message: "forbidden" } }), { status: 403 })) as typeof fetch;
    const denied = await syncFalBillingCosts({ apiKey: "api-scoped-key", fetchImpl });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.message).toMatch(/ADMIN-scoped/);
    const row = await prisma.aiCall.findUnique({ where: { id: reserved.id } });
    expect(row?.costSource).toBe("timeout");
    expect(row?.estimatePaise).toBe(790);
  });

  it("pages twenty image rows newest first and totals estimate against actual", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      provider: index % 2 === 0 ? "fal" : "openai",
      quality: "edit",
      model: index % 2 === 0 ? "flux-edit" : "other-model",
      estimatePaise: 100,
      costInrPaise: index % 2 === 0 ? 80 : 0,
      costSource: index % 2 === 0 ? "billing" : "estimate",
      status: "SUCCEEDED",
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, index)),
    }));
    await prisma.aiCall.createMany({ data: rows });
    const first = await costReport({ page: 1, pageSize: 20, from: new Date("2026-10-01T00:00:00.000Z"), to: new Date("2026-10-01T23:59:59.999Z") });
    expect(first.pageSize).toBe(20);
    expect(first.calls).toHaveLength(20);
    expect(first.totalCount).toBe(25);
    expect(first.pageCount).toBe(2);
    expect(new Date(first.calls[0].at).getTime()).toBeGreaterThan(new Date(first.calls[19].at).getTime());
    expect(first.totals).toEqual({ estimateInr: 25, actualInr: 10.4, actualCount: 13 });
    const second = await costReport({ page: 2, pageSize: 20, from: new Date("2026-10-01T00:00:00.000Z"), to: new Date("2026-10-01T23:59:59.999Z") });
    expect(second.calls).toHaveLength(5);
    const filtered = await costReport({
      filterProvider: "openai",
      filterModel: "other",
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-10-01T23:59:59.999Z"),
    });
    expect(filtered.totalCount).toBe(12);
    expect(filtered.calls.every((row) => row.provider === "openai" && row.model.includes("other"))).toBe(true);
    expect(filtered.totals.actualCount).toBe(0);
  });
});
