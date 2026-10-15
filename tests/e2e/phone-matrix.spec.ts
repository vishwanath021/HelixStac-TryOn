import { expect, test, type Browser, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const BASE = "http://127.0.0.1:3000";
const OWNER = { email: "owner@demo.agenticbuildworks.com", password: "DemoSalon#2026" };
const SUPER = { email: "super@agenticbuildworks.com", password: "SuperAdmin#2026" };

async function salonDb() {
  process.env.DATABASE_URL ||= "file:./dev.db";
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("form[data-ready='yes']").waitFor();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin|\/super/);
}

async function openNav(page: Page) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) {
    await expect(menu).toHaveAttribute("data-ready", "yes");
    await menu.click();
  }
  const nav = page.locator("#salon-nav");
  await expect(nav).toBeVisible();
  return nav;
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: BASE });
  const page = await context.newPage();
  return { context, page };
}

async function previewLook(page: Page, styleName: string) {
  await page.locator("input[data-photo='gallery']").setInputFiles("public/samples/portrait.jpg");
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  const gallery = page.getByRole("region", { name: "Styles" });
  await gallery.getByRole("button", { name: "Women", exact: true }).click();
  await gallery.getByRole("button", { name: "All styles" }).click();
  await gallery.getByRole("button", { name: styleName }).click();
  await expect(page.getByText("Reading your photo...")).toBeVisible();
  await expect(page.getByRole("heading", { name: styleName })).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(async () => {
  const prisma = await salonDb();
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } });
  await prisma.queueState.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, isOpen: true, mode: "LIVE", units: 2, avgMinutes: 20, alertLeadMin: 5, unitLabel: "chair" },
    update: { isOpen: true, mode: "LIVE", units: 2 },
  });
  await prisma.$disconnect();
});

test.afterEach(async () => {
  const prisma = await salonDb();
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (tenant) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        name: "Demo Salon – Bengaluru",
        status: "TRIAL",
        productTryOn: true,
        productQueue: false,
        creditBalance: 900,
        whatsapp: "919800011122",
      },
    });
    await prisma.queueState.updateMany({ where: { tenantId: tenant.id }, data: { isOpen: true, mode: "LIVE" } });
  }
  await prisma.$disconnect();
});

