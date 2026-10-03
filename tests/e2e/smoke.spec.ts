import { expect, test } from "@playwright/test";

test("customer can consent, preview a demo cut, and an owner can open the dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /try-on page with your name/i })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/01-home.png", fullPage: true });

  await page.goto("/s/demo-salon");
  await expect(page.getByRole("heading", { name: "Demo Salon – Bengaluru" })).toBeVisible();
  await expect(page.getByText(/before we use a photo/i)).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/02-consent.png", fullPage: true });

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /i agree/i }).click();
  await page.getByRole("button", { name: /use sample portrait/i }).click();
  await expect(page.getByRole("button", { name: "Burgundy" })).toBeVisible();
  await page.getByRole("button", { name: "Cherry Red" }).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas || canvas.width < 10) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const pixel = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 5), 1, 1).data;
    return pixel[0] + pixel[1] + pixel[2] > 30;
  });
  await page.screenshot({ path: "docs/screenshots/03-colour.png", fullPage: true });

  await page.getByRole("tab", { name: /styles/i }).click();
  await page.getByRole("button", { name: "Soft Bob" }).click();
  await page.getByRole("button", { name: /preview this cut/i }).click();
  await expect(page.getByText(/this preview is a guide/i)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "docs/screenshots/04-preview.png", fullPage: true });

  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@demo.helixstac.app");
  await page.getByLabel("Password").fill("DemoSalon#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /this month/i })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/05-admin.png", fullPage: true });

  await page.goto("/admin/leads");
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/06-leads.png", fullPage: true });

  await page.goto("/admin/billing");
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/07-billing.png", fullPage: true });

  await page.goto("/admin/qr");
  await expect(page.getByRole("heading", { name: /qr and embed/i })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/08-qr.png", fullPage: true });
});

test("super admin sees assumed COGS", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("super@helixstac.app");
  await page.getByLabel("Password").fill("SuperAdmin#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/assumption/i)).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/09-super.png", fullPage: true });
});
