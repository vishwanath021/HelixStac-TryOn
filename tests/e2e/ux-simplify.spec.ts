import { expect, test } from "@playwright/test";

async function salonDb() {
  process.env.DATABASE_URL ||= "file:./dev.db";
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

test("the login form does not submit before it is ready", async ({ page }) => {
  const html = await (await page.request.get("/login")).text();
  expect(html).toContain('method="post"');
  expect(html).toMatch(/<button[^>]*disabled[^>]*>/);
  await page.goto("/login");
  await expect(page.locator("form[data-ready='yes']")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.getByLabel("Email").fill("owner@demo.agenticbuildworks.com");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("Email")).toHaveValue("owner@demo.agenticbuildworks.com");
  await expect(page.getByText("Those details did not match.")).toBeVisible();
});

test("the web app manifest is served", async ({ page }) => {
  const res = await page.request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.name).toBe("Lookuvi");
  expect(body.icons?.length).toBeGreaterThan(0);
});

test("women see a bridal tab and the named styles", async ({ page }) => {
  await page.goto("/s/demo");
  const gallery = page.getByRole("region", { name: "Styles" });
  await gallery.getByRole("button", { name: "Bridal", exact: true }).click();
  await expect(gallery.getByRole("button", { name: "Bridal Bun" })).toBeVisible();
  await expect(gallery.getByRole("button", { name: "South-Indian Bridal Braid" })).toBeVisible();
  await expect(gallery.getByRole("button", { name: "Curtain Wolf" })).toHaveCount(0);
  await expect(gallery.getByRole("button", { name: "Wolf Cut" })).toHaveCount(0);
  await gallery.getByRole("button", { name: "All styles" }).click();
  await expect(gallery.getByRole("button", { name: "Wolf Cut" })).toBeVisible();
  await expect(gallery.getByRole("button", { name: "Voluminous Blowout" }).locator("img")).toHaveAttribute("src", /voluminous-blowout\.jpg/);
});

test("the queue page asks people to join, with a wait", async ({ page }) => {
  const prisma = await salonDb();
  const tenant = await prisma.tenant.update({ where: { slug: "demo" }, data: { productQueue: true } });
  await prisma.queueState.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, isOpen: true, mode: "LIVE", units: 1, avgMinutes: 20, alertLeadMin: 5, unitLabel: "chair" },
    update: { isOpen: true, mode: "LIVE" },
  });
  await prisma.$disconnect();
  try {
    await page.goto("/s/demo/queue");
    await expect(page.locator("[data-queue-join='yes']")).toContainText("Join the queue");
    await expect(page.locator("[data-queue-join='yes']")).toContainText(/waiting · about \d+ min/);
    await expect(page.getByRole("checkbox", { name: /queue updates/i })).toBeVisible();
  } finally {
    const done = await salonDb();
    await done.tenant.update({ where: { slug: "demo" }, data: { productQueue: false } });
    await done.$disconnect();
  }
});

test("owner nav lands on the queue, keeps three items, and hides internal wording", async ({ page }) => {
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo" }, data: { productQueue: true, onboardingDone: true } });
  await prisma.$disconnect();
  try {
  await page.goto("/login");
  await page.locator("form[data-ready='yes']").waitFor();
  await page.getByLabel("Email").fill("owner@demo.agenticbuildworks.com");
  await page.getByLabel("Password").fill("DemoSalon#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/queue/, { timeout: 20_000 });
  await expect(page.getByText(/try-ons this month/)).toBeVisible();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) {
    await expect(menu).toHaveAttribute("data-ready", "yes");
    await menu.click();
  }
  const nav = page.locator("#salon-nav");
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Queue", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Leads", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: /^QR/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Overview", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "View try-on", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Onboarding", exact: true })).toHaveCount(0);
  await nav.locator("summary", { hasText: "More" }).click();
  await expect(nav.getByRole("link", { name: "Styles", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Services", exact: true })).toBeVisible();
  await expect(nav.getByText(/try-ons left/)).toBeVisible();
  await page.goto("/admin/services");
  await expect(page.getByRole("heading", { name: "Your services" })).toBeVisible();
  await expect(page.getByText("Haircut")).toBeVisible();
  await expect(page.getByLabel("Service key")).toHaveCount(0);
  await page.goto("/admin/settings");
  await expect(page.getByText("gpt-4.1-nano")).toHaveCount(0);
  await expect(page.getByText("SUGGEST_MODEL")).toHaveCount(0);
  await expect(page.getByText("platform OpenAI key")).toHaveCount(0);
  await page.goto("/admin/billing");
  await expect(page.locator("main").getByText(/try-ons left/)).toBeVisible();
  await expect(page.getByText(/Billing provider/i)).toHaveCount(0);
  await page.goto("/admin/qr");
  await expect(page.getByRole("link", { name: "View try-on" })).toBeVisible();
  } finally {
    const done = await salonDb();
    await done.tenant.update({ where: { slug: "demo" }, data: { productQueue: false } });
    await done.$disconnect();
  }
});

test("the nails tab asks for a hand photo", async ({ page }) => {
  await page.goto("/s/demo");
  await page.getByRole("tab", { name: "Nails" }).click();
  await expect(page.getByRole("button", { name: "Take a photo of your hand" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload a hand photo" })).toBeVisible();
});

test("super-admin audit shows a salon name and an email", async ({ page }) => {
  const prisma = await salonDb();
  const [actor, salon] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: "super@agenticbuildworks.com" } }),
    prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } }),
  ]);
  const row = await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "AI_KEY_UPDATE",
      target: salon.id,
      meta: JSON.stringify({ provider: "fal" }),
    },
  });
  await prisma.$disconnect();
  await page.goto("/login");
  await page.locator("form[data-ready='yes']").waitFor();
  await page.getByLabel("Email").fill("super@agenticbuildworks.com");
  await page.getByLabel("Password").fill("SuperAdmin#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/super/);
  await page.goto("/super/audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Demo Salon – Bengaluru" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "super@agenticbuildworks.com" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /AI key update · fal/ }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /IST/ }).first()).toBeVisible();
  const cleanup = await salonDb();
  await cleanup.auditLog.delete({ where: { id: row.id } });
  await cleanup.$disconnect();
});
