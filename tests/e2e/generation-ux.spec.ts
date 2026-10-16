import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 } });

const OUT = "/opt/cursor/artifacts/gen-ux-r1";

test("the bridal photo shows the loading sweep, then a crossfade", async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(OUT, { recursive: true });
  const reveal = await sharp("public/samples/portrait.jpg")
    .modulate({ saturation: 1.6, brightness: 1.05 })
    .tint("#6B1D3A")
    .jpeg()
    .toBuffer();
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
  await page.locator("[data-photo='bridal']").setInputFiles("public/samples/portrait.jpg");
  await expect(page.getByRole("img", { name: "Your selfie" })).toBeVisible();
  await page.getByRole("button", { name: "See Telugu Muhurtham Classic" }).click();
  const box = page.locator("[data-photo-box='face']");
  const veil = page.locator("[data-generating='yes']");
  await expect(veil).toBeVisible();
  await expect(page.getByRole("button", { name: "Almost ready..." })).toHaveCount(0);
  await expect(page.getByText("Almost ready...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Live makeup" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use photo" })).toHaveCount(0);
  await expect(veil).toHaveAttribute("data-stage", "Reading your face shape");
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
