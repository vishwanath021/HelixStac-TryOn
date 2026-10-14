import { readFileSync } from "node:fs";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";

const selfiePath = "tests/fixtures/portraits/glasses-beard.jpg";

async function shiftedProvider() {
  const input = readFileSync(selfiePath);
  const meta = await sharp(input).metadata();
  const width = meta.width || 512;
  const height = meta.height || 768;
  const scale = 1.18;
  const scaledW = Math.round(width * scale);
  const scaledH = Math.round(height * scale);
  const scaled = await sharp(input).resize(scaledW, scaledH, { fit: "fill" }).toBuffer();
  const outW = scaledW + 96;
  const outH = scaledH + 120;
  return sharp({
    create: { width: outW, height: outH, channels: 3, background: { r: 196, g: 168, b: 120 } },
  })
    .composite([{ input: scaled, left: 18, top: 88 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function previewShifted(page: Page, shifted: Buffer) {
  await page.route("**/api/v1/tryon/generate", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "image/jpeg",
      headers: { "x-tryon-id": "align-e2e", "cache-control": "no-store" },
      body: shifted,
    });
  });
  await page.goto("/s/demo");
  await page.locator("input[data-photo='gallery']").setInputFiles(selfiePath);
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await page.getByRole("region", { name: "Styles" }).getByRole("button", { name: "Soft Bob" }).click();
  await expect(page.getByRole("heading", { name: "Soft Bob", exact: true })).toBeVisible({ timeout: 60_000 });
}

test("a shifted provider image lines up with the selfie", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The check is on image pixels.");
  test.setTimeout(90_000);
  const shifted = await shiftedProvider();
  await previewShifted(page, shifted);
  const slider = page.getByTestId("before-after");
  await expect(slider).toHaveAttribute("data-align-mode", "landmarks");
  const delta = Number(await slider.getAttribute("data-eye-delta"));
  expect(delta).toBeLessThan(8);
  const sizes = await slider.locator("img").evaluateAll((images) => images.map((image) => ({
    w: (image as HTMLImageElement).naturalWidth,
    h: (image as HTMLImageElement).naturalHeight,
  })));
  expect(sizes).toHaveLength(2);
  expect(sizes[0]).toEqual(sizes[1]);
  expect(sizes[0].w).toBeGreaterThan(10);
  await expect(page.getByTestId("provider-image")).toHaveCount(0);
});

test("a super-admin can open the unaligned provider image", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The check is on image pixels.");
  test.setTimeout(90_000);
  const shifted = await shiftedProvider();
  await page.goto("/login");
  await expect(page.locator("form[data-ready='yes']")).toBeVisible();
  await page.getByLabel("Email").fill("super@agenticbuildworks.com");
  await page.getByLabel("Password").fill("SuperAdmin#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Lookuvi" })).toBeVisible();
  await previewShifted(page, shifted);
  const raw = page.getByTestId("provider-image");
  await expect(raw).toBeVisible();
  const href = await raw.getAttribute("href");
  const after = await page.getByRole("img", { name: "AFTER" }).getAttribute("src");
  expect(href?.startsWith("blob:")).toBe(true);
  expect(href).not.toBe(after);
  await expect(page.getByTestId("before-after")).toHaveAttribute("data-align-mode", "landmarks");
});
