import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { openLive, waitForCapture } from "./live-entry";

test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = "/tmp/studio-shots";

async function salonDb() {
  process.env.DATABASE_URL ||= "file:./dev.db";
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

test.beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
});

test("photo notice, countdown, live makeup, and metallic buttons", async ({ page }) => {
  test.setTimeout(240_000);
  page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("BROWSER", msg.text());
  });
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo" }, data: { productBridal: true, productTryOn: true, productQueue: false, whatsapp: "919800011122" } });
  await prisma.$disconnect();

  await page.goto("/s/demo");
  const live = page.getByRole("button", { name: "Live styling", exact: true });
  await expect(live).toBeVisible();
  const metal = await live.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(metal).toContain("gradient");
  await live.click();
  const sheet = page.getByRole("dialog", { name: "Before the camera" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Your photo is used only to create your look and is deleted after.");
  await expect(sheet.getByRole("checkbox")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/01-consent.png` });
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toHaveCount(0);

  await openLive(page);
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await expect(page.locator(".cam-guide-face")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-camera.png` });
  const countdown = page.locator("[data-studio='live'] [role='status']");
  const countdownSeen = countdown.waitFor({ state: "visible", timeout: 5_000 });
  await page.getByRole("button", { name: "Take photo" }).click();
  await countdownSeen;
  await expect(countdown).toHaveText(/3|2|1|Capturing/);
  await page.screenshot({ path: `${SHOTS}/03-countdown.png` });
  await waitForCapture(page);

  await page.getByRole("button", { name: "Bridal", exact: true }).click();
  const makeup = page.getByRole("button", { name: "Live makeup", exact: true });
  await expect(makeup).toBeVisible();
  const gold = await makeup.evaluate((el) => ({ image: getComputedStyle(el).backgroundImage, color: getComputedStyle(el).color }));
  expect(gold.image).toContain("gradient");
  expect(gold.color).toBe("rgb(28, 20, 8)");
  await openLive(page, "Live makeup");
  await expect(page.locator("[data-makeup='live']")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kajal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lashes" })).toBeVisible();
  const canvas = page.locator("[data-makeup='live']");
  await expect(canvas).toHaveAttribute("data-makeup-state", "tracking", { timeout: 40_000 });
  await page.screenshot({ path: `${SHOTS}/04-live-makeup.png` });
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("tab", { name: "Mehendi" }).click();
  await expect(page.getByRole("button", { name: "Live mehendi" })).toBeVisible();
  await openLive(page, "Live mehendi");
  await expect(page.locator(".cam-guide-hand")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-mehendi-camera.png` });
  await page.getByRole("button", { name: "Close", exact: true }).click();

  const check = await salonDb();
  const row = await check.consentLog.findFirst({ where: { tenant: { slug: "demo" } }, orderBy: { createdAt: "desc" } });
  expect(row?.textVersion).toBe("2026-10-15");
  expect(row?.accepted).toBe(true);
  expect(row?.createdAt).toBeTruthy();
  await check.$disconnect();

  await page.goto("/login");
  await page.locator("form[data-ready='yes']").waitFor();
  await page.getByLabel("Email").fill("owner@demo.agenticbuildworks.com");
  await page.getByLabel("Password").fill("DemoSalon#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin/);
  await page.goto("/admin/leads");
  const ownerBtn = page.getByRole("link", { name: "Download CSV" });
  await expect(ownerBtn).toBeVisible();
  expect(await ownerBtn.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("gradient");
  await page.screenshot({ path: `${SHOTS}/06-owner-metal.png` });

  await page.goto("/login");
  await page.locator("form[data-ready='yes']").waitFor();
  await page.getByLabel("Email").fill("super@agenticbuildworks.com");
  await page.getByLabel("Password").fill("SuperAdmin#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/super/);
  const side = page.locator(".nav-side").locator("visible=true").first();
  await expect(side).toBeVisible();
  expect(await side.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("gradient");
  await page.screenshot({ path: `${SHOTS}/07-super-metal.png` });
  await page.goto("/super/salons");
  const newSalon = page.getByRole("button", { name: "New salon" });
  await expect(newSalon).toBeVisible();
  expect(await newSalon.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("gradient");
  await page.getByRole("row", { name: /demo/i }).click();
  await page.getByRole("tab", { name: "Plan & credits" }).click();
  await expect(page.getByRole("checkbox", { name: /^Bridal/ })).toBeChecked();
  await page.screenshot({ path: `${SHOTS}/08-super-bridal-switch.png` });
});
