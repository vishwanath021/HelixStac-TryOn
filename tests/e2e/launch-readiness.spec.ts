import { hash } from "bcryptjs";
import sharp from "sharp";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const OUT = "/opt/cursor/artifacts/launch-qa";
const PASSWORD = "LaunchOwner#2026";
const SUPER_EMAIL = "launch-super@lookuvi.test";
const SALONS = [
  { slug: "meera-beauty", name: "Meera Beauty Parlour", email: "meera@lookuvi.test", owner: "Meera Rao", onboardingDone: true },
  { slug: "rao-family", name: "Rao Family Salon", email: "rao@lookuvi.test", owner: "Arun Rao", onboardingDone: false },
  { slug: "north-star", name: "North Star Family Salon", email: "north@lookuvi.test", owner: "Leela Nair", onboardingDone: true },
] as const;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function shot(page: Page, name: string) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("form[data-ready='yes']").waitFor();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin|super)/);
}

async function db() {
  process.env.DATABASE_URL ||= "file:./launch-qa.db";
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

test.beforeAll(async () => {
  const prisma = await db();
  const passwordHash = await hash(PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: SUPER_EMAIL },
    update: { passwordHash, isSuperAdmin: true, name: "Launch Super" },
    create: { email: SUPER_EMAIL, passwordHash, isSuperAdmin: true, name: "Launch Super" },
  });
  for (const salon of SALONS) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: salon.slug },
      update: {
        name: salon.name,
        productQueue: true,
        productTryOn: true,
        productBridal: true,
        onboardingDone: salon.onboardingDone,
        whatsapp: "919800011199",
        address: "12 Church Street, Bengaluru",
        creditBalance: 500,
        dailyCap: 500,
        anonDailyCap: 40,
        showMen: true,
        showWomen: true,
        showKids: true,
        status: "TRIAL",
      },
      create: {
        slug: salon.slug,
        name: salon.name,
        productQueue: true,
        productTryOn: true,
        productBridal: true,
        onboardingDone: salon.onboardingDone,
        whatsapp: "919800011199",
        address: "12 Church Street, Bengaluru",
        creditBalance: 500,
        dailyCap: 500,
        anonDailyCap: 40,
        showMen: true,
        showWomen: true,
        showKids: true,
      },
    });
    await prisma.service.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: "haircut" } },
      update: { name: "Haircut", priceInr: 499, durationMin: 20, active: true },
      create: { tenantId: tenant.id, key: "haircut", name: "Haircut", priceInr: 499, durationMin: 20, nameI18n: "{}" },
    });
    await prisma.queueState.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, isOpen: true, mode: "LIVE", units: 1, avgMinutes: 20, alertLeadMin: 5, unitLabel: "chair" },
      update: { isOpen: true, mode: "LIVE", units: 1, avgMinutes: 20, alertLeadMin: 5 },
    });
    await prisma.queueEntry.deleteMany({ where: { tenantId: tenant.id } });
    const user = await prisma.user.upsert({
      where: { email: salon.email },
      update: { passwordHash, name: salon.owner },
      create: { email: salon.email, passwordHash, name: salon.owner },
    });
    await prisma.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      update: { role: "OWNER" },
      create: { userId: user.id, tenantId: tenant.id, role: "OWNER" },
    });
  }
  await prisma.$disconnect();
});

