import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";

const OUT = "/opt/cursor/artifacts/bridal-cam-r1";
const FACE = "tests/fixtures/live/woman-long-dark.jpg";
const SHIFTS = [
  { x: 0, y: 0 },
  { x: 4, y: 1 },
  { x: -3, y: 2 },
  { x: 2, y: -4 },
  { x: -5, y: -2 },
  { x: 6, y: 3 },
];

type EyeReport = {
  width: number;
  height: number;
  irisN: number;
  scleraN: number;
  max: number;
  changed: number;
  kajalDrop: number;
  crop: { width: number; height: number; data: number[] } | null;
};

async function webcamFrames() {
  const degraded = await sharp(FACE)
    .resize(640, 480, { fit: "cover" })
    .convolve({
      width: 5,
      height: 3,
      kernel: [0, 0, 0, 0, 0, 1, 2, 6, 2, 1, 0, 0, 0, 0, 0],
      scale: 12,
    })
    .jpeg({ quality: 60 })
    .toBuffer();
  const frames: Buffer[] = [];
  for (const shift of SHIFTS) {
    frames.push(
      await sharp(degraded)
        .affine([1, 0, 0, 1], { idx: shift.x, idy: shift.y, background: "#1a1410" })
        .jpeg({ quality: 60 })
        .toBuffer(),
    );
  }
  return frames;
}

async function readEyes(page: Page): Promise<EyeReport | null> {
  return page.evaluate(() => {
    const makeup = document.querySelector("canvas[data-look='makeup']") as HTMLCanvasElement | null;
    const plain = document.querySelector("canvas[data-look='plain']") as HTMLCanvasElement | null;
    if (!makeup || !plain) return null;
    const copy = (canvas: HTMLCanvasElement) => {
      const next = document.createElement("canvas");
      next.width = canvas.width;
      next.height = canvas.height;
      const ctx = next.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(canvas, 0, 0);
      return ctx.getImageData(0, 0, next.width, next.height);
    };
    const painted = copy(makeup);
    const clean = copy(plain);
    if (!painted || !clean || painted.width !== clean.width || painted.height !== clean.height) return null;
    const luma = (data: Uint8ClampedArray, index: number) =>
      0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0);
    const parse = (raw: string | undefined) => {
      const nums = (raw || "").split(",").map(Number);
      const poly: { x: number; y: number }[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) poly.push({ x: nums[i] ?? 0, y: nums[i + 1] ?? 0 });
      return poly;
    };
    const inside = (x: number, y: number, poly: { x: number; y: number }[]) => {
      let hit = false;
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const up = a.y > y !== b.y > y;
        if (!up) continue;
        const xCross = ((b.x - a.x) * (y - a.y)) / (b.y - a.y + 1e-6) + a.x;
        if (x < xCross) hit = !hit;
      }
      return hit;
    };
    const width = painted.width;
    const height = painted.height;
    let max = 0;
    let irisN = 0;
    let scleraN = 0;
    const seen = new Set<number>();
    const sample = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const index = (y * width + x) * 4;
      if (seen.has(index)) return;
      seen.add(index);
      const delta = Math.abs(luma(painted.data, index) - luma(clean.data, index));
      if (delta > max) max = delta;
    };
    for (const point of parse(makeup.dataset.iris)) {
      sample(point.x, point.y);
      irisN += 1;
    }
    const eyes = [parse(makeup.dataset.eyeR), parse(makeup.dataset.eyeL)];
    for (const poly of eyes) {
      if (poly.length < 8) continue;
      const minX = Math.max(0, Math.floor(Math.min(...poly.map((point) => point.x))));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(...poly.map((point) => point.x))));
      const minY = Math.max(0, Math.floor(Math.min(...poly.map((point) => point.y))));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(...poly.map((point) => point.y))));
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (!inside(x + 0.5, y + 0.5, poly)) continue;
          sample(x, y);
          scleraN += 1;
        }
      }
    }
    let kajalDrop = 0;
    for (const poly of eyes) {
      if (poly.length < 8) continue;
      const center = poly.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
      center.x /= poly.length;
      center.y /= poly.length;
      for (const point of poly) {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        const mag = Math.hypot(dx, dy) || 1;
        for (const distance of [2, 3, 4]) {
          const x = Math.round(point.x + (dx / mag) * distance);
          const y = Math.round(point.y + (dy / mag) * distance);
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          if (inside(x + 0.5, y + 0.5, poly)) continue;
          const index = (y * width + x) * 4;
          const drop = luma(clean.data, index) - luma(painted.data, index);
          if (drop > kajalDrop) kajalDrop = drop;
        }
      }
    }
    let changed = 0;
    const step = 4;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const index = (y * width + x) * 4;
        if (Math.abs(luma(painted.data, index) - luma(clean.data, index)) > 8) changed += 1;
      }
    }
    const poly = eyes.reduce((best, next) => (next.length > best.length ? next : best), eyes[0] ?? []);
    let crop: EyeReport["crop"] = null;
    if (poly.length >= 8) {
      const minX = Math.max(0, Math.floor(Math.min(...poly.map((point) => point.x))));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(...poly.map((point) => point.x))));
      const minY = Math.max(0, Math.floor(Math.min(...poly.map((point) => point.y))));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(...poly.map((point) => point.y))));
      const padX = Math.max(8, Math.round((maxX - minX) * 0.45));
      const padY = Math.max(10, Math.round((maxY - minY) * 0.7));
      const x0 = Math.max(0, minX - padX);
      const y0 = Math.max(0, minY - padY);
      const x1 = Math.min(width, maxX + padX + 1);
      const y1 = Math.min(height, maxY + padY + 1);
      const cropW = x1 - x0;
      const cropH = y1 - y0;
      const data: number[] = [];
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = (y * width + x) * 4;
          data.push(painted.data[index] ?? 0, painted.data[index + 1] ?? 0, painted.data[index + 2] ?? 0, 255);
        }
      }
      crop = { width: cropW, height: cropH, data };
    }
    return { width, height, irisN, scleraN, max, changed, kajalDrop, crop };
  });
}

