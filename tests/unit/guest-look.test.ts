import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { GUEST_FAL_MODEL, GUEST_OPENAI_MODEL, engineForGuestTool, guestEngineModel, loadGuestReference } from "@/lib/ai/guest-hairstyle";
import { prepareGuestReference, quoteComparisonModel } from "@/lib/ai/compare-models";
import { flux3UsdForResolution } from "@/lib/ai/cost-source";
import { FAL_NUMBERED_IMAGE_PROMPT } from "@/lib/ai/fal-models";
import { bufferedInr } from "@/lib/ai/tiers";
import { readHairstyleReference } from "@/lib/ai/style-reference";
import { buildColourPrompt } from "@/lib/prompts";
import { shadeById } from "@/data/shades";

const SELFIE = { width: 768, height: 1024 };

describe("guest reference generation", () => {
  it("sends brows through the same engine as the other guest tools", async () => {
    expect(engineForGuestTool("brows", "fal")).toBe("fal");
    expect(guestEngineModel(engineForGuestTool("brows", "fal"))).toBe(GUEST_FAL_MODEL);
    expect(engineForGuestTool("style", "fal")).toBe("fal");
    expect(engineForGuestTool("beard", "fal")).toBe("fal");
    expect(engineForGuestTool("colour", "fal")).toBe("fal");
    expect(engineForGuestTool("nails", "fal")).toBe("fal");
    expect(guestEngineModel(engineForGuestTool("beard", "fal"))).toBe(GUEST_FAL_MODEL);
    expect(engineForGuestTool("style", "openai")).toBe("openai");
    expect(engineForGuestTool("brows", "openai")).toBe("openai");

    const guest = readFileSync("src/lib/ai/guest-hairstyle.ts", "utf8");
    expect(guest).toContain("engineForGuestTool(args.tool, selected)");
    expect(guest).toContain("modelId: guestEngineModel(engine)");
    expect(guest).toContain("COLOUR_UNCHANGED_MESSAGE");
    const route = readFileSync("src/app/api/v1/tryon/generate/route.ts", "utf8");
    expect(route).toContain("engineForGuestTool(tool, engine)");
    expect(route).not.toContain("browsRoute");
    expect(route).not.toMatch(/gpt-image/);
    const settings = readFileSync("src/components/admin/SuperAiForm.tsx", "utf8");
    expect(settings).toContain("Brows follow this choice");
    expect(settings).not.toContain("Brows always use OpenAI");

    const selfie = await sharp({ create: { width: SELFIE.width, height: SELFIE.height, channels: 3, background: "#c4a484" } }).jpeg().toBuffer();
    const loaded = await loadGuestReference("brows", "soft-arch");
    expect(loaded).toBeTruthy();
    const ready = await prepareGuestReference({
      jpeg: selfie,
      styleId: "soft-arch",
      modelId: guestEngineModel(engineForGuestTool("brows", "fal")),
      quality: "medium",
      prompt: loaded!.prompt,
      reference: loaded!.reference,
      referenceFile: loaded!.referenceFile,
    });
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    expect(ready.quote.model).toBe(GUEST_FAL_MODEL);
    expect(ready.fitted).toBeNull();
    const sent = await sharp(ready.selfiePng).metadata();
    expect(sent.width).toBe(SELFIE.width);
    expect(sent.height).toBe(SELFIE.height);
    expect(ready.prompt).toContain("Image 1 is the customer selfie. Image 2 is a brow-shape diagram, not a face to copy.");
    expect(ready.prompt).toContain("Change only the eyebrows.");
    expect(ready.prompt).toContain("clearly visible");
    expect(ready.prompt).toContain("Do not add grey bars");
    expect(ready.prompt).toContain("Keep the face, identity, hair, skin, background and framing identical.");
    expect(ready.prompt).not.toContain(FAL_NUMBERED_IMAGE_PROMPT);
    expect(ready.prompt.toLowerCase()).not.toContain("mask");
    expect(ready.quote.estimateUsd).toBe(flux3UsdForResolution("1k"));
    expect(ready.quote.estimateInr).toBe(bufferedInr(flux3UsdForResolution("1k")));
  });

  it("recolours from a shade swatch and keeps the numbered colour prompt", async () => {
    const shade = shadeById("honey-blonde");
    expect(shade).toBeTruthy();
    const loaded = await loadGuestReference("colour", "honey-blonde");
    expect(loaded?.prompt).toBe(buildColourPrompt(shade!));
    expect(loaded?.prompt).toContain("Recolour every visible hair strand to Honey Blonde (#E2B657).");
    expect(loaded?.prompt).toContain("obvious in the hair");
    expect(loaded?.prompt).toContain("strand texture");
    expect(loaded?.prompt).toContain("Do not recolour skin");
    const meta = await sharp(loaded!.reference).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    const selfie = await sharp({ create: { width: SELFIE.width, height: SELFIE.height, channels: 3, background: "#c4a484" } }).jpeg().toBuffer();
    const ready = await prepareGuestReference({
      jpeg: selfie,
      styleId: "honey-blonde",
      modelId: GUEST_OPENAI_MODEL,
      quality: "medium",
      prompt: loaded!.prompt,
      reference: loaded!.reference,
      referenceFile: loaded!.referenceFile,
    });
    expect(ready.ok).toBe(true);
    if (!ready.ok || !ready.planned) return;
    expect(ready.planned.prompt).toContain("Image 1 is the customer selfie, image 2 is the reference.");
    expect(ready.planned.mask).toBe(false);
    expect(ready.planned.imageOrder).toEqual(["selfie.png", "style-reference.jpg"]);
  });

  it("quotes flux-3 and sunburst for each guest tool on a 768×1024 selfie", async () => {
    const tools = [
      { tool: "style", id: "soft-bob" },
      { tool: "brows", id: "soft-arch" },
      { tool: "beard", id: "short-boxed" },
      { tool: "beard", id: "clean-shave" },
      { tool: "nails", id: "classic-french" },
      { tool: "colour", id: "honey-blonde" },
      { tool: "colour", id: "cherry-red" },
    ] as const;
    const rows = [];
    for (const item of tools) {
      const reference = item.tool === "style"
        ? readHairstyleReference(item.id, "styles")
        : (await loadGuestReference(item.tool, item.id))?.reference;
      expect(reference, item.id).toBeTruthy();
      const meta = await sharp(reference!).metadata();
      const size = { width: meta.width || 0, height: meta.height || 0 };
      const flux = quoteComparisonModel(GUEST_FAL_MODEL, SELFIE.width, SELFIE.height, size, "medium");
      const sunburst = quoteComparisonModel(GUEST_OPENAI_MODEL, SELFIE.width, SELFIE.height, size, "medium");
      expect(flux.ok).toBe(true);
      expect(sunburst.ok).toBe(true);
      if (!flux.ok || !sunburst.ok) continue;
      rows.push({
        tool: item.tool,
        id: item.id,
        reference: `${size.width}x${size.height}`,
        fluxUsd: flux.estimateUsd,
        fluxInr: flux.estimateInr,
        sunburstUsd: sunburst.estimateUsd,
        sunburstInr: sunburst.estimateInr,
        sunburstSize: sunburst.size,
      });
    }
    for (const row of rows) {
      expect(row.reference).toBe("512x512");
      expect(row.fluxUsd).toBe(flux3UsdForResolution("1k"));
      expect(row.fluxInr).toBe(bufferedInr(flux3UsdForResolution("1k")));
      expect(row.sunburstUsd).toBe(0.143282);
      expect(row.sunburstInr).toBe(14.9);
      expect(row.sunburstSize).toBe("1024x1360");
    }
    expect(rows.map((row) => `${row.tool}:${row.id}`)).toEqual([
      "style:soft-bob",
      "brows:soft-arch",
      "beard:short-boxed",
      "beard:clean-shave",
      "nails:classic-french",
      "colour:honey-blonde",
      "colour:cherry-red",
    ]);
  });

  it("keeps the guest route off the masked editor", () => {
    const route = readFileSync("src/app/api/v1/tryon/generate/route.ts", "utf8");
    expect(route).not.toContain("generateWithFailover");
    expect(route).not.toContain("compositeLocked");
    expect(route).not.toContain("runLockedEdit");
    expect(route).not.toContain("preflightPhoto");
    expect(route).toContain("if (!placement.ok)");
    expect(route.indexOf("if (!placement.ok)")).toBeLessThan(route.lastIndexOf("takePreviewSlot"));
  });
});
