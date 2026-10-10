import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { benchmarkDir, prepareBenchmark, restoredFromProvider, writeBenchmarkStages } from "@/lib/ai/benchmark";
import { prepareComparison } from "@/lib/ai/compare-models";
import type { AskedTexture } from "@/lib/ai/reference-texture";
import { reviewProviderFace } from "@/lib/face/compose-hair";
import type { DriftReport } from "@/lib/face/hair-composite";
import { assessClothing } from "@/lib/ai/clothing-check";
import { resolveFalKey, resolveGeminiKey, resolveOpenAIKey, resolveOpenRouterKey } from "@/lib/ai/credentials";
import { postFalReferenceEdit } from "@/lib/ai/fal-reference";
import { postOpenRouterReferenceEdit } from "@/lib/ai/openrouter-reference";
import type { EditQuality, EditSize } from "@/lib/ai/edit-request";
import { editFormFields } from "@/lib/ai/edit-request";
import { postGeminiReferenceEdit } from "@/lib/ai/gemini-reference";
import { BilledProviderError, UnbilledProviderError, UncertainBillingError, UnknownModelError } from "@/lib/ai/errors";
import { postImageEdit } from "@/lib/ai/openai";
import { completeGenerationJob, failGenerationJob } from "@/lib/ai/dedupe";
import { actualHeading, costSourceLabel, falPriceListUsd } from "@/lib/ai/cost-source";
import { beginPaidCall, finalizePaidCall, releasePaidCall } from "@/lib/ai/spend";
import { costUsdFromUsage, exactInr, type UsageNumbers } from "@/lib/ai/tiers";
import { numberEnv } from "@/lib/env";
import { logProviderCall } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

function usageFrom(payload: {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { text_tokens?: number; image_tokens?: number };
  };
}): UsageNumbers | undefined {
  const usage = payload.usage;
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    textTokens: usage.input_tokens_details?.text_tokens,
    imageTokens: usage.input_tokens_details?.image_tokens,
  };
}

export async function purgeOldBenchmarks() {
  const hours = Math.max(1, numberEnv("BENCHMARK_RETENTION_HOURS", 72));
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const stale = await prisma.benchmarkRun.findMany({ where: { createdAt: { lt: cutoff } }, take: 20 });
  for (const row of stale) {
    await rm(row.dir, { recursive: true, force: true }).catch(() => undefined);
    await prisma.benchmarkRun.delete({ where: { id: row.id } }).catch(() => undefined);
  }
}

export type ReferenceSuccess = {
  ok: true;
  id: string;
  callId: string;
  provider: "openai" | "gemini" | "fal" | "openrouter";
  model: string;
  quality: string;
  size: string;
  estimateInr: number;
  estimateUsd: number;
  actualInr: number;
  actualUsd: number;
  latencyMs: number;
  usage: UsageNumbers | null;
  clothingWarning: string;
  imagePng: Buffer;
  rawFaceDrift: boolean;
  faceScore: number | null;
  message: string;
  costSource: string;
  actualKnown: boolean;
};

export type ReferenceFailure = {
  ok: false;
  httpStatus: number;
  error: string;
  message: string;
  outcome: "quote" | "key" | "spend-cap" | "uncertain" | "provider";
  id?: string;
  callId?: string;
};

/**
 * One gpt-image reference edit. No mask, no face paste, no retry.
 * The ₹30 run cap is inside the quote. The ₹500 ledger cap is beginPaidCall.
 */
