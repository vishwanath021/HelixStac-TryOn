import { createHmac, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

function salonModeToken(tenantId: string, nonce: string) {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const body = `${tenantId}.${nonce}.${exp}`;
  const sig = createHmac("sha256", "test-secret-not-for-production-use-32").update(body).digest("base64url");
  return Buffer.from(`${body}.${sig}`).toString("base64url");
}

async function salonDb() {
  process.env.DATABASE_URL ||= "file:./dev.db";
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

test.beforeAll(async () => {
  const prisma = await salonDb();
  await prisma.tenant.update({
    where: { slug: "demo-salon" },
    data: { anonDailyCap: 40, requireLoginToBook: false, toolBeard: true, toolNails: true },
  });
  await prisma.$disconnect();
});

test.afterAll(async () => {
  const prisma = await salonDb();
  await prisma.tenant.update({
    where: { slug: "demo-salon" },
    data: { anonDailyCap: 8, memberDailyCap: 30, requireLoginToBook: false },
  });
  await prisma.$disconnect();
});

test("customer can consent, use the camera, preview a cut, and an owner can open the dashboard", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /try-on page with your name/i })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/01-home.png", fullPage: true });

  await page.goto("/s/demo-salon");
  await expect(page.getByRole("heading", { name: "Demo Salon – Bengaluru" })).toBeVisible();
  await expect(page.getByText(/before we use a photo/i)).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/02-consent.png", fullPage: true });

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /i agree/i }).click();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByText("Demo mode – connect an AI key for real hairstyle previews")).toBeVisible();
  await expect(page.getByRole("tab", { name: "COLOUR" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "STYLE" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "BROWS" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "BEARD" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "NAILS" })).toBeEnabled();
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

  await page.getByRole("tab", { name: "BEARD" }).click();
  await expect(page.getByText("Men's facial hair. Pick a style below — it takes about 10 seconds")).toBeVisible();
  const beards = page.getByRole("region", { name: "Beards" });
  await beards.getByRole("button", { name: "Short Boxed" }).click();
  await expect(page.getByText("AI preview — actual results vary by facial hair growth. Consult your stylist.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "BOOK THIS BEARD" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/04-beard.png", fullPage: true });
  await page.getByRole("button", { name: "TRY ANOTHER BEARD" }).click();

  await page.getByRole("tab", { name: "NAILS" }).click();
  await expect(page.getByText("Pick a nail design below — it takes about 10 seconds")).toBeVisible();
  const nails = page.getByRole("region", { name: "Nails" });
  await nails.getByRole("button", { name: "Classic French" }).click();
  await expect(page.getByText("AI preview — actual results vary by nail shape and the polish used in the salon. Consult your artist.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "BOOK THIS SET" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/04-nails.png", fullPage: true });
  await page.getByRole("button", { name: "TRY ANOTHER DESIGN" }).click();

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
  await gallery.getByRole("button", { name: "Kids", exact: true }).click();
  await expect(gallery.getByRole("button", { name: "Kids Soft Bob" })).toBeVisible();
  await gallery.getByRole("button", { name: "Women", exact: true }).click();
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

  await page.goto("/s/demo-salon/guide");
  await expect(page.getByRole("heading", { name: "Style ideas" })).toBeVisible();
  await page.getByRole("button", { name: "Show ideas" }).first().click();
  await expect(page.getByText(/not a measurement/i)).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/10-guide.png", fullPage: true });

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

