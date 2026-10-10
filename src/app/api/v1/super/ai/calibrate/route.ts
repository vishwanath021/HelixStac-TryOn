import { NextResponse } from "next/server";
import { BilledProviderError } from "@/lib/ai/errors";
import { runCalibration, CALIBRATION_CAP_INR, CALIBRATION_MAX_IMAGES } from "@/lib/ai/calibrate";
import { resolveProviderChoice } from "@/lib/ai/credentials";
import { selectProvider } from "@/lib/ai/router";
import { markCalibration } from "@/lib/ai/settings-store";
import { beginPaidCall, finalizePaidCall, releasePaidCall } from "@/lib/ai/spend";
import { ledgerTool, tierRequest, type ImageProviderName } from "@/lib/ai/tiers";
import type { RegionTool } from "@/lib/face/region";
import { prisma } from "@/lib/prisma";
import { requireSuper } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function dataUrl(bytes: Buffer, mime: string) {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export async function POST() {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const choice = await resolveProviderChoice("platform");
  const provider = selectProvider(choice.name, choice.apiKey);
  const paid = provider.name === "openai" || provider.name === "gemini";
  const name: ImageProviderName = provider.name === "gemini" ? "gemini" : "openai";
  const spec = tierRequest(name, "test");
  const estimateInr = paid ? spec.estimateInr : 0;
  let lastId = "";
  const result = await runCalibration({
    capInr: CALIBRATION_CAP_INR,
    maxImages: CALIBRATION_MAX_IMAGES,
    estimateInr,
    listing: { model: spec.model, quality: spec.quality, estimateInr: spec.estimateInr },
    pay: paid
      ? async () => {
          const gate = await beginPaidCall({
            provider: provider.name,
            quality: spec.tier,
            model: spec.model,
            tenantId: "calibration",
            tier: spec.tier,
            imageSize: spec.size,
            estimateInr: spec.estimateInr,
            estimateUsd: spec.estimateUsd,
          });
          if (gate.ok) lastId = gate.id;
          return gate;
        }
      : undefined,
    release: releasePaidCall,
    edit: async (image, tool: RegionTool, attempt) => {
      if (!paid) {
        const { paintFlat } = await import("@/lib/ai/flat-edit");
        return (await paintFlat(image)).image;
      }
      const { preflightPhoto } = await import("@/lib/face/region");
      const pre = await preflightPhoto(image, tool);
      const callId = lastId;
      if (callId) await prisma.aiCall.updateMany({ where: { id: callId }, data: { tool: ledgerTool(tool === "colour" ? "style" : tool, tool === "colour" ? "colour" : null) } });
      try {
        const output = await provider.generate({
          image,
          styleId: "calibration",
          gender: "women",
          prompt: "Calibration edit. Change only the masked region and keep everything else.",
          tenantId: "calibration",
          quality: "standard",
          tier: "test",
          kind: tool === "colour" ? "style" : tool,
          colour: tool === "colour" ? "colour" : null,
          maskPng: attempt === 1 ? pre.maskFile ?? undefined : undefined,
        });
        await finalizePaidCall(callId, {
          model: output.model || spec.model,
          billed: true,
          charged: true,
          costUsd: output.providerCostUsd,
          estimateInr: spec.estimateInr,
          usage: output.usage,
          latencyMs: output.latencyMs,
          imageSize: output.imageSize || spec.size,
        });
        return output.image;
      } catch (error) {
        const billed = error instanceof BilledProviderError;
        await finalizePaidCall(callId, {
          model: spec.model,
          billed,
          charged: false,
          costUsd: billed ? error.costUsd : 0,
          estimateInr: spec.estimateInr,
          usage: billed ? error.usage : undefined,
          imageSize: spec.size,
        });
        throw error;
      }
    },
  });
  const zonesOk = result.panels.length > 0 && result.panels.every((panel) => panel.ok) && !result.stoppedBecause;
  await markCalibration(zonesOk);
  const total = `Total charged ₹${result.spentInr.toFixed(2)}.`;
  const rate = `${spec.model} · ${spec.quality} · about ₹${spec.estimateInr.toFixed(2)} / image.`;
  return NextResponse.json({
    summary: paid
      ? `Calibration used ${rate} ${total} Cap for this run ₹${result.capInr}.`
      : `Offline calibration. No provider was called, so this does not measure blending quality. A paid TEST image would use ${rate} ${total}`,
    spentInr: result.spentInr,
    capInr: result.capInr,
    stoppedBecause: result.stoppedBecause,
    offline: !paid,
    calibrationOk: zonesOk,
    model: spec.model,
    quality: spec.quality,
    estimateInr: spec.estimateInr,
    panels: result.panels.map((panel) => ({
      name: panel.name,
      tool: panel.tool,
      ok: panel.ok,
      message: panel.message,
      calls: panel.calls,
      chargedInr: panel.chargedInr,
      model: panel.model,
      quality: panel.quality,
      estimateInr: panel.estimateInr,
      before: dataUrl(panel.before, "image/jpeg"),
      overlay: dataUrl(panel.overlay, "image/png"),
      after: dataUrl(panel.after, "image/jpeg"),
    })),
  });
}
