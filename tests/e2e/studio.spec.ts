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
  const makeupMetal = await makeup.evaluate((el) => ({ image: getComputedStyle(el).backgroundImage, color: getComputedStyle(el).color }));
  expect(makeupMetal.image).toContain("gradient");
  expect(makeupMetal.color).toBe("rgb(255, 255, 255)");
  await openLive(page, "Live makeup");
  await expect(page.locator("[data-studio='live']")).toBeVisible();
  await expect(page.locator("[data-makeup='live']")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kajal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lashes" })).toBeVisible();
  const canvas = page.locator("[data-makeup='live']");
  await expect(canvas).toHaveAttribute("data-makeup-state", "tracking", { timeout: 40_000 });
  await expect.poll(async () => Number(await canvas.getAttribute("data-fps")), { timeout: 15_000 }).toBeGreaterThan(0);
  const fps = Number(await canvas.getAttribute("data-fps"));
  const degraded = await canvas.getAttribute("data-degraded");
  console.log("LIVE_FPS", fps, "degraded", degraded, "edge", await canvas.getAttribute("data-edge"), "seg", await canvas.getAttribute("data-seg"));
  if (fps < 24) expect(degraded).toBe("yes");
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

function luma(rgb: number[]) {
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
}

function dist(a: number[], b: number[]) {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

test("bridal catalogue, selfie copy, and header stay put", async ({ page }) => {
  test.setTimeout(120_000);
  const missing: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 404 && /hair-.*\.webp/.test(res.url())) missing.push(res.url());
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/s/demo");
  const header = page.locator("header");
  expect(await header.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);
  expect(await header.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(62, 48, 75)");
  await page.screenshot({ path: `${SHOTS}/375-everyday.png` });
  await page.getByRole("button", { name: "Bridal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bridal", exact: true })).toBeVisible();
  await expect(page.getByText("Upload a selfie to see this look on you.")).toBeVisible();
  const oval = page.locator("[data-step='selfie'] .rounded-\\[50\\%\\]");
  const copy = page.getByText("Upload a selfie to see this look on you.");
  const ovalBox = await oval.boundingBox();
  const copyBox = await copy.boundingBox();
  expect(ovalBox && copyBox && copyBox.y >= ovalBox.y + ovalBox.height - 4).toBeTruthy();
  await page.screenshot({ path: `${SHOTS}/375-bridal.png`, fullPage: true });
  await page.locator("[data-step='hair']").scrollIntoViewIfNeeded();
  await expect(page.getByText("Photo coming").first()).toBeVisible();
  expect(missing).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/375-hair.png` });
  expect(await header.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: `${SHOTS}/desktop-bridal.png` });
});

test("live look tints lips and hair without painting eyes or beard", async ({ page }) => {
  test.setTimeout(180_000);
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("BROWSER", msg.text());
  });
  for (const name of ["glasses-beard.jpg", "bindi-smile.jpg"]) {
    await page.goto(`/live-look-check?src=${name}`);
    await expect(page.locator("canvas[data-look='after']")).toHaveAttribute("data-state", "tracking", { timeout: 90_000 });
    await expect(page.locator("canvas[data-look='before']")).toHaveAttribute("data-state", "tracking", { timeout: 90_000 });
    const shot = await page.evaluate(() => {
      const after = document.querySelector("canvas[data-look='after']") as HTMLCanvasElement;
      const before = document.querySelector("canvas[data-look='before']") as HTMLCanvasElement;
      const copy = (canvas: HTMLCanvasElement) => {
        const next = document.createElement("canvas");
        next.width = canvas.width;
        next.height = canvas.height;
        const ctx = next.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(canvas, 0, 0);
        return ctx;
      };
      const afterCtx = copy(after);
      const beforeCtx = copy(before);
      if (!afterCtx || !beforeCtx) return null;
      const read = (ctx: CanvasRenderingContext2D, key: string) => {
        const x = Number(after.dataset[`${key}X`]);
        const y = Number(after.dataset[`${key}Y`]);
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0];
      };
      const keys = ["lip", "near", "eye", "hair", "beard", "brow"] as const;
      const samples: Record<string, { before: number[]; after: number[] }> = {};
      for (const key of keys) samples[key] = { before: read(beforeCtx, key), after: read(afterCtx, key) };
      return { seg: after.dataset.seg || "", samples };
    });
    expect(shot, name).toBeTruthy();
    if (!shot) return;
    const lip = dist(shot.samples.lip!.before, shot.samples.lip!.after);
    const near = dist(shot.samples.near!.before, shot.samples.near!.after);
    const eye = dist(shot.samples.eye!.before, shot.samples.eye!.after);
    const hair = dist(shot.samples.hair!.before, shot.samples.hair!.after);
    const beard = dist(shot.samples.beard!.before, shot.samples.beard!.after);
    const brow = dist(shot.samples.brow!.before, shot.samples.brow!.after);
    const eyeBefore = luma(shot.samples.eye!.before);
    const eyeAfter = luma(shot.samples.eye!.after);
    const browBefore = luma(shot.samples.brow!.before);
    const browAfter = luma(shot.samples.brow!.after);
    console.log("LOOK", name, { lip, near, eye, hair, beard, brow, seg: shot.seg, eyeBefore, eyeAfter, browBefore, browAfter });
    const base = name.replace(".jpg", "");
    await page.screenshot({ path: `${SHOTS}/${base}-before-after.png`, fullPage: true });
    await page.locator("canvas[data-look='before']").screenshot({ path: `${SHOTS}/${base}-canvas-before.png` });
    await page.locator("canvas[data-look='after']").screenshot({ path: `${SHOTS}/${base}-canvas-after.png` });
    expect(shot.seg, name).toBe("on");
    expect(lip, name).toBeGreaterThan(18);
    expect(lip, name).toBeGreaterThan(near + 8);
    expect(eye, name).toBeLessThan(28);
    expect(eyeAfter, name).toBeGreaterThan(eyeBefore - 18);
    expect(brow, name).toBeLessThan(70);
    expect(browAfter, name).toBeGreaterThan(browBefore * 0.55);
    expect(hair, name).toBeGreaterThan(beard + 6);
  }
});
