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
  await expect(page.getByRole("button", { name: "Upload a photo instead" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use photo" })).toHaveCount(1);
  const video = page.locator("[data-studio='live'] video");
  expect(await video.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  const boxes = await page.evaluate(() => {
    const box = (name: string) => document.querySelector(`[aria-label='${name}']`)?.getBoundingClientRect();
    const zoom = box("Zoom out");
    const row = document.querySelector(".live-row")?.getBoundingClientRect();
    const guide = document.querySelector(".cam-guide-face")?.getBoundingClientRect();
    return { zoom, row, guide };
  });
  expect(boxes.zoom && boxes.row && boxes.guide).toBeTruthy();
  if (boxes.zoom && boxes.row && boxes.guide) {
    const overlaps = (a: typeof boxes.zoom, b: typeof boxes.row) =>
      Boolean(a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y);
    expect(overlaps(boxes.zoom, boxes.row)).toBe(false);
    const center = { x: boxes.guide.x + boxes.guide.width * 0.35, y: boxes.guide.y + boxes.guide.height * 0.4, width: boxes.guide.width * 0.3, height: boxes.guide.height * 0.25 };
    expect(overlaps(center, boxes.row)).toBe(false);
    expect(overlaps(center, boxes.zoom)).toBe(false);
  }
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
  expect(await page.locator("header").count()).toBe(1);
  await page.locator("[data-scroll='salon']").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  expect(await page.locator("header").count()).toBe(1);
  expect(await page.locator("header").evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);
  await page.locator("[data-scroll='salon']").evaluate((el) => { el.scrollTop = 0; });
  await page.evaluate(() => {
    const shell = document.querySelector("[data-salon-mode]") as HTMLElement | null;
    const scroller = document.querySelector("[data-scroll='salon']") as HTMLElement | null;
    if (!shell || !scroller) return;
    shell.style.height = "auto";
    shell.style.maxHeight = "none";
    shell.style.overflow = "visible";
    scroller.style.overflow = "visible";
    scroller.style.height = "auto";
    scroller.style.flex = "none";
  });
  await page.screenshot({ path: `${SHOTS}/375-bridal.png`, fullPage: true });
  const { readFileSync } = await import("node:fs");
  const sharp = (await import("sharp")).default;
  const decoded = await sharp(readFileSync(`${SHOTS}/375-bridal.png`)).raw().toBuffer({ resolveWithObject: true });
  const span = Math.min(160, Math.floor(decoded.info.height / 5));
  const stride = decoded.info.width * decoded.info.channels;
  let repeatedAt = 0;
  for (let y = span; y + span < decoded.info.height; y += 6) {
    let diff = 0;
    let n = 0;
    for (let i = 0; i < span * stride; i += 48) {
      diff += Math.abs((decoded.data[y * stride + i] ?? 0) - (decoded.data[i] ?? 0));
      n += 1;
    }
    if (n && diff / n < 3) {
      repeatedAt = y;
      break;
    }
  }
  expect(repeatedAt, "header bitmap repeated down the bridal page").toBe(0);
  await page.evaluate(() => {
    const shell = document.querySelector("[data-salon-mode]") as HTMLElement | null;
    const scroller = document.querySelector("[data-scroll='salon']") as HTMLElement | null;
    if (!shell || !scroller) return;
    shell.style.height = "";
    shell.style.maxHeight = "";
    shell.style.overflow = "";
    scroller.style.overflow = "";
    scroller.style.height = "";
    scroller.style.flex = "";
  });
  await page.locator("[data-step='hair']").scrollIntoViewIfNeeded();
  await expect(page.getByText("Photo coming").first()).toBeVisible();
  expect(missing).toEqual([]);
  await page.screenshot({ path: `${SHOTS}/375-hair.png` });
  expect(await header.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: `${SHOTS}/desktop-bridal.png` });
});

test("live look tints lips, keeps hair off the face, and dyes only hair", async ({ page }) => {
  test.setTimeout(240_000);
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("BROWSER", msg.text());
  });
  for (const name of ["woman-long-dark.jpg", "man-beard-dark.jpg", "glasses-beard.jpg"]) {
    await page.goto(`/live-look-check?src=${name}`);
    await expect(page.locator("canvas[data-look='after']")).toHaveAttribute("data-state", "tracking", { timeout: 90_000 });
    await expect(page.locator("canvas[data-look='before']")).toHaveAttribute("data-state", "tracking", { timeout: 90_000 });
    await expect(page.locator("canvas[data-look='hair']")).toHaveAttribute("data-state", "tracking", { timeout: 90_000 });
    const shot = await page.evaluate(() => {
      const after = document.querySelector("canvas[data-look='after']") as HTMLCanvasElement;
      const before = document.querySelector("canvas[data-look='before']") as HTMLCanvasElement;
      const hair = document.querySelector("canvas[data-look='hair']") as HTMLCanvasElement;
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
      const hairCtx = copy(hair);
      if (!afterCtx || !beforeCtx || !hairCtx) return null;
      const read = (ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, key: string) => {
        const x = Number(source.dataset[`${key}X`]);
        const y = Number(source.dataset[`${key}Y`]);
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0];
      };
      const keys = ["lip", "near", "eye", "lid", "hair", "forehead", "cheek", "beard", "brow"] as const;
      const samples: Record<string, { before: number[]; after: number[]; hair: number[] }> = {};
      for (const key of keys) {
        samples[key] = { before: read(beforeCtx, after, key), after: read(afterCtx, after, key), hair: read(hairCtx, hair, key) };
      }
      const w = before.width;
      const h = before.height;
      const a = hairCtx.getImageData(0, 0, w, h).data;
      const b = beforeCtx.getImageData(0, 0, w, h).data;
      let max = 0;
      let count = 0;
      let sumLuma = 0;
      let skinCount = 0;
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const i = (y * w + x) * 4;
          const delta = Math.hypot((a[i] ?? 0) - (b[i] ?? 0), (a[i + 1] ?? 0) - (b[i + 1] ?? 0), (a[i + 2] ?? 0) - (b[i + 2] ?? 0));
          if (delta > 18) {
            const pixelLuma = 0.2126 * (b[i] ?? 0) + 0.7152 * (b[i + 1] ?? 0) + 0.0722 * (b[i + 2] ?? 0);
            count += 1;
            sumLuma += pixelLuma;
            if (pixelLuma > 105) skinCount += 1;
            if (delta > max) max = delta;
          }
        }
      }
      const inside = (x: number, y: number, poly: { x: number; y: number }[]) => {
        let hit = false;
        for (let i = 0; i < poly.length; i += 1) {
          const a = poly[i]!;
          const b = poly[(i + 1) % poly.length]!;
          const up = (a.y > y) !== (b.y > y);
          if (!up) continue;
          const xCross = ((b.x - a.x) * (y - a.y)) / (b.y - a.y + 1e-6) + a.x;
          if (x < xCross) hit = !hit;
        }
        return hit;
      };
      const parsePoly = (raw: string | undefined) => {
        const nums = (raw || "").split(",").map(Number);
        const poly: { x: number; y: number }[] = [];
        for (let i = 0; i + 1 < nums.length; i += 2) poly.push({ x: nums[i] ?? 0, y: nums[i + 1] ?? 0 });
        return poly;
      };
      const lumaAt = (data: Uint8ClampedArray, index: number) =>
        0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0);
      const afterPx = afterCtx.getImageData(0, 0, w, h).data;
      const beforePx = beforeCtx.getImageData(0, 0, w, h).data;
      let eyeN = 0;
      let eyeBeforeSum = 0;
      let eyeAfterSum = 0;
      for (const poly of [parsePoly(after.dataset.eyeR), parsePoly(after.dataset.eyeL)]) {
        if (poly.length < 8) continue;
        const minX = Math.max(0, Math.floor(Math.min(...poly.map((point) => point.x))));
        const maxX = Math.min(w - 1, Math.ceil(Math.max(...poly.map((point) => point.x))));
        const minY = Math.max(0, Math.floor(Math.min(...poly.map((point) => point.y))));
        const maxY = Math.min(h - 1, Math.ceil(Math.max(...poly.map((point) => point.y))));
        for (let y = minY; y <= maxY; y += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            if (!inside(x + 0.5, y + 0.5, poly)) continue;
            const index = (y * w + x) * 4;
            eyeN += 1;
            eyeBeforeSum += lumaAt(beforePx, index);
            eyeAfterSum += lumaAt(afterPx, index);
          }
        }
      }
      return {
        seg: after.dataset.seg || "",
        hairSeg: hair.dataset.seg || "",
        samples,
        eyeN,
        eyeLumaDelta: eyeN ? Math.abs(eyeAfterSum / eyeN - eyeBeforeSum / eyeN) : 999,
        peak: { max, count, skinCount, meanLuma: count ? sumLuma / count : 255 },
      };
    });
    expect(shot, name).toBeTruthy();
    if (!shot) return;
    const lip = dist(shot.samples.lip!.before, shot.samples.lip!.after);
    const near = dist(shot.samples.near!.before, shot.samples.near!.after);
    const eye = dist(shot.samples.eye!.before, shot.samples.eye!.after);
    const hair = dist(shot.samples.hair!.before, shot.samples.hair!.after);
    const forehead = dist(shot.samples.forehead!.before, shot.samples.forehead!.after);
    const cheek = dist(shot.samples.cheek!.before, shot.samples.cheek!.after);
    const lid = dist(shot.samples.lid!.before, shot.samples.lid!.after);
    const beard = dist(shot.samples.beard!.before, shot.samples.beard!.after);
    const brow = dist(shot.samples.brow!.before, shot.samples.brow!.after);
    const dyedScalp = dist(shot.samples.hair!.before, shot.samples.hair!.hair);
    const dyedForehead = dist(shot.samples.forehead!.before, shot.samples.forehead!.hair);
    const dyedCheek = dist(shot.samples.cheek!.before, shot.samples.cheek!.hair);
    const dyedBeard = dist(shot.samples.beard!.before, shot.samples.beard!.hair);
    const eyeBefore = luma(shot.samples.eye!.before);
    const eyeAfter = luma(shot.samples.eye!.after);
    const browBefore = luma(shot.samples.brow!.before);
    const browAfter = luma(shot.samples.brow!.after);
    console.log("LOOK", name, { lip, near, eye, lid, hair, forehead, cheek, beard, brow, dyedScalp, dyedForehead, dyedCheek, dyedBeard, seg: shot.seg, hairSeg: shot.hairSeg, peak: shot.peak, eyeBefore, eyeAfter, eyeN: shot.eyeN, eyeLumaDelta: shot.eyeLumaDelta, browBefore, browAfter });
    const base = name.replace(".jpg", "");
    await page.screenshot({ path: `${SHOTS}/${base}-before-after.png`, fullPage: true });
    await page.locator("canvas[data-look='before']").screenshot({ path: `${SHOTS}/${base}-canvas-before.png` });
    await page.locator("canvas[data-look='after']").screenshot({ path: `${SHOTS}/${base}-canvas-after.png` });
    await page.locator("canvas[data-look='hair']").screenshot({ path: `${SHOTS}/${base}-canvas-hair.png` });
    expect(shot.seg, name).toBe("on");
    expect(shot.hairSeg, name).toBe("on");
    expect(shot.eyeN, name).toBeGreaterThan(40);
    expect(shot.eyeLumaDelta, name).toBeLessThanOrEqual(8);
    expect(lip, name).toBeGreaterThan(8);
    expect(lip, name).toBeGreaterThan(near + 4);
    expect(cheek, name).toBeGreaterThan(1);
    expect(cheek, name).toBeLessThan(40);
    expect(eye, name).toBeLessThan(12);
    expect(brow, name).toBeLessThan(70);
    expect(browAfter, name).toBeGreaterThan(browBefore * 0.45);
    expect(forehead, name).toBeLessThan(16);
    expect(beard, name).toBeLessThan(16);
    expect(dyedForehead, name).toBeLessThan(16);
    expect(dyedCheek, name).toBeLessThan(16);
    expect(dyedBeard, name).toBeLessThan(16);
    if (name === "glasses-beard.jpg") {
      expect(dyedScalp, name).toBeLessThan(12);
      expect(shot.peak.skinCount, name).toBeLessThan(40);
    } else {
      expect(shot.peak.count, name).toBeGreaterThan(200);
      expect(shot.peak.meanLuma, name).toBeLessThan(100);
      expect(shot.peak.skinCount, name).toBeLessThan(shot.peak.count * 0.2);
    }
  }
});
