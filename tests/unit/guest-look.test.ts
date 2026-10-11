import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BROWS_NEED_OPENAI, GUEST_FAL_MODEL, GUEST_OPENAI_MODEL, browsRoute, engineForGuestTool, guestEngineModel, loadGuestReference } from "@/lib/ai/guest-hairstyle";
import { prepareGuestReference, quoteComparisonModel } from "@/lib/ai/compare-models";
import { FAL_NUMBERED_IMAGE_PROMPT } from "@/lib/ai/fal-models";
import { readHairstyleReference } from "@/lib/ai/style-reference";
import { buildColourPrompt } from "@/lib/prompts";
import { shadeById } from "@/data/shades";

const SELFIE = { width: 768, height: 1024 };

describe("guest reference generation", () => {
  it("sends brows to sunburst and keeps style, beard, and colour on the selected engine", async () => {
    expect(engineForGuestTool("brows", "fal")).toBe("openai");
    expect(guestEngineModel(engineForGuestTool("brows", "fal"))).toBe(GUEST_OPENAI_MODEL);
    expect(engineForGuestTool("style", "fal")).toBe("fal");
    expect(engineForGuestTool("beard", "fal")).toBe("fal");
    expect(engineForGuestTool("colour", "fal")).toBe("fal");
    expect(engineForGuestTool("nails", "fal")).toBe("fal");
    expect(guestEngineModel(engineForGuestTool("beard", "fal"))).toBe(GUEST_FAL_MODEL);
    expect(engineForGuestTool("style", "openai")).toBe("openai");
    expect(browsRoute({ openaiReady: true, selected: "fal", selectedReady: true })).toBe("sunburst");
    expect(browsRoute({ openaiReady: false, selected: "fal", selectedReady: true })).toBe("message");
    expect(browsRoute({ openaiReady: false, selected: "fal", selectedReady: false })).toBe("demo");
    expect(browsRoute({ openaiReady: false, selected: "openai", selectedReady: false })).toBe("demo");
    expect(BROWS_NEED_OPENAI).toMatch(/OpenAI/);
    expect(BROWS_NEED_OPENAI).toMatch(/not sent/);

    const guest = readFileSync("src/lib/ai/guest-hairstyle.ts", "utf8");
    expect(guest).toContain("engineForGuestTool(args.tool, selected)");
    expect(guest).toContain("modelId: guestEngineModel(engine)");
    const route = readFileSync("src/app/api/v1/tryon/generate/route.ts", "utf8");
    expect(route).toContain("browsRoute");
    expect(route).toContain("BROWS_NEED_OPENAI");
    expect(route).toContain("engineForGuestTool(tool, engine)");
    expect(route).not.toMatch(/gpt-image/);
    const settings = readFileSync("src/components/admin/SuperAiForm.tsx", "utf8");
    expect(settings).toContain("Brows always use OpenAI gpt-image-2.5-sunburst");

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
    expect(ready.quote.model).toBe(GUEST_OPENAI_MODEL);
    expect(ready.prompt).toContain("Image 1 is the customer selfie, image 2 is the reference.");
    expect(ready.prompt).toContain("Change only the eyebrow shape and thickness to match image 2.");
    expect(ready.prompt).not.toContain(FAL_NUMBERED_IMAGE_PROMPT);
    expect(ready.prompt.toLowerCase()).not.toContain("mask");
    expect(ready.quote.estimateUsd).toBe(0.159714);
    expect(ready.quote.estimateInr).toBe(16.6);
    expect(ready.quote.size).toBe("1024x1536");
  });

  it("recolours from a shade swatch and keeps the numbered colour prompt", async () => {
    const shade = shadeById("honey-blonde");
    expect(shade).toBeTruthy();
    const loaded = await loadGuestReference("colour", "honey-blonde");
    expect(loaded?.prompt).toBe(buildColourPrompt(shade!));
    expect(loaded?.prompt).toContain("Recolour the existing hair to the selected shade.");
    expect(loaded?.prompt).toContain("Keep the haircut, length, style and everything else the same.");
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
      expect(row.fluxUsd).toBe(0.024);
      expect(row.fluxInr).toBe(2.5);
      expect(row.sunburstUsd).toBe(0.159714);
      expect(row.sunburstInr).toBe(16.6);
      expect(row.sunburstSize).toBe("1024x1536");
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