test("Sunday rush across three salons", async ({ page, browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The desktop project opens both desktop and phone screens.");

  const names = ["Aarav", "Diya", "Kabir", "Meera", "Anaya", "Vivaan", "Sara", "Ishaan", "Myra"];
  const joined: { slug: string; name: string; token: number; ref: string }[] = [];
  let phoneN = 100;

  async function join(api: APIRequestContext, slug: string, name: string, ip: string) {
    const res = await api.post("/api/v1/queue", {
      headers: { "x-forwarded-for": ip },
      data: {
        slug,
        name,
        phone: `98${String(phoneN++).padStart(8, "0")}`,
        consent: true,
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    joined.push({ slug, name, token: body.token, ref: body.ref });
    return body;
  }

  for (const salon of SALONS) {
    const pair = await Promise.all([
      join(request, salon.slug, names[0], `10.8.${salon.slug.length}.1`),
      join(request, salon.slug, names[1], `10.8.${salon.slug.length}.2`),
    ]);
    expect(new Set(pair.map((row) => row.token)).size).toBe(2);
    for (let index = 2; index < names.length; index += 1) {
      await join(request, salon.slug, names[index], `10.9.${salon.slug.length}.${index}`);
    }
  }
  expect(joined).toHaveLength(27);
  for (const salon of SALONS) {
    const tokens = joined.filter((row) => row.slug === salon.slug).map((row) => row.token).sort((a, b) => a - b);
    expect(tokens).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }

  const parlour = joined.find((row) => row.slug === "meera-beauty" && row.token === 1)!;
  const leaked = await request.get(`/api/v1/queue/status?slug=rao-family&ref=${parlour.ref}`);
  expect(leaked.status()).toBe(404);

  const jpeg = await sharp({ create: { width: 240, height: 320, channels: 3, background: "#c9a27c" } }).jpeg().toBuffer();
  for (const [slug, styleId] of [
    ["meera-beauty", "soft-bob"],
    ["rao-family", "crew-cut"],
    ["north-star", "kids-soft-bob"],
  ] as const) {
    const preview = await request.post("/api/v1/tryon/generate", {
      multipart: {
        photo: { name: "selfie.jpg", mimeType: "image/jpeg", buffer: jpeg },
        slug,
        styleId,
        sessionId: `launch-${slug}`,
        tool: "style",
        requestId: `launch-${slug}-${styleId}`,
      },
    });
    expect(preview.status(), await preview.text()).toBe(200);
    expect(preview.headers()["content-type"] || "").toContain("image");
  }

  const booked = await request.post("/api/v1/leads", {
    data: { slug: "meera-beauty", sessionId: "launch-book", styleId: "soft-bob", tool: "style", name: "Diya", phone: "9800000099" },
  });
  expect(booked.ok()).toBeTruthy();
  const booking = await booked.json();
  expect(booking.whatsappUrl).toContain("https://wa.me/");

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await phone.newPage();
  await guest.goto("/s/meera-beauty/queue");
  await guest.locator("form[data-ready='yes']").waitFor();
  await expect(guest.getByRole("heading", { name: "Meera Beauty Parlour" })).toBeVisible();
  await shot(guest, "customer_queue_phone");
  await guest.goto(`/s/meera-beauty/q/${parlour.ref}`);
  await guest.locator("[data-status='WAITING'][data-ready='yes']").waitFor();
  await expect(guest.getByText("Token 1")).toBeVisible();
  await shot(guest, "customer_ticket_phone");

  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, "meera@lookuvi.test");
  await page.goto("/admin/queue");
  await page.locator("[data-queue-mode][data-ready='yes']").waitFor();
  await expect(page.getByText("Aarav")).toBeVisible();
  await expect(page.getByText("North Star")).toHaveCount(0);
  await shot(page, "owner_desk_desktop");
  await page.getByRole("button", { name: "NEXT" }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  await shot(page, "owner_called_desktop");
  await expect(guest.getByText("Your turn")).toBeVisible({ timeout: 20_000 });
  await shot(guest, "customer_turn_phone");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
  await shot(page, "owner_in_service_desktop");
  await expect(guest.getByText("You are being served.")).toBeVisible({ timeout: 20_000 });

  await page.locator("section").filter({ has: page.getByRole("heading", { name: "Waiting" }) }).getByRole("button", { name: "No-show" }).first().click();
  await page.getByRole("heading", { name: "Now serving" }).locator("xpath=..").getByRole("button", { name: "Done" }).click();

  for (let step = 0; step < 40; step += 1) {
    const deskRes = await page.request.get("/api/v1/admin/queue");
    const desk = await deskRes.json();
    const seat = desk.serving?.find((item: { entry: { id: string; status: string } | null }) => item.entry)?.entry;
    if (seat?.status === "CALLED") {
      await page.request.post("/api/v1/admin/queue", { data: { action: "start", id: seat.id } });
      continue;
    }
    if (seat) {
      await page.request.post("/api/v1/admin/queue", { data: { action: "done", id: seat.id } });
      continue;
    }
    if (!desk.waiting?.length) break;
    await page.request.post("/api/v1/admin/queue", { data: { action: "next" } });
  }
  await page.reload();
  await page.locator("[data-queue-mode][data-ready='yes']").waitFor();
  await expect(page.getByText("No one is waiting")).toBeVisible();
  await shot(page, "owner_desk_clear_desktop");

  await page.goto("/s/meera-beauty/qr");
  await expect(page.getByRole("heading", { name: "Meera Beauty Parlour" })).toBeVisible();
  await expect(page.locator("img[alt*='QR']")).toBeVisible();
  await shot(page, "qr_poster_desktop");

  await page.goto("/s/meera-beauty");
  await expect(page.getByRole("heading", { name: "Meera Beauty Parlour" })).toBeVisible();
  await shot(page, "customer_tryon_desktop");
  await guest.goto("/s/rao-family");
  await expect(guest.getByRole("heading", { name: "Rao Family Salon" })).toBeVisible();
  await shot(guest, "customer_tryon_phone");

  await page.context().clearCookies();
  await signIn(page, "rao@lookuvi.test");
  await page.goto("/admin/onboarding");
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await shot(page, "onboarding_desktop");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 2 of 5")).toBeVisible();
  await page.goto("/admin/queue");
  await page.locator("[data-queue-mode][data-ready='yes']").waitFor();
  await expect(page.getByText("Meera Beauty")).toHaveCount(0);
  for (let step = 0; step < 40; step += 1) {
    const deskRes = await page.request.get("/api/v1/admin/queue");
    const desk = await deskRes.json();
    const seat = desk.serving?.find((item: { entry: { id: string; status: string } | null }) => item.entry)?.entry;
    if (seat?.status === "CALLED") {
      await page.request.post("/api/v1/admin/queue", { data: { action: "start", id: seat.id } });
      continue;
    }
    if (seat) {
      await page.request.post("/api/v1/admin/queue", { data: { action: "done", id: seat.id } });
      continue;
    }
    if (!desk.waiting?.length) break;
    const next = await page.request.post("/api/v1/admin/queue", { data: { action: "next" } });
    expect(next.ok(), await next.text()).toBeTruthy();
  }

  await page.context().clearCookies();
  await signIn(page, "north@lookuvi.test");
  await page.goto("/admin/queue");
  await page.locator("[data-queue-mode][data-ready='yes']").waitFor();
  await expect(page.getByText("Aarav")).toBeVisible();
  await expect(page.getByText("Meera Beauty")).toHaveCount(0);
  for (let step = 0; step < 40; step += 1) {
    const deskRes = await page.request.get("/api/v1/admin/queue");
    const desk = await deskRes.json();
    const seat = desk.serving?.find((item: { entry: { id: string; status: string } | null }) => item.entry)?.entry;
    if (seat?.status === "CALLED") {
      await page.request.post("/api/v1/admin/queue", { data: { action: "start", id: seat.id } });
      continue;
    }
    if (seat) {
      await page.request.post("/api/v1/admin/queue", { data: { action: "done", id: seat.id } });
      continue;
    }
    if (!desk.waiting?.length) break;
    await page.request.post("/api/v1/admin/queue", { data: { action: "next" } });
  }

  await page.context().clearCookies();
  await signIn(page, SUPER_EMAIL);
  await page.goto("/super/salons");
  await expect(page.getByText("Meera Beauty Parlour")).toBeVisible();
  await expect(page.getByText("Rao Family Salon")).toBeVisible();
  await expect(page.getByText("North Star Family Salon")).toBeVisible();
  await shot(page, "super_salons_desktop");
  await page.goto("/super/ai");
  await expect(page.getByRole("heading", { name: "Spend cap" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /sunburst/i })).toBeChecked();
  await shot(page, "super_spend_cap_desktop");
  await page.goto("/super/costs");
  await expect(page.getByRole("heading", { name: "Spend & costs" })).toBeVisible();
  await shot(page, "super_costs_desktop");

  await phone.close();
});