test("anonymous daily cap explains the limit and salon mode lifts it", async ({ page }) => {
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo-salon" }, data: { anonDailyCap: 0 } });
  try {
    await page.goto("/s/demo-salon");
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /i agree/i }).click();
    await page.locator('input[type="file"]').setInputFiles("public/samples/portrait.jpg");
    await page.getByRole("tab", { name: "STYLE" }).click();
    await page.getByRole("region", { name: "Styles" }).getByRole("button", { name: "Pixie" }).click();
    await expect(page.getByText(/today's previews used up/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Phone code" })).toHaveCount(0);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-salon" } });
    const nonce = randomBytes(9).toString("base64url");
    await prisma.tenant.update({ where: { id: tenant.id }, data: { salonNonce: nonce } });
    const token = salonModeToken(tenant.id, nonce);
    await page.goto(`/s/demo-salon?salon=${encodeURIComponent(token)}&tool=style`);
    await expect(page.getByText(/Salon mode/i)).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /i agree/i }).click();
    await page.locator('input[type="file"]').setInputFiles("public/samples/portrait.jpg");
    await page.getByRole("region", { name: "Styles" }).getByRole("button", { name: "Pixie" }).click();
    await expect(page.getByText("AI preview — actual results vary by hair type. Consult your stylist.")).toBeVisible({ timeout: 20_000 });
  } finally {
    await prisma.tenant.update({ where: { slug: "demo-salon" }, data: { anonDailyCap: 40 } });
    await prisma.$disconnect();
  }
});

test("booking asks for a phone code only when the salon requires it", async ({ page }) => {
  test.setTimeout(90_000);
  process.env.DATABASE_URL ||= "file:./dev.db";
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.tenant.update({ where: { slug: "demo-salon" }, data: { requireLoginToBook: true, anonDailyCap: 40 } });
  try {
    await page.goto("/s/demo-salon");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /i agree/i }).click();
    await page.locator('input[type="file"]').setInputFiles("public/samples/portrait.jpg");
    await page.getByRole("tab", { name: "STYLE" }).click();
    await page.getByRole("region", { name: "Styles" }).getByRole("button", { name: "French Bob" }).click();
    await expect(page.getByRole("button", { name: "BOOK THIS LOOK" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "BOOK THIS LOOK" }).click();
    await expect(page).toHaveURL(/\/s\/demo-salon\/me\?book=1/);
    await page.screenshot({ path: "docs/screenshots/11-hub.png", fullPage: true });
    await page.getByLabel("Mobile number").fill("9800099111");
    await page.getByRole("button", { name: "Send code" }).click();
    const dev = page.getByTestId("dev-otp");
    await expect(dev).toBeVisible();
    const code = (await dev.innerText()).match(/\d{6}/)?.[0];
    expect(code).toBeTruthy();
    await page.getByRole("textbox", { name: "Code", exact: true }).fill(code || "");
    await page.getByRole("button", { name: "Verify" }).click();
    await page.getByLabel("Your name").fill("Asha Rao");
    await page.getByLabel("Date of birth").fill("1992-04-12");
    await page.getByRole("radio", { name: "Women" }).check();
    await page.getByLabel("Hair length").selectOption("shoulder");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Request a time" })).toBeVisible();
    await page.getByLabel("Preferred date").fill("2026-10-20");
    await page.getByRole("button", { name: "Request a time" }).click();
    await expect(page.getByText("Request sent. The salon will confirm.")).toBeVisible();
    await expect(page.getByText("Pending").first()).toBeVisible();

    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@demo.helixstac.app");
    await page.getByLabel("Password").fill("DemoSalon#2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: /this month/i })).toBeVisible();
    await page.goto("/admin/bookings");
    await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
    await expect(page.getByText("Asha Rao")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/12-bookings.png", fullPage: true });
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Confirm" }).first().click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/919800099111/);
    await popup.close();
  } finally {
    await prisma.tenant.update({ where: { slug: "demo-salon" }, data: { requireLoginToBook: false, anonDailyCap: 40 } });
    await prisma.customer.deleteMany({ where: { phone: "919800099111" } });
    await prisma.$disconnect();
  }
});

test("super admin sees assumed COGS", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("super@helixstac.app");
  await page.getByLabel("Password").fill("SuperAdmin#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/assumption/i)).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/09-super.png", fullPage: true });
});