export async function executeReferenceEdit(args: {
  jpeg: Buffer;
  original: Buffer;
  styleId: string;
  tenantId: string;
  source: "benchmark" | "tryon";
  tool: string;
  hairTexture?: AskedTexture;
  modelId?: string;
  quality?: EditQuality;
}): Promise<ReferenceSuccess | ReferenceFailure> {
  await purgeOldBenchmarks().catch(() => undefined);
  const requestedModel = args.modelId?.trim() || "";
  const prepared = requestedModel
    ? await prepareComparison({ jpeg: args.jpeg, styleId: args.styleId, texture: args.hairTexture, modelId: requestedModel, quality: args.quality })
    : await prepareBenchmark({ jpeg: args.jpeg, styleId: args.styleId, texture: args.hairTexture });
  if (!prepared.ok) {
    return { ok: false, httpStatus: 400, error: "QUOTE", message: prepared.message, outcome: "quote" };
  }
  const provider = "provider" in prepared ? prepared.provider : "openai";
  let apiKey: string | null = null;
  if (provider === "gemini") apiKey = await resolveGeminiKey();
  else if (provider === "fal") {
    const fal = await resolveFalKey();
    if (!fal.ok) {
      return {
        ok: false,
        httpStatus: 400,
        error: "NO_FAL_KEY",
        outcome: "key",
        message: fal.reason === "off"
          ? "The fal key is saved and comparisons are off. Enable it on AI settings. This comparison does not call OpenAI or Gemini instead."
          : "Add a fal key on AI settings and enable it. This comparison does not call OpenAI or Gemini instead.",
      };
    }
    apiKey = fal.apiKey;
  } else if (provider === "openrouter") {
    const openrouter = await resolveOpenRouterKey();
    if (!openrouter.ok) {
      return {
        ok: false,
        httpStatus: 400,
        error: "NO_OPENROUTER_KEY",
        outcome: "key",
        message: openrouter.reason === "off"
          ? "The OpenRouter key is saved and comparisons are off. Enable it on AI settings. This comparison does not call OpenAI, Gemini, or fal instead."
          : "Add an OpenRouter key on AI settings and enable it. This comparison does not call OpenAI, Gemini, or fal instead.",
      };
    }
    apiKey = openrouter.apiKey;
  } else apiKey = await resolveOpenAIKey();
  if (!apiKey) {
    return provider === "gemini"
      ? {
          ok: false,
          httpStatus: 400,
          error: "NO_GEMINI_KEY",
          outcome: "key",
          message: "Add a Gemini key on AI settings. This comparison does not call OpenAI instead.",
        }
      : {
          ok: false,
          httpStatus: 400,
          error: "NO_OPENAI_KEY",
          outcome: "key",
          message: "Add an OpenAI key on AI settings. Reference mode does not call Gemini, a mock, or another model.",
        };
  }

  const { quote, planned, fitted, reference, style } = prepared;
  const inputPng = fitted?.png ?? ("selfiePng" in prepared ? prepared.selfiePng : Buffer.alloc(0));
  const inputMeta = await sharp(inputPng, { failOn: "none" }).metadata();
  const transform = fitted?.transform ?? {
    sourceWidth: inputMeta.width || 1,
    sourceHeight: inputMeta.height || 1,
    targetWidth: inputMeta.width || 1,
    targetHeight: inputMeta.height || 1,
    contentWidth: inputMeta.width || 1,
    contentHeight: inputMeta.height || 1,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  };
  const gate = await beginPaidCall({
    provider,
    quality: quote.quality,
    model: quote.model,
    tenantId: args.tenantId,
    tool: args.tool,
    tier: args.source,
    imageSize: quote.size,
    estimateInr: quote.estimateInr,
    estimateUsd: quote.estimateUsd,
  });
  if (!gate.ok) {
    return {
      ok: false,
      httpStatus: 402,
      error: "SPEND_CAP",
      outcome: "spend-cap",
      message: "The testing spend cap would be exceeded. No reference call was made.",
    };
  }

  const id = randomUUID();
  const dir = benchmarkDir(id);
  const validation = {
    label: "unvalidated model output",
    compositeApplied: false,
    maskSent: false,
    faceBlobUsedAsGate: false,
    accepted: false,
    source: args.source,
    model: quote.model,
    quality: quote.quality,
    size: quote.size,
    inputFidelity: quote.inputFidelity || "omitted",
    provider,
    outputFormat: "png",
    referencePixels: { width: prepared.referenceWidth, height: prepared.referenceHeight },
    note: "The skin-colour face blob was not used. Alignment is not a haircut score. No original face was pasted back.",
    hairCompositeRequested: false,
    hairTexture: prepared.texture,
    referenceTexture: prepared.referenceTexture,
    textureWarning: prepared.textureWarning,
    referenceFile: prepared.referenceFile,
  };
  await writeBenchmarkStages(dir, {
    original: args.original,
    sanitized: args.jpeg,
    providerInput: inputPng,
    reference,
    validation,
    transform,
  });
  await prisma.benchmarkRun.create({
    data: {
      id,
      styleId: style.id,
      model: quote.model,
      quality: quote.quality,
      size: quote.size,
      status: "PENDING",
      estimateInr: quote.estimateInr,
      estimateUsd: quote.estimateUsd,
      callId: gate.id,
      dir,
      source: args.source,
    },
  });

  let recordedSize = quote.size;
  let providerRequestId = "";
  let openRouterCostReport: "usage.cost" | "generation" | "none" | "" = "";
  let falComputedUsd: number | null = null;
  const started = Date.now();
  try {
    let usage: ReturnType<typeof usageFrom>;
    let providerResponse: Buffer;
    if (provider === "gemini") {
      const prompt = "prompt" in prepared ? prepared.prompt : planned?.prompt || "";
      const gemini = await postGeminiReferenceEdit({
        apiKey,
        model: quote.model,
        prompt,
        selfiePng: inputPng,
        referenceJpeg: reference,
      });
      usage = gemini.usage;
      providerResponse = gemini.image;
    } else if (provider === "fal") {
      const prompt = "prompt" in prepared ? prepared.prompt : planned?.prompt || "";
      const fal = await postFalReferenceEdit({
        apiKey,
        endpointId: quote.model,
        prompt,
        selfiePng: inputPng,
        referenceJpeg: reference,
        size: quote.size as EditSize,
        estimateUsd: quote.estimateUsd,
      });
      usage = undefined;
      providerResponse = fal.image;
      providerRequestId = fal.requestId;
      if (fal.outputSize) {
        recordedSize = fal.outputSize;
        const [outputWidth, outputHeight] = fal.outputSize.split("x").map((part) => Number(part));
        falComputedUsd = falPriceListUsd({ model: quote.model, outputWidth, outputHeight })?.usd ?? null;
      }
    } else if (provider === "openrouter") {
      const prompt = "prompt" in prepared ? prepared.prompt : planned?.prompt || "";
      const selfieMeta = await sharp(inputPng, { failOn: "none" }).metadata();
      const openrouter = await postOpenRouterReferenceEdit({
        apiKey,
        modelId: quote.model,
        prompt,
        selfiePng: inputPng,
        referenceJpeg: reference,
        width: selfieMeta.width || 1,
        height: selfieMeta.height || 1,
        estimateUsd: quote.estimateUsd,
      });
      usage = openrouter.usage;
      providerResponse = openrouter.image;
      providerRequestId = openrouter.generationId;
      openRouterCostReport = openrouter.costReport;
    } else {
      if (!planned) {
        throw new UnknownModelError(`${quote.model} is not a configured image-edit model. No other model was called.`);
      }
      const fields = editFormFields(planned);
      const body = new FormData();
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      body.append("image[]", new Blob([new Uint8Array(inputPng)], { type: "image/png" }), "selfie.png");
      body.append("image[]", new Blob([new Uint8Array(reference)], { type: "image/jpeg" }), "style-reference.jpg");
      const response = await postImageEdit(apiKey, body);
      const payload = (await response.json()) as {
        data?: { b64_json?: string }[];
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
          input_tokens_details?: { text_tokens?: number; image_tokens?: number };
        };
      };
      usage = usageFrom(payload);
      const b64 = payload.data?.[0]?.b64_json;
      if (!b64) throw new BilledProviderError(quote.estimateUsd, usage);
      providerResponse = Buffer.from(b64, "base64");
    }
    const latencyMs = Date.now() - started;
    const restored = provider === "openai"
      ? await restoredFromProvider(providerResponse, transform)
      : await sharp(providerResponse, { failOn: "none" }).rotate().png().toBuffer();
    const clothing = await assessClothing(args.jpeg, restored).catch((): Awaited<ReturnType<typeof assessClothing>> => ({
      warning: null,
      meanDelta: 0,
      centerMean: 0,
      registered: false,
      accepted: false,
      detail: "clothing check failed. The run is not accepted.",
    }));
    let faceCheckError = "";
    let rawDrift: DriftReport | null = null;
    let aligned: Buffer | undefined;
    let faceCheckPng: Buffer | undefined;
    try {
      const review = await reviewProviderFace(args.jpeg, restored);
      rawDrift = review.rawDrift;
      aligned = review.alignedPng;
      faceCheckPng = review.faceCheckPng;
    } catch (error) {
      faceCheckError = error instanceof Error ? error.message : "The face check did not run.";
    }
    await writeBenchmarkStages(dir, {
      original: args.original,
      sanitized: args.jpeg,
      providerInput: inputPng,
      reference,
      providerResponse,
      restored,
      validation: {
        ...validation,
        providerResponseBytes: providerResponse.length,
        restoredBytes: restored.length,
        clothing,
        accepted: false,
        latencyMs,
        usage: usage || null,
        compositeApplied: false,
        faceCheckError,
        rawFaceDrift: rawDrift,
        faceCheck: "Eyes, brows, nose and mouth after similarity alignment. flagged is a warning, not a rejection.",
        stages: {
          rawProviderResponse: "provider-response.png",
          faceCheck: faceCheckPng ? "face-check.png" : "",
        },
      },
      transform,
      aligned,
      faceCheck: faceCheckPng,
    });
    const reported = costUsdFromUsage(quote.model, usage);
    let costSource = reported != null ? "usage" : "estimate";
    let usd = reported ?? 0;
    if (provider === "fal" && falComputedUsd != null) {
      costSource = "price_list";
      usd = falComputedUsd;
    }
    const actualKnown = costSource === "usage" || costSource === "price_list";
    await finalizePaidCall(gate.id, {
      model: quote.model,
      billed: true,
      charged: true,
      costUsd: actualKnown ? usd : 0,
      estimateInr: gate.estimateInr,
      usage,
      latencyMs,
      imageSize: recordedSize,
      costSource,
      providerRequestId,
    });
    logProviderCall({
      provider,
      model: quote.model,
      salonId: args.tenantId,
      status: "ok",
      latencyMs,
      costUsd: actualKnown ? usd : 0,
      requestId: providerRequestId,
    });
    const clothingNote = clothing.warning === "clothing_changed" ? " Warning: clothing_changed." : "";
    let message = `Unvalidated model output. The raw provider image is the result. One provider call. No mask, no face paste, no retry.${clothingNote}`;
    if (provider === "fal" && costSource === "price_list") message += " The shown cost is computed from the fal price list. It is not fal's invoice.";
    if (provider === "openai" && costSource === "usage") message += " The shown cost is actual from provider usage.";
    if (provider === "openrouter" && openRouterCostReport === "usage.cost") message += " The shown cost is usage.cost from OpenRouter.";
    if (provider === "openrouter" && openRouterCostReport === "generation") message += " The shown cost is total_cost from OpenRouter generation stats.";
    if (provider === "openrouter" && openRouterCostReport === "none") message += " OpenRouter did not return usage.cost or generation total_cost. The reserved estimate is still the cap until an actual is known.";
    if (rawDrift?.flagged) message += " Face may differ from your photo.";
    if (faceCheckError) message += ` Face check did not run: ${faceCheckError}`;
    await prisma.benchmarkRun.update({
      where: { id },
      data: {
        status: "UNVALIDATED",
        message,
        actualUsd: actualKnown ? usd : 0,
        actualInr: actualKnown ? exactInr(usd) : 0,
        inputTokens: usage?.inputTokens || 0,
        outputTokens: usage?.outputTokens || 0,
        imageTokens: usage?.imageTokens || 0,
        textTokens: usage?.textTokens || 0,
        latencyMs,
        clothingWarning: clothing.warning || "",
        size: recordedSize,
      },
    });
    return {
      ok: true,
      id,
      callId: gate.id,
      provider,
      model: quote.model,
      quality: quote.quality,
      size: recordedSize,
      estimateInr: quote.estimateInr,
      estimateUsd: quote.estimateUsd,
      actualInr: actualKnown ? exactInr(usd) : 0,
      actualUsd: actualKnown ? usd : 0,
      costSource,
      actualKnown,
      latencyMs,
      usage: usage || null,
      clothingWarning: clothing.warning || "",
      imagePng: providerResponse,
      rawFaceDrift: Boolean(rawDrift?.flagged),
      faceScore: rawDrift ? rawDrift.landmarkError : null,
      message,
    };
  } catch (error) {
    const uncertain = error instanceof UncertainBillingError;
    const unknown = error instanceof UnknownModelError;
    const failedRequestId = error instanceof UncertainBillingError || error instanceof BilledProviderError ? error.requestId : "";
    if (uncertain) {
      await finalizePaidCall(gate.id, {
        model: quote.model,
        billed: true,
        charged: true,
        costUsd: 0,
        estimateInr: gate.estimateInr,
        imageSize: quote.size,
        costSource: "timeout",
        providerRequestId: failedRequestId,
      });
      await releasePaidCall(gate.id, "UNCERTAIN");
    } else if (error instanceof BilledProviderError) {
      await finalizePaidCall(gate.id, {
        model: quote.model,
        billed: true,
        charged: true,
        costUsd: error.costUsd,
        estimateInr: gate.estimateInr,
        usage: error.usage,
        imageSize: quote.size,
        providerRequestId: failedRequestId,
      });
      await releasePaidCall(gate.id, "BILLED_FAILED");
    } else {
      await finalizePaidCall(gate.id, { model: quote.model, billed: false, charged: false, costUsd: 0, estimateInr: 0, imageSize: quote.size });
      await releasePaidCall(gate.id, "REFUNDED");
    }
    logProviderCall({
      provider,
      model: quote.model,
      salonId: args.tenantId,
      status: uncertain ? "uncertain" : "failed",
      latencyMs: Date.now() - started,
      costUsd: error instanceof BilledProviderError ? error.costUsd : 0,
      requestId: failedRequestId,
    });
    const message = error instanceof Error ? error.message : "The reference edit did not finish.";
    await prisma.benchmarkRun.update({ where: { id }, data: { status: uncertain ? "UNCERTAIN" : "FAILED", message } });
    const httpStatus = uncertain ? 504 : unknown || error instanceof UnbilledProviderError ? 422 : 502;
    return {
      ok: false,
      httpStatus,
      error: uncertain ? "UNCERTAIN" : unknown ? "UNKNOWN_MODEL" : "PROVIDER",
      message,
      outcome: uncertain ? "uncertain" : "provider",
      id,
      callId: gate.id,
    };
  }
}

