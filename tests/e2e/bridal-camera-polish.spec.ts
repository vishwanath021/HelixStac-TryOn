import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { openLive } from "./live-entry";

const OUT = "/opt/cursor/artifacts/bridal-cam-r2";
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
  const hint = page.getByText("Live preview · Capture for the real AI look");
  await expect(hint).toBeVisible();
  await expect(page.locator("[data-studio='live'] .cam-guide-face")).toHaveCount(0);
  expect(await hint.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
  await expect(page.getByRole("button", { name: "Lashes" })).toHaveCount(0);
  const canvas = page.locator("[data-makeup='live']");
  await expect(canvas).toHaveAttribute("data-makeup-state", "tracking", { timeout: 40_000 });
  const lip = await canvas.evaluate((el) => {
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
    return { lip: read("lip"), cheek: read("cheek") };
  });
  expect(lip?.lip && lip.cheek).toBeTruthy();
  if (lip?.lip && lip.cheek) {
    const chroma = (rgb: number[]) => (rgb[0] ?? 0) - Math.max(rgb[1] ?? 0, rgb[2] ?? 0);
    expect(chroma(lip.lip)).toBeGreaterThan(chroma(lip.cheek) + 18);
  }
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
