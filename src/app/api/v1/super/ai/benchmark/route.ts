import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";
import { benchmarkDir, prepareBenchmark, quoteBenchmark, restoredFromProvider, writeBenchmarkStages } from "@/lib/ai/benchmark";
import { resolveOpenAIKey } from "@/lib/ai/credentials";
import { editFormFields } from "@/lib/ai/edit-request";
import { BilledProviderError, UnbilledProviderError, UncertainBillingError, UnknownModelError } from "@/lib/ai/errors";
import { postImageEdit } from "@/lib/ai/openai";
import { beginPaidCall, finalizePaidCall, releasePaidCall } from "@/lib/ai/spend";
import { costUsdFromUsage, type UsageNumbers } from "@/lib/ai/tiers";
import { sanitizeSelfie, ImageError } from "@/lib/images";
import { numberEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireSuper } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

async function purgeOldBenchmarks() {
  const hours = Math.max(1, numberEnv("BENCHMARK_RETENTION_HOURS", 72));
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const stale = await prisma.benchmarkRun.findMany({ where: { createdAt: { lt: cutoff } }, take: 20 });
  for (const row of stale) {
    await rm(row.dir, { recursive: true, force: true }).catch(() => undefined);
    await prisma.benchmarkRun.delete({ where: { id: row.id } }).catch(() => undefined);
  }
}

export async function GET(req: Request) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const url = new URL(req.url);
  const width = Number(url.searchParams.get("width") || 0);
  const height = Number(url.searchParams.get("height") || 0);
  if (width < 64 || height < 64) {
    return NextResponse.json({ error: "SIZE", message: "Width and height are required to quote a benchmark." }, { status: 400 });
  }
  const quote = quoteBenchmark(width, height);
  if (!quote.ok) return NextResponse.json({ error: "QUOTE", message: quote.message }, { status: 400 });
  return NextResponse.json(quote);
}

export async function POST(req: Request) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "INVALID", message: "Send one selfie and one style." }, { status: 400 });
  await purgeOldBenchmarks().catch(() => undefined);
  if (String(form.get("confirm") || "") !== "yes") {
    return NextResponse.json({ error: "CONFIRM", message: "Confirm the estimated cost before the paid call." }, { status: 400 });
  }
  const styleId = String(form.get("styleId") || "");
  const photo = form.get("photo");
  const original = photo instanceof File ? Buffer.from(await photo.arrayBuffer()) : null;
  if (!original) return NextResponse.json({ error: "PHOTO", message: "Choose one selfie for this run." }, { status: 400 });
  let jpeg: Buffer;
  try {
    jpeg = await sanitizeSelfie(original);
  } catch (error) {
    const code = error instanceof ImageError ? error.code : "DECODE";
    return NextResponse.json({ error: code, message: "Use a JPEG, PNG, or WebP selfie under 2 MB." }, { status: 400 });
  }
  const prepared = await prepareBenchmark({ jpeg, styleId });
  if (!prepared.ok) return NextResponse.json({ error: "BENCHMARK", message: prepared.message }, { status: 400 });
  const apiKey = await resolveOpenAIKey();
  if (!apiKey) {
    return NextResponse.json({
      error: "NO_OPENAI_KEY",
      message: "Add an OpenAI key on AI settings. Benchmark mode does not call Gemini, a mock, or another model.",
    }, { status: 400 });
  }

  const { quote, planned, fitted, reference, style } = prepared;
  const gate = await beginPaidCall({
    provider: "openai",
    quality: quote.quality,
    model: quote.model,
    tenantId: "benchmark",
    tool: "benchmark",
    tier: "benchmark",
    imageSize: quote.size,
    estimateInr: quote.estimateInr,
    estimateUsd: quote.estimateUsd,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: "SPEND_CAP", message: "The testing spend cap would be exceeded. No benchmark call was made." }, { status: 402 });
  }

  const id = randomUUID();
  const dir = benchmarkDir(id);
  const validation = {
    label: "unvalidated model output",
    compositeApplied: false,
    maskSent: false,
    faceBlobUsedAsGate: false,
    accepted: false,
    model: quote.model,
    quality: quote.quality,
    size: quote.size,
    inputFidelity: "high",
    outputFormat: "png",
    referencePixels: { width: prepared.referenceWidth, height: prepared.referenceHeight },
    note: "The skin-colour face blob was not used. Alignment is not a haircut score. No original face was pasted back.",
  };
  await writeBenchmarkStages(dir, {
    original,
    sanitized: jpeg,
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
      callId: gate.id,
      dir,
    },
  });

  const fields = editFormFields(planned);
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  body.append("image[]", new Blob([new Uint8Array(fitted.png)], { type: "image/png" }), "selfie.png");
  body.append("image[]", new Blob([new Uint8Array(reference)], { type: "image/jpeg" }), "style-reference.jpg");

  try {
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
    const b64 = payload.data?.[0]?.b64_json;
    if (!b64) throw new BilledProviderError(quote.estimateUsd, usage);
    const providerResponse = Buffer.from(b64, "base64");
    const restored = await restoredFromProvider(providerResponse, fitted.transform);
    await writeBenchmarkStages(dir, {
      original,
      sanitized: jpeg,
      providerInput: fitted.png,
      reference,
      providerResponse,
      restored,
      validation: { ...validation, providerResponseBytes: providerResponse.length, restoredBytes: restored.length },
      transform: fitted.transform,
    });
    const usd = costUsdFromUsage(quote.model, usage) ?? quote.estimateUsd;
    await finalizePaidCall(gate.id, {
      model: quote.model,
      billed: true,
      charged: true,
      costUsd: usd,
      estimateInr: gate.estimateInr,
      usage,
      imageSize: quote.size,
    });
    await prisma.benchmarkRun.update({ where: { id }, data: { status: "UNVALIDATED", message: "Unvalidated model output." } });
    return NextResponse.json({
      id,
      status: "UNVALIDATED",
      model: quote.model,
      quality: quote.quality,
      size: quote.size,
      estimateInr: quote.estimateInr,
      message: "Unvalidated model output. One provider call. No mask, no face paste, no retry.",
    });
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
    const message = error instanceof Error ? error.message : "The benchmark did not finish.";
    await prisma.benchmarkRun.update({ where: { id }, data: { status: uncertain ? "UNCERTAIN" : "FAILED", message } });
    const status = uncertain ? 504 : unknown || error instanceof UnbilledProviderError ? 422 : 502;
    return NextResponse.json({
      error: uncertain ? "UNCERTAIN" : unknown ? "UNKNOWN_MODEL" : "BENCHMARK",
      message,
      id,
    }, { status });
  }
}
