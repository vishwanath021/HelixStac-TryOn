import { copyFile, mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function shot(page: Page, name: string) {
  await mkdir("/tmp/lookuvi-shots", { recursive: true });
  const local = `/tmp/lookuvi-shots/${name}.png`;
  await page.screenshot({ path: local });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await copyFile(local, `/opt/cursor/artifacts/${name}.png`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

async function sampleStill(page: Page) {
  return page.waitForFunction(() => {
    const img = document.querySelector('section[aria-label="Photo"] img');
    if (!(img instanceof HTMLImageElement) || !img.complete || img.naturalWidth < 2) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 8, 8);
    return Array.from(ctx.getImageData(4, 4, 1, 1).data);
  }).then(async (handle) => (await handle.jsonValue()) as number[]);
}

async function waitForLiveFrame(page: Page) {
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    if (!(video instanceof HTMLVideoElement) || video.videoWidth < 10) return false;
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, 8, 8);
    const pixel = ctx.getImageData(4, 4, 1, 1).data;
    return pixel[0] + pixel[1] + pixel[2] > 30;
  });
}

test("tool pill stays one row at phone and tablet widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the test sets its own widths");
  await page.goto("/s/demo-salon");
  await expect(page.locator("header img")).toHaveAttribute("src", /lookuvi-mark\.svg/);
  for (const width of [320, 360, 390, 430, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const pill = page.locator(".seg");
    const box = await pill.boundingBox();
    expect(box, `pill at ${width}`).toBeTruthy();
    expect(box!.height, `pill height at ${width}`).toBeGreaterThan(48);
    expect(box!.height, `pill height at ${width}`).toBeLessThan(76);
    const rows = await pill.evaluate((el) => {
      const tops = new Set([...el.querySelectorAll(".seg-btn")].map((button) => Math.round(button.getBoundingClientRect().top)));
      return tops.size;
    });
    expect(rows, `rows at ${width}`).toBe(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "guest-tabs-phone");
  await page.setViewportSize({ width: 1280, height: 800 });
  await shot(page, "guest-tabs-desktop");
});

test("retake and try another each open a new camera frame", async ({ page }, testInfo) => {
  test.skip(!["iphone", "desktop"].includes(testInfo.project.name));
  const device = testInfo.project.name === "desktop" ? "desktop" : "phone";
  await page.addInitScript(() => {
    let calls = 0;
    const getUserMedia = async () => {
      calls += 1;
      const hue = calls % 2 === 1 ? 210 : 24;
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      let raf = 0;
      const draw = () => {
        if (!ctx) return;
        ctx.fillStyle = `hsl(${hue} 78% 48%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        raf = requestAnimationFrame(draw);
      };
      draw();
      const stream = canvas.captureStream(15);
      const [track] = stream.getVideoTracks();
      if (track) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          cancelAnimationFrame(raf);
          stop();
        };
      }
      return stream;
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  });

  await page.goto("/s/demo-salon");
  await shot(page, `guest-header-${device}`);
  await page.getByRole("button", { name: "Take selfie" }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await waitForLiveFrame(page);
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  const first = await sampleStill(page);
  await expect(page.locator('input[data-photo="gallery"]')).toHaveValue("");
  await expect(page.locator('input[data-photo="camera"]')).toHaveValue("");
  await shot(page, `retake-before-${device}`);

  await page.getByRole("button", { name: "Retake" }).click();
  await expect(page.getByRole("button", { name: "Retake" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await waitForLiveFrame(page);
  await shot(page, `retake-camera-${device}`);
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  const second = await sampleStill(page);
  const distance = Math.abs(first[0] - second[0]) + Math.abs(first[2] - second[2]);
  expect(distance).toBeGreaterThan(40);

  await page.getByRole("checkbox", { name: /photo is used only/i }).check();
  await page.getByRole("region", { name: "Styles" }).getByRole("button", { name: "Soft Bob" }).click();
  await page.getByRole("button", { name: "Try this look" }).click();
  await expect(page.getByRole("heading", { name: "Soft Bob" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Try another" }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await waitForLiveFrame(page);
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  const third = await sampleStill(page);
  expect(Math.abs(second[0] - third[0]) + Math.abs(second[2] - third[2])).toBeGreaterThan(40);
});

test("staff cannot change salon settings or open the platform admin", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.goto("/login");
  await expect(page.locator("form").first()).toHaveAttribute("data-ready", "yes");
  await page.getByLabel("Email").fill("staff@demo.helixstac.app");
  await page.getByLabel("Password").fill("DemoStaff#2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin/);
  await page.goto("/admin/settings");
  await expect(page.getByText(/Brand and billing stay with the owner/i)).toBeVisible();
  const status = await page.evaluate(async () => {
    const res = await fetch("/api/v1/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Staff Hijack" }),
    });
    return res.status;
  });
  expect(status).toBe(403);
  await page.goto("/super");
  await expect(page).toHaveURL(/\/login/);
});

test("an owner can replace the salon logo and restore the Lookuvi mark", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  process.env.DATABASE_URL ||= "file:./dev.db";
  const prisma = new (await import("@prisma/client")).PrismaClient();
  const before = await prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-salon" }, select: { logoUrl: true } });
  try {
    await page.goto("/login");
    await expect(page.locator("form").first()).toHaveAttribute("data-ready", "yes");
    await page.getByLabel("Email").fill("owner@demo.helixstac.app");
    await page.getByLabel("Password").fill("DemoSalon#2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/admin/);
    await page.goto("/admin/settings");
    await page.getByLabel("Salon logo").setInputFiles("public/brand/lookuvi-app-icon.png");
    await expect(page.locator("form img")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await page.goto("/s/demo-salon");
    await expect(page.locator("header img")).toHaveAttribute("src", /^data:image\/jpeg/);
    await page.goto("/admin/settings");
    await page.getByRole("button", { name: "Use Lookuvi mark" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await page.goto("/s/demo-salon");
    await expect(page.locator('header svg[viewBox="0 0 120 176"]')).toBeVisible();
    await expect(page.locator("header img")).toHaveCount(0);
  } finally {
    await prisma.tenant.update({ where: { slug: "demo-salon" }, data: { logoUrl: before.logoUrl } });
    await prisma.$disconnect();
  }
});
