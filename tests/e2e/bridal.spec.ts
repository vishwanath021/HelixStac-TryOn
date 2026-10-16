import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = "/tmp/bridal-shots";
const OWNER = { email: "owner@demo.agenticbuildworks.com", password: "DemoSalon#2026" };

async function salonDb() {
  process.env.DATABASE_URL ||= "file:./dev.db";
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

async function shot(page: Page, name: string) {
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-ready='yes']").waitFor();
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin/);
}

test.beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
});

test.afterEach(async () => {
  const prisma = await salonDb();
  await prisma.tenant.update({
    where: { slug: "demo" },
    data: { productTryOn: true, productBridal: true, productQueue: false, creditBalance: 900, whatsapp: "919800011122" },
  });
  await prisma.service.updateMany({ where: { key: { in: ["bridal-classic", "bridal-signature", "bridal-royal"] } }, data: { priceInr: 0 } });
  await prisma.$disconnect();
});

test("guest can pick an event and a look, refine it, try mehendi, save, compare, share, and book", async ({ page }) => {
  test.setTimeout(180_000);
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo" }, data: { productBridal: true, productTryOn: true, creditBalance: 900, whatsapp: "919800011122" } });
  await prisma.lead.deleteMany({ where: { tenant: { slug: "demo" }, type: "BRIDAL", name: "Lakshmi" } });
  await prisma.$disconnect();

  await page.goto("/s/demo");
  await shot(page, "01-entry");
  await page.getByRole("button", { name: "Bridal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bridal", exact: true })).toBeVisible();
  const looks = page.getByRole("list", { name: "Bridal looks" });
  await expect(looks.getByRole("listitem").first()).toContainText("Telugu Muhurtham Classic");
  await expect(looks.getByRole("listitem").nth(1)).toContainText("Telugu Jasmine Bun");
  await shot(page, "02-looks");

  await page.getByRole("button", { name: "Haldi", exact: true }).click();
  await expect(looks.getByRole("button", { name: "Haldi Fresh" })).toBeVisible();
  await page.getByRole("button", { name: "Wedding", exact: true }).click();
  await looks.getByRole("button", { name: "Telugu Muhurtham Classic" }).click();
  await page.locator("[data-photo='bridal']").setInputFiles("public/samples/portrait.jpg");
  await expect(page.getByRole("img", { name: "Your selfie" })).toBeVisible();
  await shot(page, "03-selfie");
  await page.getByRole("button", { name: "See Telugu Muhurtham Classic" }).click();
  await expect(page.getByRole("heading", { name: "Telugu Muhurtham Classic" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-bridal='flow']")).toHaveAttribute("data-busy", "no");
  await expect(page.getByRole("slider", { name: /Before \/ After/i })).toBeVisible();
  await shot(page, "04-result");

  const matte = page.waitForResponse((res) => res.url().includes("/api/v1/tryon/generate") && res.request().method() === "POST");
  await page.getByRole("button", { name: "Matte", exact: true }).click();
  expect((await matte).ok()).toBeTruthy();
  await expect(page.locator("[data-bridal='flow']")).toHaveAttribute("data-busy", "no");
  const berry = page.waitForResponse((res) => res.url().includes("/api/v1/tryon/generate") && res.request().method() === "POST");
  await page.getByRole("button", { name: "Berry", exact: true }).click();
  expect((await berry).ok()).toBeTruthy();
  await expect(page.locator("[data-bridal='flow']")).toHaveAttribute("data-busy", "no");
  await shot(page, "05-refine");
  await page.getByRole("button", { name: "Save this look" }).click();

  await page.getByRole("tab", { name: "Mehendi" }).click();
  await expect(page.getByRole("button", { name: "Arabic", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Full hand", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reddish brown", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Heavy", exact: true })).toBeVisible();
  await shot(page, "06-mehendi");
  await page.locator("[data-photo='mehendi']").setInputFiles("tests/fixtures/hand.jpg");
  await page.getByRole("button", { name: "See the mehendi" }).click();
  await expect(page.getByRole("heading", { name: /Mehendi/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Save this look" }).click();

  await expect(page.getByRole("tab", { name: "My looks" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Compare" }).first().click();
  await page.getByRole("button", { name: "Compare" }).first().click();
  await expect(page.getByRole("heading", { name: "Side by side" })).toBeVisible();
  await shot(page, "07-compare");
  const share = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Share with family" }).first().click();
  const shared = await share;
  expect(decodeURIComponent(shared.url()).replaceAll("+", " ")).toContain("bridal look");
  await shared.close();

  await expect(page.getByRole("list", { name: "Bridal packages" })).toHaveCount(0);
  const priced = await salonDb();
  const tenant = await priced.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  await priced.service.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: "bridal-classic" } },
    update: { priceInr: 8500, name: "Classic" },
    create: { tenantId: tenant.id, key: "bridal-classic", name: "Classic", priceInr: 8500, nameI18n: "{}" },
  });
  await priced.$disconnect();
  await page.reload();
  await page.getByRole("button", { name: "Bridal", exact: true }).click();
  await page.getByRole("tab", { name: "My looks" }).click();
  await expect(page.getByRole("list", { name: "Bridal packages" })).toContainText("Classic");
  await expect(page.getByRole("list", { name: "Bridal packages" })).toContainText("8,500");
  await shot(page, "08-book");
  await page.getByLabel("Your name").fill("Lakshmi");
  await page.getByLabel("Event date").fill("2026-12-20");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Book bridal trial" }).click();
  const popup = await popupPromise;
  const text = decodeURIComponent(popup.url()).replaceAll("+", " ");
  expect(popup.url()).toContain("919800011122");
  expect(text).toContain("Lakshmi");
  expect(text).toContain("bridal trial");
  expect(text).toContain("Wedding");
  expect(text).toContain("2026-12-20");
  expect(text).toContain("Telugu Muhurtham Classic");
  await popup.close();

  const check = await salonDb();
  const lead = await check.lead.findFirst({ where: { name: "Lakshmi", type: "BRIDAL" }, orderBy: { createdAt: "desc" } });
  expect(lead?.eventDate).toBe("2026-12-20");
  expect(lead?.eventName).toBe("Wedding");
  expect(lead?.lookName).toContain("Telugu Muhurtham Classic");
  await check.$disconnect();

  await signIn(page);
  await page.goto("/admin/leads");
  await expect(page.getByText("Bridal", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("20 Dec 2026")).toBeVisible();
  await shot(page, "09-owner-lead");
});

test("zero try-ons still shows a bridal preview and the owner balance", async ({ page }) => {
  test.setTimeout(120_000);
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo" }, data: { creditBalance: 0, productBridal: true, productTryOn: true } });
  await prisma.$disconnect();
  await page.goto("/s/demo");
  await page.getByRole("button", { name: "Bridal", exact: true }).click();
  await page.locator("[data-photo='bridal']").setInputFiles("public/samples/portrait.jpg");
  await page.getByRole("button", { name: "See Telugu Muhurtham Classic" }).click();
  await expect(page.getByRole("button", { name: "Save this look" })).toBeVisible({ timeout: 30_000 });
  const after = await salonDb();
  const tenant = await after.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  expect(tenant.creditBalance).toBe(0);
  await after.$disconnect();
  await signIn(page);
  if (await page.getByRole("button", { name: "Menu", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  }
  await expect(page.locator("#salon-nav").getByText("0 try-ons left")).toBeVisible();
});

test("bridal off hides the section", async ({ page }) => {
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo" }, data: { productBridal: false, productTryOn: true } });
  await prisma.$disconnect();
  await page.goto("/s/demo");
  await expect(page.getByRole("button", { name: "Bridal", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "See full bridal looks" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Hair style" })).toBeVisible();
  await shot(page, "10-bridal-off");
});

test("a new catalogue style generates before the salon has a menu row", async ({ page }) => {
  test.setTimeout(120_000);
  const prisma = await salonDb();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  await prisma.tenantStyle.deleteMany({ where: { tenantId: tenant.id, styleId: "jasmine-bridal-braid" } });
  await prisma.$disconnect();
  await page.goto("/s/demo");
  await page.locator("input[data-photo='gallery']").setInputFiles("public/samples/portrait.jpg");
  const gallery = page.getByRole("region", { name: "Styles" });
  await gallery.getByRole("button", { name: "Women", exact: true }).click();
  await gallery.getByRole("button", { name: "South-Indian Bridal Braid" }).click();
  await expect(page.getByText("That style is not on this salon's menu.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "South-Indian Bridal Braid" })).toBeVisible({ timeout: 30_000 });
});
