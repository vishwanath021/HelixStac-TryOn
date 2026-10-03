import { expect, test } from "@playwright/test";

test("customer can consent, use the camera, preview a cut, and an owner can open the dashboard", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /try-on page with your name/i })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/01-home.png", fullPage: true });

  await page.goto("/s/demo-salon");
  await expect(page.getByRole("heading", { name: "Demo Salon – Bengaluru" })).toBeVisible();
  await expect(page.getByText(/before we use a photo/i)).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/02-consent.png", fullPage: true });

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /i agree/i }).click();
  await expect(page.getByRole("tab", { name: "COLOUR" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "STYLE" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "BROWS" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "NAIL ART" })).toBeDisabled();
  await expect(page.getByText("Use your front camera for a live mirror, or upload a selfie")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/03-start.png", fullPage: true });

  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await expect(page.getByText("Tap the shutter above to take your photo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Burgundy" })).toBeVisible();
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    if (!video || video.videoWidth < 10) return false;
    const scratch = document.createElement("canvas");
    scratch.width = 8;
    scratch.height = 8;
    const ctx = scratch.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, 8, 8);
    const pixel = ctx.getImageData(4, 4, 1, 1).data;
    return pixel[0] + pixel[1] + pixel[2] > 30;
  });
  await page.screenshot({ path: "docs/screenshots/03-camera.png", fullPage: true });
  await page.getByRole("button", { name: "Take photo" }).click();

  await page.getByRole("tab", { name: "BROWS" }).click();
  await expect(page.getByText("Now pick a brow shape below — it takes about 10 seconds")).toBeVisible();
  const brows = page.getByRole("region", { name: "Brows" });
  await brows.getByRole("button", { name: "Soft Arch" }).click();
  await expect(page.getByText("AI preview — actual results vary by natural brow hair and growth. Consult your artist.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("slider", { name: /BEFORE \/ AFTER/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "BOOK THIS", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "DOWNLOAD" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/04-brows.png", fullPage: true });
  await page.getByRole("button", { name: "TRY ANOTHER SHAPE" }).click();
  await expect(brows.getByRole("button", { name: "Straight Brow" })).toBeVisible();
  await expect(brows.getByRole("button", { name: "Feathered" })).toBeVisible();

  await page.getByRole("tab", { name: "STYLE" }).click();
  const gallery = page.getByRole("region", { name: "Styles" });
  await expect(gallery.getByRole("button", { name: "Women" })).toBeVisible();
  await gallery.getByRole("button", { name: "Soft Bob" }).click();
  await expect(page.getByText("AI preview — actual results vary by hair type. Consult your stylist.")).toBeVisible({ timeout: 20_000 });
  const slider = page.getByRole("slider", { name: /BEFORE \/ AFTER/i });
  await expect(slider).toBeVisible();
  await expect(page.getByText("BEFORE", { exact: true })).toBeVisible();
  await expect(page.getByText("AFTER", { exact: true })).toBeVisible();
  await slider.fill("30");
  await expect(page.getByRole("button", { name: "BOOK THIS LOOK" })).toBeVisible();
  await expect(page.getByRole("button", { name: "DOWNLOAD" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/04-preview.png", fullPage: true });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "DOWNLOAD" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.jpg$/);

  await page.getByRole("button", { name: "TRY ANOTHER STYLE" }).click();
  await expect(gallery.getByRole("button", { name: "Soft Bob" })).toBeVisible();
  await expect(gallery.getByRole("button", { name: "Wolf Cut" })).toBeVisible();
  await gallery.getByRole("button", { name: "Wolf Cut" }).click();
  await expect(page.getByRole("heading", { name: /Wolf Cut/ })).toBeVisible({ timeout: 20_000 });

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "BOOK THIS LOOK" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/919800011122/);
  const booking = decodeURIComponent(popup.url()).replaceAll("+", " ");
  expect(booking).toContain("Look: Wolf Cut");
  expect(booking).toContain("Haircut");
  await popup.close();

  await page.getByRole("tab", { name: "COLOUR" }).click();
  await page.locator('input[type="file"]').setInputFiles("public/samples/portrait.jpg");
  await expect(page.getByRole("button", { name: "Cherry Red" })).toBeVisible();
  await page.getByRole("button", { name: "Cherry Red" }).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas || canvas.width < 10) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const pixel = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 5), 1, 1).data;
    return pixel[0] + pixel[1] + pixel[2] > 30;
  }, undefined, { timeout: 20_000 });
  await page.screenshot({ path: "docs/screenshots/03-colour.png", fullPage: true });

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@demo.helixstac.app");
  await page.getByLabel("Password").fill("DemoSalon#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /this month/i })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/05-admin.png", fullPage: true });

  await page.goto("/admin/leads");
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Wolf Cut/ }).first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/06-leads.png", fullPage: true });

  await page.goto("/admin/billing");
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/07-billing.png", fullPage: true });

  await page.goto("/admin/qr");
  await expect(page.getByRole("heading", { name: /qr and embed/i })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/08-qr.png", fullPage: true });
});

test("denied camera offers an upload fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })),
      },
    });
  });
  await page.goto("/s/demo-salon");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /i agree/i }).click();
  await page.getByRole("button", { name: "START CAMERA" }).click();
  await expect(page.getByText(/camera is not available/i)).toBeVisible();
  await expect(page.locator("button", { hasText: "Upload photo" })).toBeVisible();
});

test("super admin sees assumed COGS", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("super@helixstac.app");
  await page.getByLabel("Password").fill("SuperAdmin#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/assumption/i)).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/09-super.png", fullPage: true });
});
