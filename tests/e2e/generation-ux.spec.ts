import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 } });

const OUT = "/opt/cursor/artifacts/gen-ux-r2";
const FACE = "tests/fixtures/live/woman-long-dark.jpg";

test("the bridal photo shows the loading sweep, then a crossfade", async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(OUT, { recursive: true });
  const reveal = await sharp(FACE).modulate({ saturation: 1.08, brightness: 1.02 }).jpeg({ quality: 90 }).toBuffer();
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
    await route.fulfill({
      status: 200,
      contentType: "image/jpeg",
      body: reveal,
    });
  });

  await page.clock.install();
  await page.goto("/s/demo");
  await page.getByRole("button", { name: "Bridal", exact: true }).click();
  await page.locator("[data-photo='bridal']").setInputFiles(FACE);
  await expect(page.getByRole("img", { name: "Your photo" })).toBeVisible();
  await page.getByRole("button", { name: "See Telugu Muhurtham Classic" }).click();
  const box = page.locator("[data-photo-box='face']");
  const veil = page.locator("[data-generating='yes']");
  await expect(veil).toBeVisible();
  await expect(page.getByRole("button", { name: "Almost ready..." })).toHaveCount(0);
  await expect(page.getByText("Almost ready...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Live makeup" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use photo" })).toHaveCount(0);
  await expect(veil).toHaveAttribute("data-stage", "Reading your face shape");
  const photo = await box.boundingBox();
  const ring = await box.locator(".gen-corner").boundingBox();
  const stage = box.locator(".gen-stage");
  const stageBox = await stage.boundingBox();
  expect(photo && ring && stageBox).toBeTruthy();
  expect(ring!.y + ring!.height / 2).toBeGreaterThan(photo!.y + photo!.height * 0.72);
  expect(ring!.x).toBeGreaterThan(photo!.x + photo!.width * 0.7);
  expect(stageBox!.x + stageBox!.width).toBeLessThanOrEqual(ring!.x + 4);
  const ink = await stage.evaluate((el) => {
    const style = getComputedStyle(el);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(ink.color).toBe("rgb(255, 255, 255)");
  expect(ink.background).toBe("rgba(41, 35, 48, 0.82)");
  await box.screenshot({ path: `${OUT}/loading-1.png` });

  await page.clock.fastForward(20_000);
  await expect(veil).toHaveAttribute("data-stage", "Matching your skin tone");
  await box.screenshot({ path: `${OUT}/loading-2.png` });

  await page.clock.fastForward(16_000);
  await expect(veil).toHaveAttribute("data-stage", "Applying the look");
  await box.screenshot({ path: `${OUT}/loading-3.png` });

  release?.();
  await expect(page.getByRole("heading", { name: "Telugu Muhurtham Classic" })).toBeVisible();
  await expect(veil).toHaveCount(0);
  await expect(box.locator("img.gen-reveal")).toBeVisible();
  await box.screenshot({ path: `${OUT}/reveal.png` });
});
