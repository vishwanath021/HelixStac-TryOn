import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { actualHeading, capPaise, costSourceLabel, falBilledMegapixels, falPriceListUsd, FLUX3_USD_PER_OUTPUT_MEGAPIXEL, flux3MegapixelsForResolution, flux3UsdForMegapixels, flux3UsdForResolution, matchFalBillingEvents } from "@/lib/ai/cost-source";
import { resolveFalCostKey } from "@/lib/ai/credentials";
import { falBillingLoopStarted, startFalBillingLoop, syncFalBillingCosts, syncFalCostAfterGeneration } from "@/lib/ai/fal-billing";
import { beginPaidCall, finalizePaidCall, spendSummary } from "@/lib/ai/spend";
import { saveFalBillingKey, saveFalKey } from "@/lib/ai/settings-store";
import { costReport } from "@/lib/ai/cost-report";
import { exactInr } from "@/lib/ai/tiers";
import { prisma } from "@/lib/prisma";

describe("cost source", () => {
  afterEach(async () => {
    await prisma.aiCall.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.platformSetting.deleteMany({
      where: {
        key: {
          in: [
            "platform_fal_key_cipher",
            "platform_fal_key_hint",
            "platform_fal_enabled",
            "platform_fal_billing_key_cipher",
            "platform_fal_billing_key_hint",
          ],
        },
      },
    });
    delete process.env.AI_SPEND_CAP_INR;
    delete process.env.FAL_KEY;
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
    expect(FLUX3_USD_PER_OUTPUT_MEGAPIXEL).toBe(0.048);
    expect(falBilledMegapixels(832, 1248)).toBe(1);
    const billedRun = falPriceListUsd({
      model: "blackforestlabs/flux-3/edit-image",
      outputWidth: 832,
      outputHeight: 1248,
      at: new Date("2026-10-10T12:00:00Z"),
    });
    expect(billedRun).toEqual({ usd: flux3UsdForMegapixels((832 * 1248) / 1_000_000), unit: "output megapixels" });
    const larger = falPriceListUsd({
      model: "blackforestlabs/flux-3/edit-image",
      outputWidth: 1024,
      outputHeight: 1536,
    });
    expect(larger?.usd).toBe(flux3UsdForMegapixels((1024 * 1536) / 1_000_000));
    expect(larger?.usd).not.toBe(falBilledMegapixels(1024, 1536) * FLUX3_USD_PER_OUTPUT_MEGAPIXEL);
    expect(falPriceListUsd({ model: "fal-ai/nano-banana-pro/edit", outputWidth: 12, outputHeight: 18 })?.usd).toBe(0.15);
    expect(falPriceListUsd({ model: "openai/gpt-image-2/edit", outputWidth: 1024, outputHeight: 1536 })).toBeNull();
  });

  it("prices flux-3 from the resolution frame, and treats 768sq as an estimate", () => {
    expect(flux3MegapixelsForResolution("768sq")).toBeCloseTo((672 * 880) / 1_000_000, 6);
    expect(flux3MegapixelsForResolution("1k")).toBeCloseTo((880 * 1184) / 1_000_000, 6);
    expect(flux3MegapixelsForResolution("768sq")).toBeCloseTo(0.59, 2);
    expect(flux3MegapixelsForResolution("1k")).toBeCloseTo(1.04, 2);
    const small = flux3UsdForResolution("768sq");
    const full = flux3UsdForResolution("1k");
    expect(small).toBe(flux3UsdForMegapixels((672 * 880) / 1_000_000));
    expect(full).toBe(flux3UsdForMegapixels((880 * 1184) / 1_000_000));
    expect(small).toBeLessThan(full);
    expect(flux3MegapixelsForResolution("2k")).toBeCloseTo(flux3MegapixelsForResolution("1k") * 4, 6);
    expect(flux3MegapixelsForResolution("512sq")).toBeCloseTo(flux3MegapixelsForResolution("1k") / 4, 6);
    expect(flux3UsdForResolution("2k")).toBeGreaterThan(full);
    expect(flux3UsdForResolution("4k")).toBeGreaterThan(flux3UsdForResolution("2k"));
    const downloaded = falPriceListUsd({
      model: "blackforestlabs/flux-3/edit-image",
      outputWidth: 672,
      outputHeight: 880,
    });
    expect(downloaded?.usd).toBe(small);
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
    expect(denied.message).toMatch(/BILLING preset/);
    expect(denied.message).not.toMatch(/Save that ADMIN key as the fal key/);
    const row = await prisma.aiCall.findUnique({ where: { id: reserved.id } });
    expect(row?.costSource).toBe("timeout");
    expect(row?.estimatePaise).toBe(790);
  });

  it("prefers the billing key, matches request_id, and spends the real cost", async () => {
    process.env.AI_SPEND_CAP_INR = "40";
    await saveFalKey({ apiKey: "fal-generation-key-123456", enabled: false, remove: false }, "super");
    await saveFalBillingKey({ apiKey: "fal-billing-key-123456", remove: false }, "super");
    const generation = await prisma.platformSetting.findUnique({ where: { key: "platform_fal_key_cipher" } });
    expect(await resolveFalCostKey()).toEqual({ ok: true, apiKey: "fal-billing-key-123456", source: "billing" });
    const reserved = await beginPaidCall({
      provider: "fal",
      quality: "edit",
      model: "blackforestlabs/flux-3/edit-image",
      tenantId: "cost-billing-key",
      estimateInr: 7.9,
      estimateUsd: 0.05,
    });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    await finalizePaidCall(reserved.id, {
      model: "blackforestlabs/flux-3/edit-image",
      billed: true,
      charged: true,
      costUsd: 0.05,
      estimateInr: 7.9,
      costSource: "price_list",
      providerRequestId: "req-real",
    });
    expect((await spendSummary()).spentInr).toBeCloseTo(exactInr(0.05), 2);
    const urls: string[] = [];
    let auth = "";
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      urls.push(String(url));
      auth = new Headers(init?.headers).get("authorization") || "";
      return new Response(JSON.stringify({
        billing_events: [{
          request_id: "req-real",
          endpoint_id: "blackforestlabs/flux-3",
          timestamp: new Date().toISOString(),
          cost_total: 0.024,
        }],
        has_more: true,
        next_cursor: "more",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const synced = await syncFalCostAfterGeneration("req-real", fetchImpl);
    expect(synced?.usd).toBe(0.024);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("request_id=req-real");
    expect(urls[0]).not.toContain("fal-billing-key");
    expect(auth).toBe("Key fal-billing-key-123456");
    const row = await prisma.aiCall.findUnique({ where: { id: reserved.id } });
    expect(row?.costSource).toBe("billing");
    expect(row?.estimatePaise).toBe(790);
    expect(row?.costInrPaise).toBe(Math.round(exactInr(0.024) * 100));
    expect((await spendSummary()).spentInr).toBeCloseTo(exactInr(0.024), 2);
    const report = await costReport({ filterProvider: "fal" });
    expect(report.last?.sourceLabel).toBe("provider billing API");
    expect(report.last?.actualKnown).toBe(true);
    expect(report.last?.costInr).toBeCloseTo(exactInr(0.024), 2);
    expect(report.last?.chargedInr).toBeCloseTo(exactInr(0.024), 2);
    expect(report.last?.estimateInr).toBeCloseTo(7.9, 2);
    expect(report.spentInr).toBeCloseTo(exactInr(0.024), 2);
    const kept = await prisma.platformSetting.findUnique({ where: { key: "platform_fal_key_cipher" } });
    expect(kept?.value).toBe(generation?.value);
    await saveFalBillingKey({ apiKey: "", remove: true }, "super");
    expect(await resolveFalCostKey()).toEqual({ ok: false, reason: "off" });
  });

  it("falls back to the generation key and does not call fal when neither key is saved", async () => {
    await saveFalKey({ apiKey: "fal-generation-key-123456", enabled: true, remove: false }, "super");
    let auth = "";
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("authorization") || "";
      return new Response(JSON.stringify({ billing_events: [], has_more: false }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const reserved = await beginPaidCall({
      provider: "fal",
      quality: "edit",
      model: "blackforestlabs/flux-3/edit-image",
      tenantId: "cost-fallback",
      estimateInr: 1,
    });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    await finalizePaidCall(reserved.id, {
      model: "blackforestlabs/flux-3/edit-image",
      billed: true,
      charged: true,
      costUsd: 0.02,
      costSource: "price_list",
      providerRequestId: "req-fallback",
    });
    const fallback = await syncFalBillingCosts({ fetchImpl, requestIds: ["req-fallback"] });
    expect(fallback.ok).toBe(true);
    expect(auth).toBe("Key fal-generation-key-123456");
    await saveFalKey({ apiKey: "", enabled: false, remove: true }, "super");
    delete process.env.FAL_KEY;
    let calls = 0;
    const missing = await syncFalBillingCosts({
      fetchImpl: (async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(calls).toBe(0);
    expect(missing.message).toMatch(/BILLING preset/);
    startFalBillingLoop();
    expect(falBillingLoopStarted()).toBe(false);
    const form = readFileSync("src/components/admin/SuperAiForm.tsx", "utf8");
    expect(form).toContain('aria-label="fal billing key"');
    expect(form).toContain("falBillingOnly");
    expect(readFileSync("src/instrumentation.ts", "utf8")).toContain("startFalBillingLoop");
    expect(readFileSync("src/lib/ai/reference-run.ts", "utf8")).toContain("syncFalCostAfterGeneration");
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
