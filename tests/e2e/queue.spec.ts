import { expect, test } from "@playwright/test";

async function salonDb() {
  process.env.DATABASE_URL ||= "file:./dev.db";
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator("form[data-ready='yes']").waitFor();
  await page.getByLabel("Email").fill("owner@demo.helixstac.app");
  await page.getByLabel("Password").fill("DemoSalon#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /this month/i })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const prisma = await salonDb();
  const tenant = await prisma.tenant.update({
    where: { slug: "demo-salon" },
    data: { productQueue: true, productTryOn: true },
  });
  await prisma.queueState.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, isOpen: true, mode: "LIVE", units: 1, avgMinutes: 20, alertLeadMin: 5, unitLabel: "chair" },
    update: { isOpen: true, mode: "LIVE", units: 1, avgMinutes: 20, alertLeadMin: 5, unitLabel: "chair" },
  });
  await prisma.queueEntry.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.$disconnect();
});

test.afterAll(async () => {
  const prisma = await salonDb();
  const tenant = await prisma.tenant.update({
    where: { slug: "demo-salon" },
    data: { productQueue: false },
  });
  await prisma.queueEntry.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.queueState.updateMany({ where: { tenantId: tenant.id }, data: { isOpen: false, mode: "LIVE" } });
  await prisma.$disconnect();
});

test("a guest joins, sees a live token, and can rejoin from this phone", async ({ page }) => {
  const phone = `9${String(Date.now()).slice(-9)}`;
  await page.goto("/s/demo-salon/queue");
  await page.locator("form[data-ready='yes']").waitFor();
  await expect(page.getByText(/No one is waiting|About \d+ min/)).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Queue Guest");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("checkbox", { name: /queue updates/i }).check();
  await page.getByRole("button", { name: "Join the queue" }).click();
  await expect(page.locator("[data-status='WAITING'][data-ready='yes']")).toBeVisible();
  await expect(page.getByText(/Token \d+/)).toBeVisible();
  await page.getByRole("button", { name: "I'm on my way" }).click();
  await expect(page.getByText("The desk knows you are on the way.")).toBeVisible();
  await page.goto("/s/demo-salon/queue");
  await expect(page.getByRole("link", { name: "See your place in line" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join again" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try a look while you wait" })).toBeVisible();
});

test("the desk calls the next guest, finishes the visit, and adds a walk-in", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/queue");
  await page.locator("[data-queue-mode][data-ready='yes']").waitFor();
  await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
  await expect(page.getByText("Queue Guest")).toBeVisible();
  await expect(page.getByText("On the way")).toBeVisible();
  await page.getByRole("button", { name: "NEXT" }).click();
  await expect(page.getByRole("heading", { name: "Now serving" })).toBeVisible();
  await expect(page.getByText("Queue Guest")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Queue Guest")).toHaveCount(0);
  await expect(page.getByLabel("Mobile number (optional)")).toBeVisible();
  await page.getByLabel("Walk-in name").fill("Desk Guest");
  await page.getByRole("button", { name: "Add walk-in" }).click();
  await expect(page.getByText("Desk Guest")).toBeVisible();
  await expect(page.locator("[data-queue-token]")).toBeVisible();
  await expect(page.locator("[data-queue-token]")).toHaveClass(/text-7xl/);
});

test("request mode asks for a time and the desk confirms it", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/queue");
  await page.locator("[data-queue-mode][data-ready='yes']").waitFor();
  await page.getByText("Queue settings").click();
  await page.getByLabel("How guests join").selectOption("REQUEST");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator("[data-queue-mode='REQUEST']")).toBeVisible();
  const phone = `8${String(Date.now()).slice(-9)}`;
  await page.goto("/s/demo-salon/queue");
  await page.locator("form[data-ready='yes']").waitFor();
  await page.getByLabel("Name", { exact: true }).fill("Bridal Guest");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByLabel("Preferred date").fill("2099-04-02");
  await page.getByLabel("Preferred time").fill("15:30");
  await page.getByRole("checkbox", { name: /queue updates/i }).check();
  await page.getByRole("button", { name: "Request a time" }).click();
  await expect(page.locator("[data-status='REQUESTED'][data-ready='yes']")).toBeVisible();
  await expect(page.getByText(/waiting for the salon to confirm/i)).toBeVisible();
  await page.goto("/admin/queue");
  await page.locator("[data-queue-mode][data-ready='yes']").waitFor();
  await expect(page.getByText("Bridal Guest")).toBeVisible();
  await page.getByRole("button", { name: "Confirm time" }).click();
  await expect(page.getByText("2099-04-02")).toBeVisible();
  await expect(page.getByText("15:30")).toBeVisible();
});

test("a paused queue tells the guest to ask at the desk", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/queue");
  await page.locator("[data-queue-mode][data-ready='yes']").waitFor();
  await page.getByText("Queue settings").click();
  await page.getByLabel("How guests join").selectOption("LIVE");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByRole("button", { name: "Pause queue" }).click();
  await expect(page.locator("[data-queue-open='no']")).toBeVisible();
  await page.goto("/s/demo-salon/queue");
  await expect(page.getByText(/queue is paused/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Join the queue" })).toBeDisabled();
});

test("try-on links to the queue when both products are on", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/queue");
  await page.locator("[data-queue-mode][data-ready='yes']").waitFor();
  await page.getByRole("button", { name: "Open queue" }).click();
  await expect(page.locator("[data-queue-open='yes']")).toBeVisible();
  await page.goto("/s/demo-salon");
  await expect(page.getByRole("link", { name: "Join queue" })).toBeVisible();
  await page.getByRole("link", { name: "Join queue" }).click();
  await expect(page).toHaveURL(/\/s\/demo-salon\/queue/);
  await expect(page.getByRole("button", { name: "Join the queue" })).toBeVisible();
});
