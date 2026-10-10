import { createHmac, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { contrastRatio } from "@/lib/contrast";

function rgbToHex(rgb: string) {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(rgb);
  return `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

async function buttonContrast(locator: import("@playwright/test").Locator) {
  const colors = await locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return { color: style.color, background: style.backgroundColor };
  });
  return contrastRatio(rgbToHex(colors.color), rgbToHex(colors.background));
}

function salonModeToken(tenantId: string, nonce: string) {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const body = `${tenantId}.${nonce}.${exp}`;
  const sig = createHmac("sha256", "test-secret-not-for-production-use-32").update(body).digest("base64url");
  return Buffer.from(`${body}.${sig}`).toString("base64url");
}

async function acceptPhotoUse(page: import("@playwright/test").Page) {
  await page.getByRole("checkbox", { name: /photo is used only/i }).check();
}

async function artifact(page: import("@playwright/test").Page, name: string) {
  const width = page.viewportSize()?.width ?? 0;
  const device = width >= 768 ? "desktop" : "phone";
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}-${device}.png`, fullPage: true });
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
    data: { anonDailyCap: 200, requireLoginToBook: false, toolBeard: true, toolNails: true },
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
  await expect(page.getByRole("heading", { name: "See your next look." })).toBeVisible();
  const salonName = page.getByRole("heading", { level: 1, name: "Demo Salon – Bengaluru" });
  await expect(salonName).toBeVisible();
  await expect(salonName).toHaveText("Demo Salon – Bengaluru");
  await expect.poll(() => salonName.evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)).toBe(false);
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const header = page.locator("header");
  for (const label of ["Book Now", "WhatsApp"]) {
    const box = await header.getByRole("link", { name: label }).boundingBox();
    expect(box).toBeTruthy();
    expect(box && box.x >= 0 && box.x + box.width <= viewportWidth + 1).toBe(true);
  }
  await expect.poll(() => page.evaluate(() => {
    const badge = document.querySelector("nextjs-portal")?.shadowRoot?.querySelector("[data-next-badge]");
    return badge?.getAttribute("data-error") ?? "absent";
  })).not.toBe("true");
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByText("Demo", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/demo mode/i)).toHaveCount(0);
  await artifact(page, "guest-before");
  await expect(page.getByText(/before we use a photo/i)).toHaveCount(0);
  const gallery = page.getByRole("region", { name: "Styles" });
  await expect(gallery.getByRole("button", { name: "Women", exact: true })).toBeVisible();
  await expect(gallery.locator("img")).toHaveCount(26);
  await expect(gallery.getByRole("button", { name: "Soft Bob" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/01-home.png", fullPage: true });
  await page.screenshot({ path: "docs/screenshots/16-landing-grid.png", fullPage: true });
  await page.screenshot({ path: "docs/screenshots/13-gallery-women.png", fullPage: true });

  await gallery.getByRole("button", { name: "Men", exact: true }).click();
  await expect(gallery.locator("img")).toHaveCount(29);
  await expect(gallery.getByRole("button", { name: "Mid Fade" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/14-gallery-men.png", fullPage: true });
  await gallery.getByRole("button", { name: "Women", exact: true }).click();

  await gallery.getByRole("button", { name: "Soft Bob" }).click();
  await expect(page.getByText("Add your photo first")).toBeVisible();
  await expect(gallery.getByRole("button", { name: "Soft Bob" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Take selfie" }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
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
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/17-after-photo.png", fullPage: true });

  await acceptPhotoUse(page);
  await gallery.getByRole("button", { name: "Soft Bob" }).click();
  await page.getByRole("button", { name: "Try this look" }).click();
  await expect(page.getByText("Styling your look...")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Soft Bob" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("section[aria-label=Photo]")).toHaveClass(/is-ready/);
  await expect(page.getByText("Demo", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/demo mode/i)).toHaveCount(0);
  const slider = page.getByRole("slider", { name: /BEFORE \/ AFTER/i });
  await expect(slider).toBeVisible();
  await slider.fill("30");
  await artifact(page, "result-slider");
  await expect(page.getByRole("button", { name: "Book this look" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(gallery.getByRole("button", { name: "Wolf Cut" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/04-preview.png", fullPage: true });
  await page.screenshot({ path: "docs/screenshots/15-demo-result.png", fullPage: true });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.jpg$/);
  await page.getByRole("button", { name: "Try another" }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await expect(gallery.getByRole("button", { name: "Kids Soft Bob" })).toHaveCount(0);
  await gallery.getByRole("button", { name: "Kids", exact: true }).click();
  await expect(gallery.locator("img")).toHaveCount(4);

  await page.locator('input[data-photo="gallery"]').setInputFiles("public/samples/portrait.jpg");
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await page.getByRole("tab", { name: "Brows" }).click();
  const brows = page.getByRole("region", { name: "Brows" });
  await brows.getByRole("button", { name: "Soft Arch" }).click();
  await page.getByRole("button", { name: "Try this look" }).click();
  await expect(page.getByRole("heading", { name: "Soft Arch" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/04-brows.png", fullPage: true });

  await page.getByRole("tab", { name: "Beard" }).click();
  await page.getByRole("region", { name: "Beards" }).getByRole("button", { name: "Short Boxed" }).click();
  await page.getByRole("button", { name: "Try this look" }).click();
  await expect(page.getByRole("heading", { name: "Short Boxed" })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "docs/screenshots/04-beard.png", fullPage: true });

  await page.getByRole("tab", { name: "Nails" }).click();
  await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/04-nails.png", fullPage: true });

  await page.getByRole("tab", { name: "Hair style" }).click();
  await gallery.getByRole("button", { name: "Women", exact: true }).click();
  await gallery.getByRole("button", { name: "Wolf Cut" }).click();
  await page.getByRole("button", { name: "Try this look" }).click();
  await expect(page.getByRole("heading", { name: "Wolf Cut" })).toBeVisible({ timeout: 20_000 });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Book this look" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/919800011122/);
  const booking = decodeURIComponent(popup.url()).replaceAll("+", " ");
  expect(booking).toContain("Look: Wolf Cut");
  expect(booking).toContain("Haircut");
  await popup.close();

  await page.getByRole("tab", { name: "Hair colour" }).click();
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

test("brows, beard, and nails use photo cards and the same demo result", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/s/demo-salon");
  await expect(page.getByRole("tab", { name: "Hair style" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Brows" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Nails" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Beard" })).toBeVisible();

  async function expectPhotos(region: string, count: number, folder: string) {
    await page.getByRole("tab", { name: region === "Beards" ? "Beard" : region }).click();
    const grid = page.getByRole("region", { name: region });
    const imgs = grid.locator("img");
    await expect(imgs).toHaveCount(count);
    await expect(imgs.first()).toHaveAttribute("src", new RegExp(`/${folder}/.+\\.jpg`));
    await expect.poll(() => imgs.evaluateAll((nodes) => nodes.every((node) => {
      const img = node as HTMLImageElement;
      return img.complete && img.naturalWidth > 0;
    }))).toBe(true);
    return grid;
  }

  const brows = await expectPhotos("Brows", 7, "brows");
  await expect(brows.getByRole("button", { name: "Women", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "docs/screenshots/18-brows-grid.png", fullPage: true });
  const beards = await expectPhotos("Beards", 10, "beards");
  await expect(beards.getByRole("button", { name: "Women", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "docs/screenshots/19-beard-grid.png", fullPage: true });
  const nails = await expectPhotos("Nails", 10, "nails");
  await expect(nails.getByRole("button", { name: "Women", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/20-nails-grid.png", fullPage: true });

  await page.locator('input[data-photo="gallery"]').setInputFiles("tests/fixtures/faces/frontal.jpg");
  await expect(page.getByText("That looks like a face. Upload a photo of your hand.")).toBeVisible();

  await page.getByRole("tab", { name: "Brows" }).click();
  await page.locator('input[data-photo="gallery"]').setInputFiles("tests/fixtures/faces/frontal.jpg");
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await acceptPhotoUse(page);
  await page.getByRole("region", { name: "Brows" }).getByRole("button", { name: "Soft Arch" }).click();
  await page.getByRole("button", { name: "Try this look" }).click();
  await expect(page.getByRole("heading", { name: "Soft Arch" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Demo", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Book this look" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try another" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/21-brows-result.png", fullPage: true });

  await page.getByRole("tab", { name: "Beard" }).click();
  await page.getByRole("region", { name: "Beards" }).getByRole("button", { name: "Short Boxed" }).click();
  await page.getByRole("button", { name: "Try this look" }).click();
  await expect(page.getByRole("heading", { name: "Short Boxed" })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "docs/screenshots/22-beard-result.png", fullPage: true });

  await page.getByRole("tab", { name: "Nails" }).click();
  await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();
  await page.locator('input[data-photo="gallery"]').setInputFiles("tests/fixtures/hand.jpg");
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await page.getByRole("region", { name: "Nails" }).getByRole("button", { name: "Classic French" }).click();
  await page.getByRole("button", { name: "Try this look" }).click();
  await expect(page.getByRole("heading", { name: "Classic French" })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "docs/screenshots/23-nails-result.png", fullPage: true });
});

test("camera view can switch to upload without a refresh", async ({ page }) => {
  await page.goto("/s/demo-salon");
  const upload = page.getByRole("button", { name: "Upload" });
  const take = page.getByRole("button", { name: "Take selfie" });
  await expect(upload).toBeVisible();
  expect(await buttonContrast(upload)).toBeGreaterThanOrEqual(4.5);
  expect(await buttonContrast(take)).toBeGreaterThanOrEqual(4.5);

  await take.click();
  const instead = page.getByRole("button", { name: "Upload a photo instead" });
  const back = page.getByRole("button", { name: "Back" });
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await expect(instead).toBeVisible();
  await expect(back).toBeVisible();
  expect(await buttonContrast(instead)).toBeGreaterThanOrEqual(4.5);
  expect(await buttonContrast(back)).toBeGreaterThanOrEqual(4.5);

  await back.click();
  await expect(take).toBeVisible();
  await expect(upload).toBeVisible();
  await expect(page.getByRole("button", { name: "Take photo" })).toHaveCount(0);
  await page.waitForFunction(() => !document.querySelector("video")?.srcObject);

  await take.click();
  await expect(instead).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await instead.click();
  await (await chooser).setFiles("public/samples/portrait.jpg");
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await expect(instead).toHaveCount(0);
  await page.waitForFunction(() => !document.querySelector("video")?.srcObject);
});

test("a near-black salon brand still has readable primary button text", async ({ page }) => {
  const prisma = await salonDb();
  const before = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-salon" }, select: { primaryColor: true } });
  await prisma.tenant.update({ where: { slug: "demo-salon" }, data: { primaryColor: "#111111" } });
  try {
    await page.goto("/s/demo-salon");
    const take = page.getByRole("button", { name: "Take selfie" });
    await expect(take).toBeVisible();
    expect(await buttonContrast(take)).toBeGreaterThanOrEqual(4.5);
    expect(await buttonContrast(page.getByRole("button", { name: "Upload" }))).toBeGreaterThanOrEqual(4.5);
  } finally {
    await prisma.tenant.update({ where: { slug: "demo-salon" }, data: { primaryColor: before.primaryColor } });
    await prisma.$disconnect();
  }
});

test("a renamed salon shows on the guest header and title", async ({ page }) => {
  test.setTimeout(120_000);
  const prisma = await salonDb();
  const before = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-salon" }, select: { name: true, id: true } });
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill("owner@demo.helixstac.app");
    await page.getByLabel("Password").fill("DemoSalon#2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: /this month/i })).toBeVisible();
    await page.goto("/admin/settings");
    await page.getByLabel("Salon name").fill("Indiranagar Studio");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await page.goto("/s/demo-salon");
    await expect(page.getByRole("heading", { level: 1, name: "Indiranagar Studio" })).toBeVisible();
    await expect(page).toHaveTitle(/Indiranagar Studio/, { timeout: 15_000 });
    await page.goto("/admin");
    const signOut = page.getByRole("button", { name: "Sign out", exact: true });
    if (!(await signOut.isVisible())) await page.getByRole("button", { name: "Menu", exact: true }).click();
    await signOut.click();
    await page.waitForURL(/\/s\/demo-salon/);

    await page.goto("/login");
    await page.getByLabel("Email").fill("super@helixstac.app");
    await page.getByLabel("Password").fill("SuperAdmin#2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Lookuvi" })).toBeVisible();
    await page.goto("/super");
    const superName = page.getByLabel("Salon name for demo-salon");
    await superName.fill("Studio Indiranagar");
    await superName.locator("xpath=ancestor::form").getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Updated.")).toBeVisible();
    await page.goto("/s/demo-salon");
    await expect(page.getByRole("heading", { level: 1, name: "Studio Indiranagar" })).toBeVisible();
    await expect(page).toHaveTitle(/Studio Indiranagar/, { timeout: 15_000 });
    await page.goto("/s/demo-salon/qr");
    await expect(page.getByRole("heading", { level: 1, name: "Studio Indiranagar" })).toBeVisible();
  } finally {
    await prisma.tenant.update({ where: { id: before.id }, data: { name: before.name } });
    await prisma.$disconnect();
  }
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
  await page.getByRole("button", { name: "Take selfie" }).click();
  await expect(page.getByText(/camera is not available/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Styles" }).locator("img").first()).toBeVisible();
});

test("anonymous daily cap explains the limit and salon mode lifts it", async ({ page }) => {
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo-salon" }, data: { anonDailyCap: 0 } });
  try {
    await page.goto("/s/demo-salon");
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await acceptPhotoUse(page);
    await page.locator('input[data-photo="gallery"]').setInputFiles("public/samples/portrait.jpg");
    await page.getByRole("region", { name: "Styles" }).getByRole("button", { name: "Pixie" }).click();
    await page.getByRole("button", { name: "Try this look" }).click();
    await expect(page.getByText(/today's previews used up/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Phone code" })).toHaveCount(0);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-salon" } });
    const nonce = randomBytes(9).toString("base64url");
    await prisma.tenant.update({ where: { id: tenant.id }, data: { salonNonce: nonce } });
    const token = salonModeToken(tenant.id, nonce);
    await page.goto(`/s/demo-salon?salon=${encodeURIComponent(token)}&tool=style`);
    await expect(page.locator("[data-salon-mode='yes']")).toBeVisible();
    await acceptPhotoUse(page);
    await page.locator('input[data-photo="gallery"]').setInputFiles("public/samples/portrait.jpg");
    await page.getByRole("region", { name: "Styles" }).getByRole("button", { name: "Pixie" }).click();
    await page.getByRole("button", { name: "Try this look" }).click();
    await expect(page.getByRole("heading", { name: "Pixie" })).toBeVisible({ timeout: 20_000 });
  } finally {
    await prisma.tenant.update({ where: { slug: "demo-salon" }, data: { anonDailyCap: 200 } });
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
    await page.goto("/s/demo-salon/me?book=1&look=French%20Bob");
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
    await prisma.tenant.update({ where: { slug: "demo-salon" }, data: { requireLoginToBook: false, anonDailyCap: 200 } });
    await prisma.customer.deleteMany({ where: { phone: "919800099111" } });
    await prisma.$disconnect();
  }
});

test("style gallery uses portraits and the demo result is not a flat placeholder", async ({ page }) => {
  await page.goto("/s/demo-salon");
  const gallery = page.getByRole("region", { name: "Styles" });
  await expect(gallery.locator("img")).toHaveCount(26);
  const womenPhoto = gallery.locator("img").first();
  await expect(womenPhoto).toHaveAttribute("src", /\/styles\/.+\.jpg/);
  await expect(womenPhoto).toHaveAttribute("alt", /style reference/);
  await page.locator('input[data-photo="gallery"]').setInputFiles("public/samples/portrait.jpg");
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/17-after-photo.png", fullPage: true });
  await acceptPhotoUse(page);
  await gallery.getByRole("button", { name: "Soft Bob" }).click();
  await page.getByRole("button", { name: "Try this look" }).click();
  await expect(page.getByText("Styling your look...")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Soft Bob" })).toBeVisible({ timeout: 20_000 });
  const slider = page.getByRole("slider", { name: /BEFORE \/ AFTER/i });
  await expect(slider).toBeVisible();
  await expect(page.locator('img[alt="BEFORE"]')).not.toHaveAttribute("src", /demo-before/);
  await page.waitForFunction(() => {
    const img = document.querySelector('img[alt="AFTER"]') as HTMLImageElement | null;
    return Boolean(img && img.complete && img.naturalWidth > 10);
  });
  const stats = await page.locator('img[alt="AFTER"]').evaluate((node) => {
    const img = node as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { variance: 0 };
    ctx.drawImage(img, 0, 0, 48, 64);
    const data = ctx.getImageData(0, 0, 48, 64).data;
    let sum = 0;
    let sum2 = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const tone = data[i] + data[i + 1] + data[i + 2];
      sum += tone;
      sum2 += tone * tone;
    }
    const mean = sum / n;
    return { variance: sum2 / n - mean * mean };
  });
  expect(stats.variance).toBeGreaterThan(200);
  await page.screenshot({ path: "docs/screenshots/15-demo-result.png", fullPage: true });
});

test("super admin chooses the salon hairstyle model without calling a provider", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill("super@helixstac.app");
  await page.getByLabel("Password").fill("SuperAdmin#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Lookuvi" })).toBeVisible();
  await page.goto("/super/ai");
  const model = page.getByRole("group", { name: "Salon hairstyle model" });
  await expect(model).toBeVisible();
  await expect(model.getByRole("radio", { name: /FLUX\.3/ })).toBeChecked();
  await expect(model.getByRole("radio", { name: /sunburst/i })).toBeVisible();
  await artifact(page, "super-provider");
  await page.goto("/s/demo-salon");
  await expect(page.getByText("Reference mode")).toHaveCount(0);
  await expect(page.getByText("Hair texture")).toHaveCount(0);
  await expect(page.getByText(/one paid call/i)).toHaveCount(0);
  await page.goto("/super/ai");
  await model.getByRole("radio", { name: /sunburst/i }).check();
  await page.getByRole("button", { name: "Save salon default" }).click();
  await expect(page.getByText("Salon screens use OpenAI sunburst, quality medium.")).toBeVisible();
  await model.getByRole("radio", { name: /FLUX\.3/ }).check();
  await page.getByRole("button", { name: "Save salon default" }).click();
  await expect(page.getByText("Salon screens use FLUX.3.")).toBeVisible();
});

test("super admin sees assumed COGS", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("super@helixstac.app");
  await page.getByLabel("Password").fill("SuperAdmin#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/assumption/i)).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/09-super.png", fullPage: true });
  await page.goto("/super/ai");
  await expect(page.getByRole("heading", { name: "Image costs" })).toBeVisible();
  await expect(page.getByText("Estimate", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Actual", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await expect(page.getByRole("columnheader", { name: "Estimate (reserved)" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Actual", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Source" })).toBeVisible();
  }
  const sync = page.getByRole("button", { name: "Sync real cost from fal" });
  await expect(sync).toBeVisible();
  await sync.click();
  await expect(page.getByText(/ADMIN-scoped key/)).toBeVisible();
  await page.getByRole("button", { name: "Calibration run" }).click();
  await expect(page.getByText(/Offline calibration/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("img", { name: /mask/i })).toHaveCount(5);
  await page.screenshot({ path: "docs/screenshots/24-calibration.png", fullPage: true });
});