/** Salon try-on payload. Money fields are omitted unless the viewer is a super-admin. */
export function tryOnReferencePayload(run: ReferenceSuccess, revealCost: boolean) {
  const body: Record<string, unknown> = {
    mode: "reference",
    status: "UNVALIDATED",
    label: "Experimental, unvalidated",
    id: run.id,
    mime: "image/png",
    imageBase64: run.imagePng.toString("base64"),
    accepted: false,
    showCost: revealCost,
    clothingWarning: run.clothingWarning,
    message: run.message,
    rawFaceDrift: run.rawFaceDrift,
    provider: run.provider,
  };
  if (revealCost) {
    body.rupees = run.estimateInr;
    body.dollars = run.estimateUsd;
    body.actualKnown = run.actualKnown;
    body.actualRupees = run.actualKnown ? run.actualInr : 0;
    body.actualDollars = run.actualKnown ? run.actualUsd : 0;
    body.sourceLabel = costSourceLabel(run.costSource);
    body.actualLabel = actualHeading(run.costSource);
    body.latencyMs = run.latencyMs;
    body.usage = run.usage;
    body.model = run.model;
    if (run.faceScore != null) body.faceScore = run.faceScore;
  }
  return body;
}

export async function runTryOnReference(args: {
  jpeg: Buffer;
  original: Buffer;
  styleId: string;
  tenantId: string;
  sessionId: string;
  tier: string;
  actorKey: string;
  jobId: string;
  requestId: string;
  revealCost: boolean;
  hairTexture?: AskedTexture;
  modelId?: string;
}) {
  const executed = await executeReferenceEdit({
    jpeg: args.jpeg,
    original: args.original,
    styleId: args.styleId,
    tenantId: args.tenantId,
    source: "tryon",
    tool: "reference",
    hairTexture: args.hairTexture,
    modelId: args.modelId,
  });
  if (!executed.ok) {
    await failGenerationJob(args.jobId, { outcome: executed.outcome, message: executed.message, callId: executed.callId });
    if (executed.callId) {
      await prisma.tryOn.create({
        data: {
          tenantId: args.tenantId,
          sessionId: args.sessionId,
          styleId: args.styleId,
          kind: "STYLE",
          tier: args.tier,
          actorKey: args.actorKey,
          quality: "reference",
          status: "FAILED",
          credits: 0,
        },
      });
    }
    return NextResponse.json({ error: executed.error, message: executed.message, id: executed.id }, { status: executed.httpStatus });
  }
  const payload = tryOnReferencePayload(executed, args.revealCost);
  await prisma.tryOn.create({
    data: {
      tenantId: args.tenantId,
      sessionId: args.sessionId,
      styleId: args.styleId,
      kind: "STYLE",
      tier: args.tier,
      actorKey: args.actorKey,
      quality: "reference",
      status: "UNVALIDATED",
      latencyMs: executed.latencyMs,
      credits: 0,
    },
  });
  if (args.requestId) {
    await completeGenerationJob(args.jobId, {
      tenantId: args.tenantId,
      requestId: args.requestId,
      image: Buffer.from(JSON.stringify(payload)),
      demoReason: "reference",
      callId: executed.callId,
      fileName: "result.json",
    });
  }
  return NextResponse.json(payload);
}
