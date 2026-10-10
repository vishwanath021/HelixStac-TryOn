import { expect, test, type Page } from "@playwright/test";

const shots: Record<string, string> = {
  "webkit-iphone-13": "iphone",
  "pixel-7": "android",
  "webkit-ipad-mini": "tablet",
  "desk-1440": "desktop",
};

async function fits(page: Page) {
  const report = await page.evaluate(() => {
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const targets = [...document.querySelectorAll("button, a.btn, .chip, .tab, .nav-side a, input[type='range']")].filter(visible);
    const small = targets
      .filter((el) => el.getBoundingClientRect().height < 44)
      .slice(0, 6)
      .map((el) => `${el.tagName}.${el.className} ${el.textContent?.trim().slice(0, 24) || ""}`);
    const typed = [...document.querySelectorAll("input, select, textarea")].filter((el) => {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return false;
      if (el instanceof HTMLInputElement && ["hidden", "file", "checkbox", "radio", "range"].includes(el.type)) return false;
      return visible(el);
    });
    const zoomRisk = typed.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).length;
    const doc = document.documentElement;
    return {
      overflow: doc.scrollWidth - doc.clientWidth,
      small,
      zoomRisk,
      minHeight: parseFloat(getComputedStyle(document.body).minHeight),
      inner: window.innerHeight,
    };
  });
  expect(report.overflow, "horizontal overflow").toBeLessThanOrEqual(1);
  expect(report.small, "tap targets under 44px").toEqual([]);
  expect(report.zoomRisk, "inputs under 16px").toBe(0);
  expect(Math.abs(report.minHeight - report.inner), "100dvh").toBeLessThan(2);
}

async function shot(page: Page, project: string, name: string) {
  const device = shots[project];
  if (!device) return;
  await page.screenshot({ path: `/opt/cursor/artifacts/after-${name}-${device}.png`, fullPage: true });
}

async function go(page: Page, path: string) {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

async function signIn(page: Page, email: string, password: string) {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await go(page, "/login");
      await expect(page.getByRole("heading", { name: "Salon login" })).toBeVisible({ timeout: 8_000 });
      await expect(page.locator("form").first()).toHaveAttribute("data-ready", "yes");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL(/\/admin|\/super/, { timeout: 8_000 });
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

test("guest, owner, and super layouts fit the device", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "See your next look." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Demo Salon – Bengaluru" })).toBeVisible();
  await expect(page.locator("input[data-photo='gallery']")).toHaveAttribute("accept", "image/*");
  await expect(page.locator("input[data-photo='camera']")).toHaveAttribute("capture", "user");
  const gallery = page.getByRole("region", { name: "Styles" });
  await gallery.getByRole("button", { name: "Soft Bob" }).click();
  await expect(gallery.getByRole("button", { name: "Soft Bob" })).toHaveAttribute("aria-pressed", "true");
  await expect(gallery.getByRole("button", { name: "Soft Bob" }).locator(".check")).toBeVisible();
  await fits(page);
  await shot(page, testInfo.project.name, "guest");

  await signIn(page, "owner@demo.helixstac.app", "DemoSalon#2026");
  await expect(page.getByRole("heading", { name: /this month/i })).toBeVisible();
  await expect(page.locator("#salon-nav")).toHaveAttribute("data-ready", "yes");
  const width = page.viewportSize()?.width ?? 0;
  if (width < 768) {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  }
  await expect(page.getByRole("link", { name: "Overview", exact: true })).toBeVisible();
  await fits(page);
  await shot(page, testInfo.project.name, "owner");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL(/\/s\/demo-salon/);

  await signIn(page, "super@helixstac.app", "SuperAdmin#2026");
  await expect(page.getByRole("heading", { name: "Lookuvi" })).toBeVisible();
  process.env.DATABASE_URL ||= "file:./dev.db";
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.aiCall.deleteMany({ where: { costNote: "layout-fixture" } });
    await prisma.aiCall.createMany({
      data: Array.from({ length: 21 }, (_, index) => ({
        provider: index % 2 === 0 ? "fal" : "openai",
        quality: "edit",
        model: index % 2 === 0 ? "flux-edit" : "gpt-check",
        estimatePaise: 200,
        costInrPaise: index % 2 === 0 ? 150 : 0,
        costSource: index % 2 === 0 ? "billing" : "estimate",
        costNote: "layout-fixture",
        status: "SUCCEEDED",
        createdAt: new Date(Date.UTC(2026, 9, 2, 0, index)),
      })),
    });
    await go(page, "/super/ai");
    await expect(page.getByRole("heading", { name: "Image costs" })).toBeVisible();
    await expect(page.locator("#image-costs")).toHaveAttribute("data-ready", "yes");
    await expect(page.getByText("21 images")).toBeVisible();
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await fits(page);
    await shot(page, testInfo.project.name, "super");
  } finally {
    await prisma.aiCall.deleteMany({ where: { costNote: "layout-fixture" } });
    await prisma.$disconnect();
  }
});