test("guest: upload, every tab including bridal, generate, before/after, save, and book", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/s/demo");
  const tabs = ["Hair style", "Hair colour", "Brows", "Nails", "Beard"] as const;
  for (const name of tabs) {
    await page.getByRole("tab", { name }).click();
    await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
  }
  await page.getByRole("tab", { name: "Nails" }).click();
  await expect(page.getByRole("button", { name: "Take a photo of your hand" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload a hand photo" })).toBeVisible();

  await page.getByRole("tab", { name: "Hair style" }).click();
  const gallery = page.getByRole("region", { name: "Styles" });
  await gallery.getByRole("button", { name: "Women", exact: true }).click();
  await gallery.getByRole("button", { name: "Bridal", exact: true }).click();
  for (const look of ["Bridal Bun", "Braided Updo", "Side-Swept Curls", "Half-Up with Flowers", "South-Indian Bridal Braid"]) {
    await expect(gallery.getByRole("button", { name: look })).toBeVisible();
  }

  await previewLook(page, "Soft Bob");
  await expect(page.getByRole("slider", { name: /BEFORE \/ AFTER/i })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.jpg$/);
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Book this look" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/919800011122/);
  expect(decodeURIComponent(popup.url()).replaceAll("+", " ")).toContain("Soft Bob");
  await popup.close();
});

test("guest: a salon without WhatsApp explains that booking is unavailable", async ({ page }) => {
  test.setTimeout(120_000);
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo" }, data: { whatsapp: "" } });
  await prisma.$disconnect();
  await page.goto("/s/demo");
  await previewLook(page, "Soft Bob");
  await expect(page.getByRole("status").filter({ hasText: "This salon has not added a WhatsApp number yet." }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Book this look" })).toHaveCount(0);
});

test("guest: join the queue online, open the token page, and cancel", async ({ page }) => {
  const prisma = await salonDb();
  const tenant = await prisma.tenant.update({ where: { slug: "demo" }, data: { productQueue: true, productTryOn: true } });
  await prisma.queueState.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, isOpen: true, mode: "LIVE", units: 2, avgMinutes: 20, alertLeadMin: 5, unitLabel: "chair" },
    update: { isOpen: true, mode: "LIVE" },
  });
  await prisma.$disconnect();

  await page.goto("/s/demo/queue");
  await page.locator("form[data-ready='yes']").waitFor();
  await expect(page.getByText("Join the queue").first()).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Matrix Guest");
  await page.getByLabel("Mobile number").fill("9811100101");
  await page.getByRole("checkbox", { name: /queue updates/i }).check();
  await page.getByRole("button", { name: "Join the queue" }).click();
  await expect(page).toHaveURL(/\/s\/demo\/q\//);
  await expect(page.locator("[data-status='WAITING'][data-ready='yes']")).toBeVisible();
  await expect(page.getByText(/Token \d+/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("This visit was cancelled.")).toBeVisible();
});

test("owner: login stays disabled until the form is ready and lands on the queue", async ({ page }) => {
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo" }, data: { productQueue: true } });
  await prisma.$disconnect();
  const html = await (await page.request.get("/login")).text();
  expect(html).toContain('method="post"');
  expect(html).toMatch(/<button[^>]*disabled[^>]*>/);
  await signIn(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL(/\/admin\/queue/);
  await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
  await expect(page.getByText(/try-ons this month/)).toBeVisible();
});

test("owner: open and pause the queue, add walk-ins, then Next, Done, and No-show", async ({ page }) => {
  const prisma = await salonDb();
  const tenant = await prisma.tenant.update({ where: { slug: "demo" }, data: { productQueue: true } });
  await prisma.queueEntry.deleteMany({ where: { tenantId: tenant.id, status: { in: ["WAITING", "CALLED", "IN_SERVICE"] } } });
  await prisma.queueState.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, isOpen: true, mode: "LIVE", units: 2, avgMinutes: 20, alertLeadMin: 5, unitLabel: "chair" },
    update: { isOpen: true, mode: "LIVE", units: 2 },
  });
  await prisma.$disconnect();

  await signIn(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL(/\/admin\/queue/);
  await page.locator("[data-queue-mode][data-ready='yes']").waitFor();
  await page.getByRole("button", { name: "Queue is OPEN, tap to change" }).click();
  await expect(page.getByRole("button", { name: "Queue is PAUSED, tap to change" })).toBeVisible();
  await expect(page.getByText("Customers see that the queue is paused and cannot join.")).toBeVisible();
  await page.getByRole("button", { name: "Queue is PAUSED, tap to change" }).click();
  await expect(page.getByRole("button", { name: "Queue is OPEN, tap to change" })).toBeVisible();

  await page.getByLabel("Walk-in name").fill("Matrix Phone");
  await page.getByLabel("Mobile number (optional)").fill("9811100102");
  await page.getByRole("button", { name: "Add walk-in" }).click();
  await expect(page.getByText("Matrix Phone")).toBeVisible();
  await page.getByRole("button", { name: "NEXT" }).click();
  await expect(page.getByRole("heading", { name: "Now serving" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Matrix Phone" }).getByRole("button", { name: "Done" })).toBeVisible();
  await page.locator("article").filter({ hasText: "Matrix Phone" }).getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Matrix Phone")).toHaveCount(0);

  await page.getByLabel("Walk-in name").fill("Matrix Desk");
  await page.getByRole("button", { name: "Add walk-in" }).click();
  const desk = page.locator("article").filter({ hasText: "Matrix Desk" });
  await expect(desk).toBeVisible();
  await desk.getByRole("button", { name: "No-show" }).click();
  await expect(page.getByText("Matrix Desk")).toHaveCount(0);
});

test("owner: change a lead, add a service, open QR, and use More", async ({ page }) => {
  const prisma = await salonDb();
  const tenant = await prisma.tenant.update({ where: { slug: "demo" }, data: { productQueue: true, productTryOn: true } });
  const lead = await prisma.lead.create({
    data: { tenantId: tenant.id, lookName: "soft-bob", name: "Matrix Lead", status: "NEW" },
  });
  await prisma.$disconnect();

  await signIn(page, OWNER.email, OWNER.password);
  await page.goto("/admin/leads");
  const row = page.locator("tbody tr").filter({ hasText: "Matrix Lead" }).first();
  await expect(row.getByText(/IST/)).toBeVisible();
  await expect(row.getByText("Soft Bob")).toBeVisible();
  await row.getByRole("button", { name: /Status New/ }).click();
  await expect(row.getByRole("button", { name: /Status Contacted/ })).toBeVisible();

  await page.goto("/admin/services");
  await expect(page.getByRole("heading", { name: "Your services" })).toBeVisible();
  await expect(page.getByText("Haircut")).toBeVisible();
  const serviceName = `Matrix Cut ${Date.now().toString(36)}`;
  await page.getByLabel("Service name").fill(serviceName);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(serviceName)).toBeVisible();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.goto("/admin/qr");
  await expect(page.getByRole("heading", { name: /QR/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "View try-on" })).toBeVisible();

  const nav = await openNav(page);
  await nav.locator("summary", { hasText: "More" }).click();
  for (const label of ["Styles", "Services", "Settings", "Team", "Billing", "Security"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  const cleanup = await salonDb();
  await cleanup.lead.delete({ where: { id: lead.id } });
  await cleanup.$disconnect();
});

test("super-admin: overview, salons list, and a new salon", async ({ page }) => {
  await signIn(page, SUPER.email, SUPER.password);
  await expect(page.getByRole("heading", { name: "Lookuvi" })).toBeVisible();
  await expect(page.getByText("Active salons")).toBeVisible();
  await page.goto("/super/salons");
  await expect(page.getByRole("heading", { name: "Salons" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Trial ends" })).toBeVisible();

  const slug = `matrix-${Date.now().toString(36)}`;
  const name = `Matrix ${slug}`;
  await page.getByRole("button", { name: "New salon" }).click();
  const dialog = page.getByRole("dialog", { name: "New salon" });
  await expect(dialog.getByText(/Lowercase letters, numbers, and hyphens/)).toBeVisible();
  await expect(dialog.getByText(/At least 12 characters/)).toBeVisible();
  await dialog.getByLabel(/^Name/).fill(name);
  await dialog.getByLabel(/^Slug/).fill(slug);
  await dialog.getByLabel(/^Owner email/).fill(`owner-${slug}@example.com`);
  await dialog.getByLabel(/^Owner password/).fill("MatrixSalon#2026");
  await dialog.getByRole("button", { name: "Create salon" }).click();
  await expect(page.getByRole("link", { name: slug })).toBeVisible({ timeout: 20_000 });
});

test("super-admin: try-on only, queue only, and both change what the owner and guest see", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signIn(page, SUPER.email, SUPER.password);
  await page.goto("/super/salons");
  const slug = `switch-${Date.now().toString(36)}`;
  const name = `Switch ${slug}`;
  const email = `owner-${slug}@example.com`;
  const password = "MatrixSalon#2026";
  await page.getByRole("button", { name: "New salon" }).click();
  const create = page.getByRole("dialog", { name: "New salon" });
  await create.getByLabel(/^Name/).fill(name);
  await create.getByLabel(/^Slug/).fill(slug);
  await create.getByLabel(/^Owner email/).fill(email);
  await create.getByLabel(/^Owner password/).fill(password);
  await create.getByRole("button", { name: "Create salon" }).click();
  await expect(page.getByRole("link", { name: slug })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel("Search salons").fill(slug);
  await page.getByText(name, { exact: true }).click();
  const sheet = page.getByRole("dialog", { name });
  await sheet.getByRole("tab", { name: "Plan & credits" }).click();
  await expect(sheet.getByRole("checkbox", { name: /AI Try-on/ })).toBeChecked();
  await expect(sheet.getByRole("checkbox", { name: /^Queue/ })).not.toBeChecked();

  const guestTryOn = await freshPage(browser);
  await guestTryOn.page.goto(`/s/${slug}`);
  await expect(guestTryOn.page.getByRole("tab", { name: "Hair style" })).toBeVisible();
  await guestTryOn.page.goto(`/s/${slug}/queue`);
  await expect(guestTryOn.page.getByText("The queue is turned off for this salon.")).toBeVisible();
  await guestTryOn.context.close();

  const ownerTryOn = await freshPage(browser);
  await signIn(ownerTryOn.page, email, password);
  await expect(ownerTryOn.page).toHaveURL(/\/admin\/leads/);
  await ownerTryOn.page.goto("/admin/queue");
  await expect(ownerTryOn.page.getByText("Queue is turned off for this salon.")).toBeVisible();
  const tryOnNav = await openNav(ownerTryOn.page);
  await expect(tryOnNav.getByRole("link", { name: "Queue", exact: true })).toHaveCount(0);
  await expect(tryOnNav.getByRole("link", { name: /^QR/ })).toBeVisible();
  await ownerTryOn.context.close();

  await sheet.getByRole("checkbox", { name: /^Queue/ }).click();
  await expect(sheet.getByRole("checkbox", { name: /^Queue/ })).toBeChecked();
  await sheet.getByRole("checkbox", { name: /AI Try-on/ }).click();
  await expect(sheet.getByRole("checkbox", { name: /AI Try-on/ })).not.toBeChecked();

  const guestQueue = await freshPage(browser);
  await guestQueue.page.goto(`/s/${slug}`);
  await expect(guestQueue.page).toHaveURL(new RegExp(`/s/${slug}/queue`));
  await expect(guestQueue.page.getByRole("button", { name: "Join the queue" })).toBeVisible();
  await guestQueue.context.close();

  const ownerQueue = await freshPage(browser);
  await signIn(ownerQueue.page, email, password);
  await expect(ownerQueue.page).toHaveURL(/\/admin\/queue/);
  await ownerQueue.page.goto("/admin/styles");
  await expect(ownerQueue.page.getByText("Try-on is turned off for this salon.")).toBeVisible();
  const queueNav = await openNav(ownerQueue.page);
  await expect(queueNav.getByRole("link", { name: "Queue", exact: true })).toBeVisible();
  await expect(queueNav.getByRole("link", { name: /^QR/ })).toHaveCount(0);
  await ownerQueue.context.close();

  await sheet.getByRole("checkbox", { name: /AI Try-on/ }).click();
  await expect(sheet.getByRole("checkbox", { name: /AI Try-on/ })).toBeChecked();
  const guestBoth = await freshPage(browser);
  await guestBoth.page.goto(`/s/${slug}`);
  await expect(guestBoth.page.getByRole("tab", { name: "Hair style" })).toBeVisible();
  await expect(guestBoth.page.getByRole("link", { name: "Join queue" })).toBeVisible();
  await guestBoth.context.close();
});

test("super-admin: change plan, confirm a credit adjustment, and confirm suspend", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signIn(page, SUPER.email, SUPER.password);
  await page.goto("/super/salons");
  const slug = `plan-${Date.now().toString(36)}`;
  const name = `Plan ${slug}`;
  await page.getByRole("button", { name: "New salon" }).click();
  const create = page.getByRole("dialog", { name: "New salon" });
  await create.getByLabel(/^Name/).fill(name);
  await create.getByLabel(/^Slug/).fill(slug);
  await create.getByRole("button", { name: "Create salon" }).click();
  await expect(page.getByRole("link", { name: slug })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Search salons").fill(slug);
  await page.getByText(name, { exact: true }).click();
  const sheet = page.getByRole("dialog", { name });
  await sheet.getByRole("tab", { name: "Plan & credits" }).click();
  await sheet.getByRole("button", { name: "Adjust credits" }).click();
  const credits = page.getByRole("dialog", { name: "Adjust credits" });
  await expect(credits.getByRole("button", { name: "Confirm adjustment" })).toBeDisabled();
  await credits.getByLabel("Credit reason").fill("Phone matrix check");
  await credits.getByLabel("Credit amount").fill("10");
  await credits.getByRole("button", { name: "Confirm adjustment" }).click();
  await expect(page.getByRole("link", { name: slug })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Search salons").fill(slug);
  const credited = page.getByRole("row", { name: new RegExp(slug) });
  await expect(credited.getByRole("cell", { name: "910", exact: true })).toBeVisible();

  await page.getByText(name, { exact: true }).click();
  const reopened = page.getByRole("dialog", { name });
  await reopened.getByRole("tab", { name: "Plan & credits" }).click();
  await reopened.getByRole("button", { name: "Change plan" }).click();
  const plan = page.getByRole("dialog", { name: "Change plan" });
  await plan.getByLabel("Plan").selectOption("PRO");
  await plan.getByRole("button", { name: "Set plan" }).click();
  await expect(page.getByRole("link", { name: slug })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Search salons").fill(slug);
  await expect(page.getByRole("row", { name: new RegExp(slug) }).getByRole("cell", { name: "Pro", exact: true })).toBeVisible();

  await page.getByText(name, { exact: true }).click();
  const suspendSheet = page.getByRole("dialog", { name });
  await suspendSheet.getByRole("tab", { name: "Plan & credits" }).click();
  await suspendSheet.getByRole("button", { name: "Suspend" }).click();
  await page.getByRole("dialog", { name: "Suspend salon" }).getByRole("button", { name: "Confirm suspend" }).click();
  await expect(page.getByRole("link", { name: slug })).toBeVisible({ timeout: 20_000 });

  const guest = await freshPage(browser);
  await guest.page.goto(`/s/${slug}`);
  await expect(guest.page.getByRole("heading", { name: "This salon is paused" })).toBeVisible();
  await guest.context.close();
});

test("super-admin: audit shows names and a salon filter, and spend shows a salon column", async ({ page }) => {
  const prisma = await salonDb();
  const [actor, salon] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: SUPER.email } }),
    prisma.tenant.findUniqueOrThrow({ where: { slug: "demo" } }),
  ]);
  const row = await prisma.auditLog.create({
    data: { actorId: actor.id, action: "AI_KEY_UPDATE", target: salon.id, meta: JSON.stringify({ provider: "fal" }) },
  });
  await prisma.$disconnect();

  await signIn(page, SUPER.email, SUPER.password);
  await page.goto("/super/audit");
  await expect(page.getByRole("cell", { name: "super@agenticbuildworks.com" }).first()).toBeVisible();
  await page.getByLabel("Salon").selectOption({ label: "Demo Salon – Bengaluru" });
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/salon=/);
  await expect(page.getByRole("cell", { name: "Demo Salon – Bengaluru" }).first()).toBeVisible();

  await page.goto("/super/costs");
  await expect(page.getByRole("heading", { name: "Spend & costs" })).toBeVisible();
  await expect(page.locator("th").filter({ hasText: "Salon" })).toHaveCount(1);

  const cleanup = await salonDb();
  await cleanup.auditLog.delete({ where: { id: row.id } });
  await cleanup.$disconnect();
});

test("edge: zero try-ons still shows the owner the balance", async ({ page }) => {
  test.setTimeout(120_000);
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo" }, data: { creditBalance: 0, productTryOn: true } });
  await prisma.$disconnect();
  await signIn(page, OWNER.email, OWNER.password);
  const nav = await openNav(page);
  await expect(nav.getByText("0 try-ons left")).toBeVisible();
  await page.goto("/s/demo");
  await previewLook(page, "Soft Bob");
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
});

test("edge: a paused queue tells the guest to ask at the desk", async ({ page }) => {
  const prisma = await salonDb();
  const tenant = await prisma.tenant.update({ where: { slug: "demo" }, data: { productQueue: true } });
  await prisma.queueState.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, isOpen: false, mode: "LIVE", units: 1, avgMinutes: 20, alertLeadMin: 5, unitLabel: "chair" },
    update: { isOpen: false, mode: "LIVE" },
  });
  await prisma.$disconnect();
  await page.goto("/s/demo/queue");
  await expect(page.getByText("The queue is paused. Please ask at the desk.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Join the queue" })).toBeDisabled();
});

test("edge: both products off hides the tools and says so", async ({ page }) => {
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo" }, data: { productTryOn: false, productQueue: false } });
  await prisma.$disconnect();
  await page.goto("/s/demo");
  await expect(page.getByText("Try-on is not available.")).toBeVisible();
  await signIn(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL(/\/admin\/leads/);
  const nav = await openNav(page);
  await expect(nav.getByRole("link", { name: "Queue", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /^QR/ })).toHaveCount(0);
  await page.goto("/admin/queue");
  await expect(page.getByText("Queue is turned off for this salon.")).toBeVisible();
  await page.goto("/admin/styles");
  await expect(page.getByText("Try-on is turned off for this salon.")).toBeVisible();
});

test("edge: an invalid token URL says the visit was not found", async ({ page }) => {
  const prisma = await salonDb();
  await prisma.tenant.update({ where: { slug: "demo" }, data: { productQueue: true } });
  await prisma.$disconnect();
  await page.goto("/s/demo/q/not-a-real-token");
  await expect(page.getByText("That visit was not found.")).toBeVisible();
});

test("edge: long, Hindi, and Telugu names stay intact on the desk", async ({ page }) => {
  const prisma = await salonDb();
  const tenant = await prisma.tenant.update({ where: { slug: "demo" }, data: { productQueue: true } });
  await prisma.queueEntry.deleteMany({ where: { tenantId: tenant.id, status: { in: ["WAITING", "CALLED", "IN_SERVICE"] } } });
  await prisma.queueState.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, isOpen: true, mode: "LIVE", units: 1, avgMinutes: 20, alertLeadMin: 5, unitLabel: "chair" },
    update: { isOpen: true, mode: "LIVE" },
  });
  await prisma.$disconnect();

  await signIn(page, OWNER.email, OWNER.password);
  await page.locator("[data-queue-mode][data-ready='yes']").waitFor();
  const longName = `Long${"x".repeat(86)}`;
  await page.getByLabel("Walk-in name").fill(longName);
  await page.getByRole("button", { name: "Add walk-in" }).click();
  await expect(page.getByText(longName.slice(0, 80))).toBeVisible();

  await page.getByLabel("Walk-in name").fill("श्रीमती लक्ष्मी");
  await page.getByRole("button", { name: "Add walk-in" }).click();
  await expect(page.getByText("श्रीमती लक्ष्मी")).toBeVisible();

  await page.getByLabel("Walk-in name").fill("శ్రీమతి లక్ష్మి");
  await page.getByRole("button", { name: "Add walk-in" }).click();
  await expect(page.getByText("శ్రీమతి లక్ష్మి")).toBeVisible();
});
