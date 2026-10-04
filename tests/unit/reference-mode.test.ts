import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { STYLES } from "@/data/styles";
import { prepareBenchmark, quoteBenchmark } from "@/lib/ai/benchmark";
import { assessClothing, clothingBandDelta } from "@/lib/ai/clothing-check";
import { claimGenerationJob, jobFingerprint } from "@/lib/ai/dedupe";
import { editFormFields, FORBIDDEN_EDIT_FIELDS, planImageEdit } from "@/lib/ai/edit-request";
import { UncertainBillingError } from "@/lib/ai/errors";
import { fitInsideCanvas, restoreFrame } from "@/lib/ai/frame";
import { salonOutcome } from "@/lib/ai/guest-response";
import { beginPaidCall, releasePaidCall } from "@/lib/ai/spend";
import { readHairstyleReference } from "@/lib/ai/style-reference";
import { captureShouldMirror } from "@/lib/capture";
import { drawFrontal } from "@/lib/face/synthetic";
import { runLockedEdit } from "@/lib/face/pipeline";
import { prisma } from "@/lib/prisma";
import { buildReferencePrompt, buildStylePrompt } from "@/lib/prompts";

describe("reference benchmark request", () => {
  it("plans gpt-image-1.5 with high fidelity, png output, and the selfie before the reference", () => {
    const style = STYLES.find((item) => item.id === "pixie");
    expect(style).toBeTruthy();
    const prompt = buildReferencePrompt(style!, undefined);
    const planned = planImageEdit({
      model: "gpt-image-1.5",
      prompt,
      quality: "medium",
      size: "1536x1024",
      outputFormat: "png",
      inputFidelity: "high",
      imageOrder: ["selfie.png", "style-reference.jpg"],
      mask: false,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.imageOrder).toEqual(["selfie.png", "style-reference.jpg"]);
    expect(planned.plan.inputFidelity).toBe("high");
    expect(planned.plan.mask).toBe(false);
    const fields = editFormFields(planned.plan);
    expect(fields.model).toBe("gpt-image-1.5");
    expect(fields.quality).toBe("medium");
    expect(fields.n).toBe("1");
    expect(fields.input_fidelity).toBe("high");
    expect(fields.output_format).toBe("png");
    expect(fields.size).toBe("1536x1024");
    for (const name of FORBIDDEN_EDIT_FIELDS) expect(fields[name]).toBeUndefined();
    expect(prompt).not.toMatch(/mask/i);
    expect(prompt).toContain("exact crew neckline");
    expect(prompt).toContain("Only the hair region");
    expect(prompt).toContain("Image 1 is the person to edit");
    expect(prompt).toContain("Image 2 is a hairstyle reference only");
    expect(prompt).toContain("long-to-short");
    expect(buildStylePrompt(style!).toLowerCase()).toContain("mask");
    expect(STYLES.find((item) => item.id === "side-part")?.lengthCategory).toBe("medium");
    expect(STYLES.find((item) => item.id === "short-back-sides")?.lengthCategory).toBe("short");
    expect(STYLES.find((item) => item.id === "bro-flow")?.lengthCategory).toBe("medium");
    expect(STYLES.find((item) => item.id === "hime-cut")?.lengthCategory).toBe("long");
    expect(STYLES.find((item) => item.id === "long-layers")?.lengthCategory).toBe("long");
  });

  it("refuses fidelity on a model that does not list it, and does not swap models", () => {
    const planned = planImageEdit({
      model: "gpt-image-2",
      prompt: "edit",
      quality: "medium",
      size: "1024x1024",
      outputFormat: "png",
      inputFidelity: "high",
      imageOrder: ["selfie.png"],
      mask: false,
    });
    expect(planned.ok).toBe(false);
    const missing = planImageEdit({
      model: "not-a-model",
      prompt: "edit",
      quality: "medium",
      size: "1024x1024",
      outputFormat: "png",
      inputFidelity: null,
      imageOrder: ["selfie.png"],
      mask: false,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.message).toMatch(/not a configured/);
  });

  it("loads the selected reference and refuses a missing style", async () => {
    const bytes = readHairstyleReference("blunt-bob");
    expect(bytes && bytes.length > 1000).toBe(true);
    const meta = await sharp(bytes!).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    expect(readHairstyleReference("missing-style")).toBeNull();
    const jpeg = await sharp({ create: { width: 320, height: 180, channels: 3, background: "#8899aa" } }).jpeg().toBuffer();
    const missing = await prepareBenchmark({ jpeg, styleId: "missing-style" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.message).toMatch(/catalogue|reference/i);
    const ready = await prepareBenchmark({ jpeg, styleId: "long-layers" });
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    expect(ready.planned.imageOrder[0]).toBe("selfie.png");
    expect(ready.planned.imageOrder[1]).toBe("style-reference.jpg");
    expect(ready.planned.mask).toBe(false);
    expect(ready.quote.size).toBe("1536x1024");
    expect(buildReferencePrompt(ready.style)).not.toMatch(/mask/i);
    expect(buildReferencePrompt(ready.style)).toContain("short-to-long");
  });

  it("keeps a uniform fit invertible and does not stretch the content aspect", async () => {
    const source = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#336699" } }).png().toBuffer();
    const fitted = await fitInsideCanvas(source, "1536x1024");
    expect(fitted.transform.targetWidth).toBe(1536);
    expect(fitted.transform.targetHeight).toBe(1024);
    const ratio = fitted.transform.contentWidth / fitted.transform.contentHeight;
    expect(ratio).toBeGreaterThan(1.95);
    expect(ratio).toBeLessThan(2.05);
    const back = await restoreFrame(fitted.png, fitted.transform);
    const meta = await sharp(back).metadata();
    expect(meta.width).toBe(fitted.transform.contentWidth);
    expect(meta.height).toBe(fitted.transform.contentHeight);
  });

  it("mirrors only a user-facing shutter", () => {
    expect(captureShouldMirror("user")).toBe(true);
    expect(captureShouldMirror("environment")).toBe(false);
  });
});

describe("spend and duplicate jobs", () => {
  it("counts a billed rejection and an uncertain timeout toward the cap", async () => {
    process.env.AI_SPEND_CAP_INR = "1";
    await prisma.aiCall.deleteMany();
    const first = await beginPaidCall({ provider: "openai", quality: "benchmark", model: "gpt-image-1.5", tenantId: "bench", estimateInr: 0.6 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await releasePaidCall(first.id, "UNCERTAIN");
    const second = await beginPaidCall({ provider: "openai", quality: "benchmark", model: "gpt-image-1.5", tenantId: "bench", estimateInr: 0.6 });
    expect(second.ok).toBe(false);
    delete process.env.AI_SPEND_CAP_INR;
  });

  it("lets only one of two concurrent reservations through a tight cap", async () => {
    process.env.AI_SPEND_CAP_INR = "1";
    await prisma.aiCall.deleteMany();
    const [a, b] = await Promise.all([
      beginPaidCall({ provider: "openai", quality: "benchmark", model: "gpt-image-1.5", tenantId: "race", estimateInr: 0.8 }),
      beginPaidCall({ provider: "openai", quality: "benchmark", model: "gpt-image-1.5", tenantId: "race", estimateInr: 0.8 }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    delete process.env.AI_SPEND_CAP_INR;
  });

  it("replays the same request id and rejects a different payload", async () => {
    await prisma.generationJob.deleteMany({ where: { tenantId: "dedupe-tenant" } });
    const photo = Buffer.from("selfie-bytes");
    const other = Buffer.from("other-selfie");
    const requestId = "req-repeat-1";
    const first = await claimGenerationJob({
      tenantId: "dedupe-tenant",
      requestId,
      fingerprint: jobFingerprint({ photo, styleId: "pixie", tool: "style", shadeId: "", mode: "production" }),
    });
    expect(first.kind).toBe("start");
    const again = await claimGenerationJob({
      tenantId: "dedupe-tenant",
      requestId,
      fingerprint: jobFingerprint({ photo, styleId: "pixie", tool: "style", shadeId: "", mode: "production" }),
    });
    expect(again.kind).toBe("inflight");
    const clash = await claimGenerationJob({
      tenantId: "dedupe-tenant",
      requestId,
      fingerprint: jobFingerprint({ photo: other, styleId: "pixie", tool: "style", shadeId: "", mode: "production" }),
    });
    expect(clash.kind).toBe("conflict");
  });

  it("does not regenerate after an uncertain provider error", async () => {
    const scene = drawFrontal(360, 480);
    const jpeg = await sharp(scene.data, { raw: { width: 360, height: 480, channels: 3 } }).jpeg().toBuffer();
    let calls = 0;
    const result = await runLockedEdit({
      image: jpeg,
      tool: "style",
      edit: async () => {
        calls += 1;
        throw new UncertainBillingError("timed out");
      },
    });
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("uncertain");
  });

  it("flags a changed neckline and leaves an unchanged shirt alone", async () => {
    const scene = drawFrontal(320, 420);
    const face = scene.face!;
    const shirt = Buffer.from(scene.data);
    const yShirt = face.y + face.h;
    for (let y = yShirt; y < scene.height; y += 1) {
      for (let x = Math.max(0, face.x - 8); x < Math.min(scene.width, face.x + face.w + 8); x += 1) {
        const i = (y * scene.width + x) * 3;
        shirt[i] = 248;
        shirt[i + 1] = 248;
        shirt[i + 2] = 248;
      }
    }
    const same = clothingBandDelta(shirt, Buffer.from(shirt), scene.width, scene.height, face);
    expect(same.warning).toBeNull();
    const scooped = Buffer.from(shirt);
    const y1 = Math.min(scene.height, yShirt + Math.round(face.h * 0.35));
    const x0 = face.x + Math.round(face.w * 0.25);
    const x1 = face.x + Math.round(face.w * 0.75);
    for (let y = yShirt; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * scene.width + x) * 3;
        scooped[i] = 18;
        scooped[i + 1] = 32;
        scooped[i + 2] = 96;
      }
    }
    const changed = clothingBandDelta(shirt, scooped, scene.width, scene.height, face);
    expect(changed.warning).toBe("clothing_changed");
    const hairOnly = Buffer.from(shirt);
    for (let y = 0; y < face.y; y += 1) {
      for (let x = 0; x < scene.width; x += 1) {
        const i = (y * scene.width + x) * 3;
        hairOnly[i] = 180;
        hairOnly[i + 1] = 40;
        hairOnly[i + 2] = 40;
      }
    }
    expect(clothingBandDelta(shirt, hairOnly, scene.width, scene.height, face).warning).toBeNull();
    const original = await sharp(shirt, { raw: { width: scene.width, height: scene.height, channels: 3 } }).png().toBuffer();
    const edited = await sharp(scooped, { raw: { width: scene.width, height: scene.height, channels: 3 } }).png().toBuffer();
    const finding = await assessClothing(original, edited);
    expect(finding.accepted).toBe(false);
    expect(finding.registered).toBe(true);
    expect(finding.warning).toBe("clothing_changed");
    const quiet = await assessClothing(original, original);
    expect(quiet.warning).toBeNull();
    expect(quiet.accepted).toBe(false);
  });

  it("does not treat a mock result as a paid success", () => {
    expect(salonOutcome("no-key")).toEqual({ status: "DEMO", commit: false, placement: false });
    expect(salonOutcome("spend-cap").commit).toBe(false);
    expect(salonOutcome("placement").status).toBe("FAILED");
    expect(salonOutcome(undefined)).toEqual({ status: "SUCCEEDED", commit: true, placement: false });
  });

  it("quotes the benchmark below the default run cap and still rejects the saved reframed production output", async () => {
    const quote = quoteBenchmark(1280, 720);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.model).toBe("gpt-image-1.5");
    expect(quote.size).toBe("1536x1024");
    expect(quote.estimateInr).toBeGreaterThanOrEqual(15);
    expect(quote.estimateInr).toBeLessThanOrEqual(17);
    expect(quote.imageInputTokens).toBeGreaterThan(10_000);
    expect(quote.note).toMatch(/estimate, actual from provider usage/i);
    expect(quote.outputUsd + quote.imageInputUsd + quote.textInputUsd).toBeCloseTo(quote.estimateUsd, 5);
    expect(quote.estimateInr).toBeLessThanOrEqual(quote.capInr);
    process.env.BENCHMARK_INPUT_SIZE = "1024";
    const tight = quoteBenchmark(1280, 720);
    delete process.env.BENCHMARK_INPUT_SIZE;
    expect(tight.ok).toBe(true);
    if (tight.ok) {
      expect(tight.size).toBe("1024x1024");
      expect(tight.estimateInr).toBeLessThan(quote.estimateInr);
    }
    process.env.BENCHMARK_QUALITY = "high";
    const high = quoteBenchmark(1280, 720);
    delete process.env.BENCHMARK_QUALITY;
    expect(high.ok).toBe(false);
    expect(quote.inputFidelity).toBe("high");
    const before = readFileSync("tests/fixtures/replay/long-layers-before.jpg");
    const raw = readFileSync("tests/fixtures/replay/long-layers-raw.jpg");
    const rejected = await runLockedEdit({
      image: before,
      tool: "style",
      hairExtent: "long",
      edit: async () => ({ image: raw, mime: "image/jpeg", provider: "replay", providerCostUsd: 0, latencyMs: 0 }),
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe("face-guard");
  });
});
