import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { falPollDelayMs, prepareFalUpload } from "@/lib/ai/fal-reference";
import { cropLetterbox } from "@/lib/ai/letterbox";
import { hairChange } from "@/lib/ai/look-change";
import { generationFrame } from "@/lib/generation-stage";

describe("generation stages", () => {
  it("walks the bridal lines across the expected wait", () => {
    expect(generationFrame("bridal", 0).label).toBe("Reading your face shape");
    expect(generationFrame("bridal", 5_000).label).toBe("Matching your skin tone");
    expect(generationFrame("bridal", 10_000).label).toBe("Applying the look");
    expect(generationFrame("mehendi", 10_000).label).toBe("Applying mehendi");
    expect(generationFrame("colour", 10_000).label).toBe("Colouring your hair");
    expect(generationFrame("brows", 10_000).label).toBe("Shaping your brows");
    expect(generationFrame("bridal", 17_000).pct).toBeLessThanOrEqual(92);
    expect(generationFrame("bridal", 30_000).pct).toBe(92);
  });
});

describe("hair colour no-op", () => {
  it("treats a recompressed photo as unchanged and a dyed crown as a change", async () => {
    const base = await sharp({
      create: { width: 80, height: 110, channels: 3, background: { r: 40, g: 28, b: 22 } },
    }).jpeg().toBuffer();
    const again = await sharp(base).jpeg({ quality: 80 }).toBuffer();
    const same = await hairChange(base, again);
    expect(same.unchanged).toBe(true);

    const dyed = await sharp(base)
      .composite([{
        input: await sharp({ create: { width: 80, height: 40, channels: 3, background: "#6B1D3A" } }).png().toBuffer(),
        top: 0,
        left: 0,
      }])
      .jpeg()
      .toBuffer();
    const changed = await hairChange(base, dyed);
    expect(changed.unchanged).toBe(false);
    expect(changed.hairDelta).toBeGreaterThan(8);
  });
});

describe("letterbox crop", () => {
  it("removes flat grey bars and leaves a detailed photo alone", async () => {
    const width = 120;
    const height = 180;
    const raw = Buffer.alloc(width * height * 3, 176);
    for (let y = 24; y < 156; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = (y * width + x) * 3;
        raw[p] = (x * 13 + y * 7) % 255;
        raw[p + 1] = (x * 3 + y * 11) % 255;
        raw[p + 2] = (x * 5 + 40) % 255;
      }
    }
    const padded = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const cropped = await cropLetterbox(padded);
    const meta = await sharp(cropped).metadata();
    expect(meta.height).toBeLessThan(height);
    expect(meta.height).toBeGreaterThan(110);
    expect(meta.width).toBe(width);

    const full = Buffer.alloc(64 * 80 * 3);
    for (let i = 0; i < full.length; i += 3) {
      full[i] = i % 200;
      full[i + 1] = (i * 3) % 180;
      full[i + 2] = (i * 7) % 160;
    }
    const photo = await sharp(full, { raw: { width: 64, height: 80, channels: 3 } }).png().toBuffer();
    const kept = await cropLetterbox(photo);
    const keptMeta = await sharp(kept).metadata();
    expect(keptMeta.width).toBe(64);
    expect(keptMeta.height).toBe(80);
  });
});

describe("fal upload", () => {
  it("shrinks a large selfie and polls faster than every 2 seconds", async () => {
    const big = await sharp("public/samples/portrait.jpg").resize(1200, 1600, { fit: "cover" }).png().toBuffer();
    const started = Date.now();
    const upload = await prepareFalUpload(big);
    const elapsed = Date.now() - started;
    expect(upload.beforeBytes).toBeGreaterThan(upload.afterBytes);
    expect(Math.max(upload.width, upload.height)).toBe(768);
    expect(upload.width / upload.height).toBeCloseTo(1200 / 1600, 2);
    expect(elapsed).toBeLessThan(2000);
    expect(falPollDelayMs("IN_PROGRESS")).toBe(800);
    expect(falPollDelayMs("IN_QUEUE")).toBe(1200);
    expect(falPollDelayMs("IN_PROGRESS")).toBeLessThan(2000);
  });
});
