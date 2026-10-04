import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { quoteBenchmark } from "@/lib/ai/benchmark";
import { comparisonModel, prepareComparison, quoteComparisonModel } from "@/lib/ai/compare-models";
import { editFormFields, planImageEdit } from "@/lib/ai/edit-request";
import { geminiReferenceParts } from "@/lib/ai/gemini-reference";
import { usdFromTokenCounts } from "@/lib/ai/tiers";

describe("comparison models", () => {
  it("quotes each exact id and refuses a prefix or a substitute", () => {
    expect(comparisonModel("gpt-image")).toBeNull();
    expect(comparisonModel("gpt-image-2.5")).toBeNull();
    expect(comparisonModel("gemini-3.1-flash-lite-image")).toBeNull();
    for (const id of ["gpt-image", "gpt-image-2.5", "gemini", "gemini-3.1-flash-lite-image"]) {
      const refused = quoteComparisonModel(id, 480, 640);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.message).toMatch(/No other model was substituted/);
    }
    const current = quoteComparisonModel("gpt-image-1.5", 480, 640);
    const benchmark = quoteBenchmark(480, 640);
    expect(current.ok && benchmark.ok).toBe(true);
    if (current.ok && benchmark.ok) {
      expect(current.provider).toBe("openai");
      expect(current.model).toBe("gpt-image-1.5");
      expect(current.inputFidelity).toBe("high");
      expect(current.estimateInr).toBe(benchmark.estimateInr);
      expect(current.size).toBe("1024x1536");
    }
    const next = quoteComparisonModel("gpt-image-2", 480, 640);
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(next.model).toBe("gpt-image-2");
      expect(next.inputFidelity).toBeNull();
      expect(next.size).toBe("1024x1536");
      expect(next.estimateInr).toBeGreaterThan(0);
      expect(next.estimateInr).toBeLessThanOrEqual(next.capInr);
      const planned = planImageEdit({
        model: next.model,
        prompt: "edit",
        quality: "medium",
        size: next.size,
        outputFormat: "png",
        inputFidelity: next.inputFidelity,
        imageOrder: ["selfie.png", "style-reference.jpg"],
        mask: false,
      });
      expect(planned.ok).toBe(true);
      if (planned.ok) expect(editFormFields(planned.plan).input_fidelity).toBeUndefined();
    }
    const gemini = quoteComparisonModel("gemini-3.1-flash-image", 480, 640);
    expect(gemini.ok).toBe(true);
    if (gemini.ok) {
      expect(gemini.provider).toBe("gemini");
      expect(gemini.model).toBe("gemini-3.1-flash-image");
      expect(gemini.inputFidelity).toBeNull();
      expect(gemini.size).toBe("1K");
      expect(gemini.estimateInr).toBeLessThan(10);
    }
    expect(usdFromTokenCounts("gpt-image-2", { textIn: 400, imageIn: 1000, output: 1000 })).not.toBeNull();
    const sunburst = quoteComparisonModel("gpt-image-2.5-sunburst", 480, 640);
    expect(sunburst.ok).toBe(true);
    if (sunburst.ok) {
      expect(sunburst.model).toBe("gpt-image-2.5-sunburst");
      expect(sunburst.inputFidelity).toBeNull();
      expect(sunburst.size).toBe("1024x1536");
      expect(sunburst.estimateInr).toBeLessThanOrEqual(sunburst.capInr);
      const planned = planImageEdit({
        model: sunburst.model,
        prompt: "edit",
        quality: "medium",
        size: sunburst.size,
        outputFormat: "png",
        inputFidelity: sunburst.inputFidelity,
        imageOrder: ["selfie.png", "style-reference.jpg"],
        mask: false,
      });
      expect(planned.ok).toBe(true);
      if (planned.ok) expect(editFormFields(planned.plan).input_fidelity).toBeUndefined();
    }
    expect(comparisonModel("gpt-image-2.5-sunburst")?.id).toBe("gpt-image-2.5-sunburst");
    expect(comparisonModel("gpt-image-2.5-flare")?.id).toBe("gpt-image-2.5-flare");
  });

  it("prepares gpt-image-2 without input_fidelity and keeps the reference prompt", async () => {
    const jpeg = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#ccbbaa" } }).jpeg().toBuffer();
    const ready = await prepareComparison({ jpeg, styleId: "long-layers", modelId: "gpt-image-2" });
    expect(ready.ok).toBe(true);
    if (!ready.ok || !ready.planned) return;
    expect(ready.provider).toBe("openai");
    expect(ready.planned.model).toBe("gpt-image-2");
    expect(ready.planned.inputFidelity).toBeNull();
    expect(ready.planned.mask).toBe(false);
    expect(editFormFields(ready.planned).input_fidelity).toBeUndefined();
    expect(ready.prompt).toContain("Image 1 is the person to edit");
    expect(ready.prompt).not.toMatch(/mask/i);
    const parts = geminiReferenceParts({
      model: "gemini-3.1-flash-image",
      prompt: ready.prompt,
      selfiePng: Buffer.from("selfie"),
      referenceJpeg: Buffer.from("reference"),
    });
    expect(parts.model).toBe("gemini-3.1-flash-image");
    expect(parts.parts[2]).toEqual({ text: ready.prompt });
    expect("inlineData" in parts.parts[0] && parts.parts[0].inlineData.mimeType).toBe("image/png");
    expect("inlineData" in parts.parts[1] && parts.parts[1].inlineData.mimeType).toBe("image/jpeg");
  });
});
