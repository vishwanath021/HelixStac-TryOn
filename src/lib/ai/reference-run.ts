import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";
import { benchmarkDir, prepareBenchmark, restoredFromProvider, writeBenchmarkStages } from "@/lib/ai/benchmark";
import { composeHairOnly } from "@/lib/face/compose-hair";
import { assertVisionReady } from "@/lib/face/vision-assets";
import type { DriftReport } from "@/lib/face/hair-composite";
import { assessClothing } from "@/lib/ai/clothing-check";
import { resolveOpenAIKey } from "@/lib/ai/credentials";
import { editFormFields } from "@/lib/ai/edit-request";
import { BilledProviderError, UnbilledProviderError, UncertainBillingError, UnknownModelError } from "@/lib/ai/errors";
import { postImageEdit } from "@/lib/ai/openai";
import { completeGenerationJob, failGenerationJob } from "@/lib/ai/dedupe";
import { beginPaidCall, finalizePaidCall, releasePaidCall } from "@/lib/ai/spend";
import { costUsdFromUsage, exactInr, type UsageNumbers } from "@/lib/ai/tiers";
import { numberEnv } from "@/lib/env";
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
  compositePng: Buffer | null;
  compositeError: string;
  rawFaceDrift: boolean;
  hairComposite: boolean;
  message: string;
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
  hairComposite?: boolean;
}): Promise<ReferenceSuccess | ReferenceFailure> {
  if (args.hairComposite) {
    try {
      await assertVisionReady();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hair-only composite is unavailable.";
      return { ok: false, httpStatus: 400, error: "VISION", message, outcome: "quote" };
    }
  }
  await purgeOldBenchmarks().catch(() => undefined);
  const prepared = await prepareBenchmark({ jpeg: args.jpeg, styleId: args.styleId });
  if (!prepared.ok) {
    return { ok: false, httpStatus: 400, error: "QUOTE", message: prepared.message, outcome: "quote" };
  }
  const apiKey = await resolveOpenAIKey();
  if (!apiKey) {
    return {
      ok: false,
      httpStatus: 400,
      error: "NO_OPENAI_KEY",
      outcome: "key",
      message: "Add an OpenAI key on AI settings. Reference mode does not call Gemini, a mock, or another model.",
    };
  }

  const { quote, planned, fitted, reference, style } = prepared;
  const gate = await beginPaidCall({
    provider: "openai",
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
    inputFidelity: "high",
    outputFormat: "png",
    referencePixels: { width: prepared.referenceWidth, height: prepared.referenceHeight },
    note: "The skin-colour face blob was not used. Alignment is not a haircut score. No original face was pasted back.",
    hairCompositeRequested: Boolean(args.hairComposite),
  };
  await writeBenchmarkStages(dir, {
    original: args.original,
    sanitized: args.jpeg,
    providerInput: fitted.png,
    reference,
    validation,
    transform: fitted.transform,
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

  const fields = editFormFields(planned);
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  body.append("image[]", new Blob([new Uint8Array(fitted.png)], { type: "image/png" }), "selfie.png");
  body.append("image[]", new Blob([new Uint8Array(reference)], { type: "image/jpeg" }), "style-reference.jpg");

  try {
    const started = Date.now();
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
    const usage = usageFrom(payload);
    const latencyMs = Date.now() - started;
    const b64 = payload.data?.[0]?.b64_json;
    if (!b64) throw new BilledProviderError(quote.estimateUsd, usage);
    const providerResponse = Buffer.from(b64, "base64");
    const restored = await restoredFromProvider(providerResponse, fitted.transform);
    const clothing = await assessClothing(args.jpeg, restored).catch((): Awaited<ReturnType<typeof assessClothing>> => ({
      warning: null,
      meanDelta: 0,
      centerMean: 0,
      registered: false,
      accepted: false,
      detail: "clothing check failed. The run is not accepted.",
    }));
    let compositePng: Buffer | null = null;
    let compositeError = "";
    let rawDrift: DriftReport | null = null;
    let compositeDrift: DriftReport | null = null;
    let aligned: Buffer | undefined;
    let maskOverlayPng: Buffer | undefined;
    let compositeLandmarksDetected = false;
    if (args.hairComposite) {
      try {
        const composed = await composeHairOnly(args.jpeg, restored);
        compositePng = composed.compositePng;
        aligned = composed.alignedPng;
        maskOverlayPng = composed.overlayPng;
        rawDrift = composed.rawDrift;
        compositeDrift = composed.compositeDrift;
        compositeLandmarksDetected = composed.compositeLandmarksDetected;
      } catch (error) {
        compositeError = error instanceof Error ? error.message : "Hair-only composite failed.";
      }
    }
    await writeBenchmarkStages(dir, {
      original: args.original,
      sanitized: args.jpeg,
      providerInput: fitted.png,
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
        compositeApplied: Boolean(compositePng),
        compositeError,
        compositeLandmarksDetected,
        rawFaceDrift: rawDrift,
        compositeFaceDrift: compositeDrift,
        stages: {
          rawProviderResponse: "provider-response.png",
          hairComposite: compositePng ? "hair-composite.png" : "",
        },
      },
      transform: fitted.transform,
      aligned,
      maskOverlay: maskOverlayPng,
      hairComposite: compositePng || undefined,
    });
    const usd = costUsdFromUsage(quote.model, usage) ?? quote.estimateUsd;
    await finalizePaidCall(gate.id, {
      model: quote.model,
      billed: true,
      charged: true,
      costUsd: usd,
      estimateInr: gate.estimateInr,
      usage,
      latencyMs,
      imageSize: quote.size,
    });
    const clothingNote = clothing.warning === "clothing_changed" ? " Warning: clothing_changed." : "";
    let message = `Unvalidated model output. One provider call. No mask, no face paste, no retry.${clothingNote}`;
    if (args.hairComposite && compositePng) {
      message += " Hair-only composite saved separately. It is not the raw provider image.";
      if (rawDrift?.flagged) message += " Raw face drift flagged.";
    } else if (args.hairComposite) {
      message += ` Hair-only composite failed: ${compositeError} The paid call was not retried.`;
    }
    await prisma.benchmarkRun.update({
      where: { id },
      data: {
        status: "UNVALIDATED",
        message,
        actualUsd: usd,
        actualInr: exactInr(usd),
        inputTokens: usage?.inputTokens || 0,
        outputTokens: usage?.outputTokens || 0,
        imageTokens: usage?.imageTokens || 0,
        textTokens: usage?.textTokens || 0,
        latencyMs,
        clothingWarning: clothing.warning || "",
      },
    });
    return {
      ok: true,
      id,
      callId: gate.id,
      model: quote.model,
      quality: quote.quality,
      size: quote.size,
      estimateInr: quote.estimateInr,
      estimateUsd: quote.estimateUsd,
      actualInr: exactInr(usd),
      actualUsd: usd,
      latencyMs,
      usage: usage || null,
      clothingWarning: clothing.warning || "",
      imagePng: providerResponse,
      compositePng,
      compositeError,
      rawFaceDrift: Boolean(rawDrift?.flagged),
      hairComposite: Boolean(args.hairComposite),
      message,
    };
  } catch (error) {
    const uncertain = error instanceof UncertainBillingError;
    const unknown = error instanceof UnknownModelError;
    if (uncertain) {
      await finalizePaidCall(gate.id, {
        model: quote.model,
        billed: true,
        charged: true,
        costUsd: quote.estimateUsd,
        estimateInr: gate.estimateInr,
        imageSize: quote.size,
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
      });
      await releasePaidCall(gate.id, "BILLED_FAILED");
    } else {
      await finalizePaidCall(gate.id, { model: quote.model, billed: false, charged: false, costUsd: 0, estimateInr: 0, imageSize: quote.size });
      await releasePaidCall(gate.id, "REFUNDED");
    }
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
    hairComposite: run.hairComposite,
    compositeError: run.compositeError,
    rawFaceDrift: run.rawFaceDrift,
  };
  if (run.compositePng) body.compositeBase64 = run.compositePng.toString("base64");
  if (revealCost) {
    body.rupees = run.estimateInr;
    body.dollars = run.estimateUsd;
    body.actualRupees = run.actualInr;
    body.actualDollars = run.actualUsd;
    body.latencyMs = run.latencyMs;
    body.usage = run.usage;
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
  hairComposite?: boolean;
}) {
  const executed = await executeReferenceEdit({
    jpeg: args.jpeg,
    original: args.original,
    styleId: args.styleId,
    tenantId: args.tenantId,
    source: "tryon",
    tool: "reference",
    hairComposite: args.hairComposite,
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