test("webcam live makeup leaves the iris and sclera within 6 luma", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "android");
  test.setTimeout(180_000);
  await mkdir(OUT, { recursive: true });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("BROWSER", msg.text());
  });
  const frames = await webcamFrames();
  await page.goto("/live-eye-check");
  await page.waitForFunction(() => typeof (window as Window & { __setLiveFrame?: unknown }).__setLiveFrame === "function");

  let crop: EyeReport["crop"] = null;
  for (let index = 0; index < frames.length; index += 1) {
    const stamp = String(index + 1);
    const url = `data:image/jpeg;base64,${frames[index]!.toString("base64")}`;
    await page.evaluate((src) => {
      (window as Window & { __setLiveFrame?: (value: string) => void }).__setLiveFrame?.(src);
    }, url);
    const makeup = page.locator("canvas[data-look='makeup']");
    const plain = page.locator("canvas[data-look='plain']");
    await expect(makeup).toHaveAttribute("data-stamp", stamp, { timeout: 90_000 });
    await expect(plain).toHaveAttribute("data-stamp", stamp, { timeout: 90_000 });
    await expect(makeup).toHaveAttribute("data-state", "tracking");
    await expect(plain).toHaveAttribute("data-state", "tracking");
    const report = await readEyes(page);
    expect(report, `frame ${stamp}`).toBeTruthy();
    if (!report) return;
    console.log("EYE", stamp, { max: report.max, irisN: report.irisN, scleraN: report.scleraN, changed: report.changed, kajalDrop: report.kajalDrop, size: `${report.width}x${report.height}` });
    expect(report.width, stamp).toBe(640);
    expect(report.height, stamp).toBe(480);
    expect(report.irisN, stamp).toBe(10);
    expect(report.scleraN, stamp).toBeGreaterThan(40);
    expect(report.changed, stamp).toBeGreaterThan(8);
    expect(report.kajalDrop, stamp).toBeGreaterThan(8);
    expect(report.max, stamp).toBeLessThanOrEqual(6);
    crop = report.crop;
  }

  expect(crop).toBeTruthy();
  if (!crop) return;
  await sharp(Buffer.from(crop.data), { raw: { width: crop.width, height: crop.height, channels: 4 } })
    .resize(crop.width * 3, crop.height * 3, { kernel: "lanczos3" })
    .png()
    .toFile(`${OUT}/eye-crop-3x.png`);
});
