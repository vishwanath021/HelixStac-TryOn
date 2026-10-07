import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { TryOnApp } from "@/components/tryon/TryOnApp";
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
import { captureShouldMirror, visiblePortraitCrop } from "@/lib/capture";
import { drawFrontal } from "@/lib/face/synthetic";
import { runLockedEdit } from "@/lib/face/pipeline";
import { prisma } from "@/lib/prisma";
import { hairCompositeRequested, referenceModeActive, showReferenceToggle } from "@/lib/ai/reference-mode";
import { executeReferenceEdit, tryOnReferencePayload, type ReferenceSuccess } from "@/lib/ai/reference-run";
import { buildReferencePrompt, buildStylePrompt } from "@/lib/prompts";
import type { SalonConfig } from "@/lib/salon";

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
    expect(prompt).toContain("Keep the person's natural hair texture from Image 1");
    expect(prompt).toContain("Image 2 supplies silhouette, length, layering, fringe and parting only");
    expect(prompt).not.toContain("A texture change was requested");
    expect(prompt).toContain("long-to-short");
    const curly = buildReferencePrompt(style!, undefined, "curly");
    expect(curly).toContain("A texture change was requested: the hair texture should be curly");
    expect(curly).toContain("Image 2 does not supply that texture");
    expect(curly).toContain("Keep the person's natural hair texture from Image 1");
    expect(curly).not.toMatch(/mask/i);
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

  it("crops a landscape camera frame to the portrait the preview shows", () => {
    const crop = visiblePortraitCrop(1280, 720);
    expect(crop.sh).toBe(720);
    expect(crop.sw).toBeCloseTo(540);
    expect(crop.sx).toBeCloseTo(370);
    expect(crop.sy).toBe(0);
    const portrait = visiblePortraitCrop(720, 1280);
    expect(portrait.sx).toBe(0);
    expect(portrait.sw).toBe(720);
    expect(portrait.sh).toBeCloseTo(960);
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

const salonConfig = {
  id: "tenant",
  slug: "demo-salon",
  name: "Demo",
  logoUrl: null,
  primaryColor: "#241c16",
  accentColor: "#8a5a44",
  languages: ["en"],
  defaultLang: "en",
  whatsapp: "",
  address: "",
  mapsUrl: "",
  city: "",
  plan: "starter",
  status: "ACTIVE",
  removeBranding: false,
  creditBalance: 10,
  showMen: true,
  showWomen: true,
  showKids: false,
  toolColour: false,
  toolStyle: true,
  toolBrows: false,
  toolBeard: false,
  toolNails: false,
  anonDailyCap: 3,
  memberDailyCap: 6,
  requireLoginToBook: false,
  services: [],
  styles: [],
  brows: [],
  beards: [],
  nails: [],
  shades: [],
  outlets: [],
  poweredBy: false,
} satisfies SalonConfig;

describe("salon reference switch", () => {
  it("keeps guests off the switch and keeps an unrequested try-on on the production path", () => {
    delete process.env.TRYON_REFERENCE_MODE;
    expect(showReferenceToggle(false)).toBe(false);
    expect(showReferenceToggle(true)).toBe(true);
    expect(referenceModeActive({ isSuperAdmin: false, requested: true, tool: "style" })).toBe(false);
    expect(referenceModeActive({ isSuperAdmin: true, requested: false, tool: "style" })).toBe(false);
    expect(referenceModeActive({ isSuperAdmin: true, requested: true, tool: "beard" })).toBe(false);
    expect(referenceModeActive({ isSuperAdmin: true, requested: true, tool: "style" })).toBe(true);
    process.env.TRYON_REFERENCE_MODE = "on";
    expect(showReferenceToggle(false)).toBe(false);
    expect(referenceModeActive({ isSuperAdmin: false, requested: false, tool: "style" })).toBe(false);
    expect(referenceModeActive({ isSuperAdmin: false, requested: true, tool: "style" })).toBe(true);
    delete process.env.TRYON_REFERENCE_MODE;
    const hidden = renderToStaticMarkup(createElement(TryOnApp, { config: salonConfig, referenceModeAvailable: false }));
    const shown = renderToStaticMarkup(createElement(TryOnApp, { config: salonConfig, referenceModeAvailable: true }));
    expect(hidden).not.toContain("Reference mode");
    expect(hidden).not.toContain("Hair-only composite");
    expect(hidden).not.toContain("Hair texture");
    expect(shown).toContain("Reference mode (test)");
    expect(shown).not.toContain("Hair-only composite");
    expect(shown).not.toContain("Hair texture");
    const guestSource = readFileSync("src/components/tryon/TryOnApp.tsx", "utf8");
    expect(guestSource.indexOf("Hair-only composite")).toBeGreaterThan(guestSource.indexOf("referenceMode &&"));
    expect(guestSource.indexOf("Hair texture")).toBeGreaterThan(guestSource.indexOf("referenceMode &&"));
    expect(hairCompositeRequested(false, true)).toBe(false);
    expect(hairCompositeRequested(true, false)).toBe(false);
    expect(hairCompositeRequested(true, true)).toBe(true);
    const page = readFileSync("src/app/s/[slug]/page.tsx", "utf8");
    const route = readFileSync("src/app/api/v1/tryon/generate/route.ts", "utf8");
    expect(page).toContain("showReferenceToggle");
    expect(route.indexOf("return runTryOnReference")).toBeLessThan(route.indexOf("await generateWithFailover"));
    expect(route).toContain("runTryOnReference");
  });

  it("hides the actual cost unless the viewer is a super-admin", () => {
    const run = {
      ok: true as const,
      id: "run-1",
      callId: "call-1",
      model: "gpt-image-1.5",
      quality: "medium",
      size: "1024x1024",
      estimateInr: 16.9,
      estimateUsd: 0.163,
      actualInr: 14.3,
      actualUsd: 0.149,
      latencyMs: 21200,
      usage: { inputTokens: 11180, outputTokens: 1899, imageTokens: 10885, textTokens: 295 },
      clothingWarning: "",
      imagePng: Buffer.from("png"),
      compositePng: null,
      compositeError: "",
      rawFaceDrift: false,
      faceScore: null,
      provider: "openai",
      hairComposite: false,
      message: "Unvalidated model output.",
    } satisfies ReferenceSuccess;
    const guest = tryOnReferencePayload(run, false);
    expect(guest.showCost).toBe(false);
    expect(guest.accepted).toBe(false);
    expect(guest).not.toHaveProperty("rupees");
    expect(guest).not.toHaveProperty("actualRupees");
    expect(guest).not.toHaveProperty("usage");
    expect(guest).not.toHaveProperty("faceScore");
    expect(guest).not.toHaveProperty("model");
    expect(guest.accepted).toBe(false);
    const admin = tryOnReferencePayload(run, true);
    expect(admin.showCost).toBe(true);
    expect(admin.rupees).toBe(16.9);
    expect(admin.actualRupees).toBe(14.3);
    expect(admin.label).toBe("Experimental, unvalidated");
    const warned = tryOnReferencePayload({ ...run, rawFaceDrift: true, faceScore: 0.121 }, true);
    expect(warned.accepted).toBe(false);
    expect(warned.imageBase64).toBe(Buffer.from("png").toString("base64"));
    expect(warned.faceScore).toBe(0.121);
    expect(warned.rawFaceDrift).toBe(true);
    const composite = tryOnReferencePayload({
      ...run,
      hairComposite: true,
      compositePng: Buffer.from("composite-bytes"),
      rawFaceDrift: true,
    }, false);
    expect(composite.imageBase64).toBe(Buffer.from("png").toString("base64"));
    expect(composite.compositeBase64).toBe(Buffer.from("composite-bytes").toString("base64"));
    expect(composite.rawFaceDrift).toBe(true);
    expect(JSON.stringify(composite)).not.toMatch(/gpt-image|estimateInr/);
  });

  it("sends the selfie before the reference when the switch is on, and does not call when the quote is over the run cap", async () => {
    process.env.OPENAI_API_KEY = "unit-test-key";
    process.env.AI_SPEND_CAP_INR = "500";
    await prisma.aiCall.deleteMany();
    const jpeg = await sharp({ create: { width: 480, height: 640, channels: 3, background: { r: 180, g: 140, b: 120 } } }).jpeg().toBuffer();
    const canvas = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: { r: 180, g: 140, b: 120 } } }).png().toBuffer();
    const seen: { model: string; quality: string; names: string[]; mask: FormDataEntryValue | null; prompt: string; fidelity: string }[] = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      const files = form.getAll("image[]") as File[];
      seen.push({
        model: String(form.get("model")),
        quality: String(form.get("quality")),
        names: files.map((file) => file.name),
        mask: form.get("mask"),
        prompt: String(form.get("prompt")),
        fidelity: String(form.get("input_fidelity")),
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: canvas.toString("base64") }],
        usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140, input_tokens_details: { text_tokens: 12, image_tokens: 88 } },
      }), { status: 200 });
    }) as typeof fetch;
    const result = await executeReferenceEdit({
      jpeg,
      original: jpeg,
      styleId: "pixie",
      tenantId: "reference-tryon",
      source: "tryon",
      tool: "reference",
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].model).toBe("gpt-image-1.5");
    expect(seen[0].quality).toBe("medium");
    expect(seen[0].fidelity).toBe("high");
    expect(seen[0].names).toEqual(["selfie.png", "style-reference.jpg"]);
    expect(seen[0].mask).toBeNull();
    expect(seen[0].prompt).toContain("Image 1 is the person to edit");
    expect(seen[0].prompt).toContain("exact crew neckline");
    expect(seen[0].prompt).not.toMatch(/mask/i);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.imagePng.equals(canvas)).toBe(true);
      const row = await prisma.benchmarkRun.findUnique({ where: { id: result.id } });
      expect(row?.status).toBe("UNVALIDATED");
      expect(row?.source).toBe("tryon");
      const validation = JSON.parse(readFileSync(`${row?.dir}/validation.json`, "utf8")) as { accepted: boolean; compositeApplied: boolean; maskSent: boolean };
      expect(validation.accepted).toBe(false);
      expect(validation.compositeApplied).toBe(false);
      expect(validation.maskSent).toBe(false);
    }
    process.env.BENCHMARK_QUALITY = "high";
    let hits = 0;
    globalThis.fetch = (async () => {
      hits += 1;
      return new Response("no", { status: 500 });
    }) as typeof fetch;
    const wide = await sharp({ create: { width: 1280, height: 720, channels: 3, background: { r: 20, g: 20, b: 20 } } }).jpeg().toBuffer();
    const refused = await executeReferenceEdit({
      jpeg: wide,
      original: wide,
      styleId: "pixie",
      tenantId: "reference-tryon",
      source: "tryon",
      tool: "reference",
    });
    expect(refused.ok).toBe(false);
    expect(hits).toBe(0);
    delete process.env.BENCHMARK_QUALITY;
    const previousAssets = process.env.VISION_ASSET_DIR;
    process.env.VISION_ASSET_DIR = "/tmp/helix-missing-vision-models";
    let compositeHits = 0;
    globalThis.fetch = (async () => {
      compositeHits += 1;
      return new Response("no", { status: 500 });
    }) as typeof fetch;
    const missing = await executeReferenceEdit({
      jpeg,
      original: jpeg,
      styleId: "pixie",
      tenantId: "reference-tryon",
      source: "tryon",
      tool: "reference",
      hairComposite: true,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.message).toMatch(/missing or unusable/);
    expect(compositeHits).toBe(0);
    if (previousAssets === undefined) delete process.env.VISION_ASSET_DIR;
    else process.env.VISION_ASSET_DIR = previousAssets;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_SPEND_CAP_INR;
  });
});
