import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { openLive } from "./live-entry";

const OUT = "/opt/cursor/artifacts/bridal-cam-r3";
const FACE = "tests/fixtures/live/woman-long-dark.jpg";

test("bridal camera matches everyday, and the compare keeps the original", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "android");
  test.setTimeout(180_000);
  await mkdir(OUT, { recursive: true });
  const original = await sharp(FACE).resize(1200, 1600, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
  const reveal = await sharp(FACE).resize(1200, 1600, { fit: "cover" }).modulate({ brightness: 1.05 }).jpeg({ quality: 92 }).toBuffer();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/tryon/generate", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await gate;
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: reveal });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/s/demo");
  await page.getByRole("button", { name: "Bridal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Temple & Traditional" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Keep my own hair" })).toBeVisible();
  await expect(page.getByText("Photo coming")).toHaveCount(0);
  await page.locator("[data-step='look']").screenshot({ path: `${OUT}/steps-375.png` });

  const frame = page.locator("[data-photo-box='face']");
  await expect(frame.getByRole("button", { name: "Live makeup" })).toBeVisible();
  await expect(frame.getByRole("button", { name: "Use photo" })).toBeVisible();
  await expect(frame.locator(".rounded-\\[50\\%\\]")).toHaveCount(0);
  await frame.screenshot({ path: `${OUT}/camera-375.png` });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator("[data-step='look']").screenshot({ path: `${OUT}/steps-desktop.png` });
  await frame.screenshot({ path: `${OUT}/camera-desktop.png` });

  await page.setViewportSize({ width: 375, height: 812 });
  await openLive(page, "Live makeup");
  await expect(page.locator("[data-studio='live'] .cam-shutter")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload a photo instead" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  const hint = page.getByText("Live preview", { exact: true });
  await expect(hint).toBeVisible();
  await expect(page.getByText("Tap to get the real AI look")).toBeVisible();
  await expect(page.locator("[data-studio='live'] .cam-guide-face")).toHaveCount(0);
  const hintBox = await hint.evaluate((el) => {
    const style = getComputedStyle(el);
    return { font: Number.parseFloat(style.fontSize), whiteSpace: style.whiteSpace, height: el.getBoundingClientRect().height };
  });
  expect(hintBox.font).toBe(12);
  expect(hintBox.whiteSpace).toBe("nowrap");
  expect(hintBox.height).toBeLessThan(28);
  await expect(page.getByRole("button", { name: "Lashes" })).toHaveCount(0);
  const canvas = page.locator("[data-makeup='live']");
  await expect(canvas).toHaveAttribute("data-makeup-state", "tracking", { timeout: 40_000 });
  const lip = await canvas.evaluate((el) => {
    const chroma = (rgb: number[]) => (rgb[0] ?? 0) - Math.max(rgb[1] ?? 0, rgb[2] ?? 0);
    const read = (key: string) => {
      const x = Number(el.dataset[`${key}X`]);
      const y = Number(el.dataset[`${key}Y`]);
      const copy = document.createElement("canvas");
      copy.width = el.width;
      copy.height = el.height;
      const ctx = copy.getContext("2d");
      if (!ctx || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      ctx.drawImage(el, 0, 0);
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0];
    };
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
    const outer = parse(el.dataset.outerLip);
    const inner = parse(el.dataset.innerLip);
    const copy = document.createElement("canvas");
    copy.width = el.width;
    copy.height = el.height;
    const ctx = copy.getContext("2d", { willReadFrequently: true });
    if (!ctx || outer.length < 8 || inner.length < 8) return null;
    ctx.drawImage(el, 0, 0);
    const frame = ctx.getImageData(0, 0, el.width, el.height);
    const minX = Math.max(0, Math.floor(Math.min(...outer.map((point) => point.x))));
    const maxX = Math.min(el.width - 1, Math.ceil(Math.max(...outer.map((point) => point.x))));
    const minY = Math.max(0, Math.floor(Math.min(...outer.map((point) => point.y))));
    const maxY = Math.min(el.height - 1, Math.ceil(Math.max(...outer.map((point) => point.y))));
    const edgeDist = (x: number, y: number, poly: { x: number; y: number }[]) => {
      let best = 1e9;
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const denom = abx * abx + aby * aby + 1e-6;
        const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / denom));
        best = Math.min(best, Math.hypot(x - (a.x + abx * t), y - (a.y + aby * t)));
      }
      return best;
    };
    let lipN = 0;
    let lipChroma = 0;
    let lipStrong = 0;
    let teethN = 0;
    let teethChroma = 0;
    let teethMax = 0;
    let coreN = 0;
    let coreChroma = 0;
    let coreMax = 0;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const index = (y * el.width + x) * 4;
        const score = chroma([frame.data[index] ?? 0, frame.data[index + 1] ?? 0, frame.data[index + 2] ?? 0]);
        if (inside(x + 0.5, y + 0.5, inner)) {
          teethN += 1;
          teethChroma += score;
          if (score > teethMax) teethMax = score;
          if (edgeDist(x + 0.5, y + 0.5, inner) > 2) {
            coreN += 1;
            coreChroma += score;
            if (score > coreMax) coreMax = score;
          }
        } else if (inside(x + 0.5, y + 0.5, outer)) {
          lipN += 1;
          lipChroma += score;
          if (score > 60) lipStrong += 1;
        }
      }
    }
    const padX = Math.max(6, Math.round((maxX - minX) * 0.35));
    const padY = Math.max(8, Math.round((maxY - minY) * 0.45));
    const x0 = Math.max(0, minX - padX);
    const y0 = Math.max(0, minY - padY);
    const x1 = Math.min(el.width, maxX + padX + 1);
    const y1 = Math.min(el.height, maxY + padY + 1);
    const crop = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
    return {
      lip: read("lip"),
      cheek: read("cheek"),
      lipN,
      teethN,
      lipChroma: lipN ? lipChroma / lipN : 0,
      teethChroma: teethN ? teethChroma / teethN : 0,
      teethMax,
      coreN,
      coreChroma: coreN ? coreChroma / coreN : 0,
      coreMax,
      lipStrong,
      crop: { width: crop.width, height: crop.height, data: Array.from(crop.data) },
    };
  });
  expect(lip?.lip && lip.cheek).toBeTruthy();
  if (lip?.lip && lip.cheek) {
    const chroma = (rgb: number[]) => (rgb[0] ?? 0) - Math.max(rgb[1] ?? 0, rgb[2] ?? 0);
    expect(chroma(lip.lip)).toBeGreaterThan(chroma(lip.cheek) + 18);
  }
  console.log("LIP_MASK", {
    lipN: lip?.lipN,
    teethN: lip?.teethN,
    lipChroma: lip?.lipChroma,
    teethChroma: lip?.teethChroma,
    teethMax: lip?.teethMax,
    coreN: lip?.coreN,
    coreChroma: lip?.coreChroma,
    coreMax: lip?.coreMax,
    lipStrong: lip?.lipStrong,
  });
  if (lip?.crop) {
    await sharp(Buffer.from(lip.crop.data), { raw: { width: lip.crop.width, height: lip.crop.height, channels: 4 } })
      .resize(lip.crop.width * 3, lip.crop.height * 3, { kernel: "lanczos3" })
      .png()
      .toFile(`${OUT}/lip-crop-3x.png`);
  }
  expect(lip?.lipN ?? 0).toBeGreaterThan(40);
  expect(lip?.teethN ?? 0).toBeGreaterThan(8);
  expect(lip?.coreN ?? 0).toBeGreaterThan(4);
  expect(lip?.lipChroma ?? 0).toBeGreaterThan(55);
  expect(lip?.lipChroma ?? 0).toBeGreaterThan((lip?.teethChroma ?? 0) + 35);
  expect((lip?.lipStrong ?? 0) / Math.max(1, lip?.lipN ?? 1)).toBeGreaterThan(0.4);
  expect(lip?.coreMax ?? 999).toBeLessThan(80);
  expect(lip?.coreChroma ?? 999).toBeLessThan(45);
  const latency = Number(await canvas.getAttribute("data-latency"));
  console.log("BRIDAL_LATENCY_MS", latency, "delegate", await canvas.getAttribute("data-delegate"));
  expect(latency).toBeGreaterThanOrEqual(0);
  await page.locator("[data-studio='live']").screenshot({ path: `${OUT}/live-375.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator("[data-studio='live']").screenshot({ path: `${OUT}/live-desktop.png` });
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator("[data-photo='bridal']").setInputFiles({ name: "portrait.jpg", mimeType: "image/jpeg", buffer: original });
  const shot = page.getByRole("img", { name: "Your photo" });
  await expect(shot).toBeVisible();
  await expect.poll(async () => shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1200);
  await page.getByRole("button", { name: "See Telugu Muhurtham Classic" }).click();
  const veil = page.locator("[data-generating='yes']");
  await expect(veil).toBeVisible();
  await expect(page.locator(".gen-blur")).toHaveCount(0);
  await expect(frame.locator(".gen-line")).toBeVisible();
  await expect(frame.locator(".gen-stage")).toBeVisible();
  await expect(frame.locator(".gen-ring")).toBeVisible();
  const sweep = await frame.locator(".gen-shimmer").evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(sweep)).toBeLessThanOrEqual(0.08);
  const soft = await shot.evaluate((img) => getComputedStyle(img).filter);
  expect(soft).toBe("none");
  await frame.screenshot({ path: `${OUT}/loading-375.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  await frame.screenshot({ path: `${OUT}/loading-desktop.png` });

  release?.();
  await expect(page.getByTestId("before-after")).toBeVisible({ timeout: 30_000 });
  const before = page.locator("[data-side='before']");
  await expect.poll(async () => before.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1200);
  const cover = await page.locator("[data-side='after']").evaluate((img) => {
    const box = img.parentElement?.getBoundingClientRect();
    const shot = img.getBoundingClientRect();
    if (!box || box.height === 0) return 0;
    return shot.height / box.height;
  });
  expect(cover).toBeGreaterThan(0.95);
  await expect.poll(async () => page.getByTestId("before-after").evaluate((el) => {
    let opacity = 1;
    let node: HTMLElement | null = el;
    while (node) {
      opacity *= Number(getComputedStyle(node).opacity);
      node = node.parentElement;
    }
    return opacity;
  })).toBe(1);
  await expect(page.locator("[data-testid='before-after'] .gen-veil, [data-testid='before-after'] .gen-shimmer")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByTestId("before-after").scrollIntoViewIfNeeded();
  await page.getByTestId("before-after").screenshot({ path: `${OUT}/compare-375.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByTestId("before-after").scrollIntoViewIfNeeded();
  const desktopCover = await page.locator("[data-side='after']").evaluate((img) => {
    const box = img.parentElement?.getBoundingClientRect();
    const shot = img.getBoundingClientRect();
    if (!box || box.height === 0) return 0;
    return { cover: shot.height / box.height, boxH: box.height, viewH: window.innerHeight };
  });
  expect(desktopCover.cover).toBeGreaterThan(0.95);
  expect(desktopCover.boxH).toBeLessThanOrEqual(desktopCover.viewH);
  await page.getByTestId("before-after").screenshot({ path: `${OUT}/compare-desktop.png` });
});
