import { NextResponse } from "next/server";
import { runCalibration, CALIBRATION_CAP_INR, CALIBRATION_MAX_IMAGES } from "@/lib/ai/calibrate";
import { resolveProviderChoice } from "@/lib/ai/credentials";
import { selectProvider } from "@/lib/ai/router";
import { beginPaidCall, costPerCallInr, releasePaidCall } from "@/lib/ai/spend";
import { openAIQuality } from "@/lib/ai/openai";
import type { RegionTool } from "@/lib/face/region";
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
  const paid = provider.name !== "mock";
  const quality = provider.name === "openai" ? openAIQuality("standard") : "standard";
  const estimateInr = paid ? costPerCallInr(provider.name, quality) : 0;
  const result = await runCalibration({
    capInr: CALIBRATION_CAP_INR,
    maxImages: CALIBRATION_MAX_IMAGES,
    estimateInr,
    pay: paid
      ? async () => beginPaidCall({ provider: provider.name, quality, model: provider.name, tenantId: "calibration" })
      : undefined,
    release: releasePaidCall,
    edit: async (image, tool: RegionTool, attempt) => {
      if (!paid) {
        const { paintFlat } = await import("@/lib/ai/flat-edit");
        return (await paintFlat(image)).image;
      }
      const { preflightPhoto } = await import("@/lib/face/region");
      const pre = await preflightPhoto(image, tool);
      const output = await provider.generate({
        image,
        styleId: "calibration",
        gender: "women",
        prompt: "Calibration edit. Change only the masked region and keep everything else.",
        tenantId: "calibration",
        quality: "standard",
        kind: tool === "colour" ? "style" : tool,
        maskPng: attempt === 1 ? pre.maskFile ?? undefined : undefined,
      });
      return output.image;
    },
  });
  return NextResponse.json({
    summary: paid
      ? `Calibration used about ₹${result.spentInr.toFixed(0)} of a ₹${result.capInr} cap, ${result.panels.length} image${result.panels.length === 1 ? "" : "s"}.`
      : "Offline calibration. No provider was called, so this does not measure blending quality. The red area is the only region a later edit is allowed to change.",
    spentInr: result.spentInr,
    capInr: result.capInr,
    stoppedBecause: result.stoppedBecause,
    offline: !paid,
    panels: result.panels.map((panel) => ({
      name: panel.name,
      tool: panel.tool,
      ok: panel.ok,
      message: panel.message,
      calls: panel.calls,
      chargedInr: panel.chargedInr,
      before: dataUrl(panel.before, "image/jpeg"),
      overlay: dataUrl(panel.overlay, "image/png"),
      after: dataUrl(panel.after, "image/jpeg"),
    })),
  });
}
