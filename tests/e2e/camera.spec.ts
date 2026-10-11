import { expect, test, type Page } from "@playwright/test";

type CameraSpy = {
  calls: number;
  stops: number;
  enumerated: boolean;
  permissions: boolean;
  constraints: Array<{ video?: { facingMode?: unknown } }>;
};

async function spyOnCamera(page: Page) {
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    const state: CameraSpy = { calls: 0, stops: 0, enumerated: false, permissions: false, constraints: [] };
    (window as unknown as { __cam: CameraSpy }).__cam = state;
    const orig = devices.getUserMedia.bind(devices);
    devices.getUserMedia = (constraints) => {
      state.calls += 1;
      state.constraints.push(constraints as CameraSpy["constraints"][number]);
      return orig(constraints).then((stream) => {
        for (const track of stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            state.stops += 1;
            stop();
          };
        }
        return stream;
      });
    };
    if (devices.enumerateDevices) {
      const origEnum = devices.enumerateDevices.bind(devices);
      devices.enumerateDevices = () => {
        state.enumerated = true;
        return origEnum();
      };
    }
    if (navigator.permissions?.query) {
      const origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (desc) => {
        state.permissions = true;
        return origQuery(desc);
      };
    }
  });
}

async function cameraSpy(page: Page) {
  return page.evaluate(() => (window as unknown as { __cam: CameraSpy }).__cam);
}

async function liveVideo(page: Page) {
  return page.locator("video").evaluate((node) => {
    const video = node as HTMLVideoElement;
    return {
      paused: video.paused,
      muted: video.muted,
      playsInline: video.playsInline,
      autoplay: video.autoplay,
      hasSrc: Boolean(video.srcObject),
      width: video.videoWidth,
      ready: video.readyState,
    };
  });
}

test("take selfie plays the fake camera, captures, and retakes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Chromium fake camera on desktop");
  await spyOnCamera(page);
  await page.goto("/s/demo-salon");
  await expect(page.getByRole("button", { name: "Take selfie" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use the phone camera" })).toHaveCount(0);
  await expect(page.getByText(/camera is not available/i)).toHaveCount(0);
  await expect(page.getByText(/permission was denied/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Take selfie" }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await expect(page.getByText(/camera is not available/i)).toHaveCount(0);
  const playing = await liveVideo(page);
  expect(playing.paused).toBe(false);
  expect(playing.muted).toBe(true);
  expect(playing.playsInline).toBe(true);
  expect(playing.autoplay).toBe(true);
  expect(playing.hasSrc).toBe(true);
  expect(playing.width).toBeGreaterThan(10);
  expect(playing.ready).toBeGreaterThanOrEqual(2);
  const opened = await cameraSpy(page);
  expect(opened.calls).toBe(1);
  expect(opened.constraints[0]?.video?.facingMode).toBe("user");
  expect(opened.enumerated).toBe(false);
  expect(opened.permissions).toBe(false);

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Take selfie" })).toBeVisible();
  await expect(page.getByText(/camera is not available/i)).toHaveCount(0);
  await page.waitForFunction(() => !document.querySelector("video")?.srcObject);
  const closed = await cameraSpy(page);
  expect(closed.stops).toBeGreaterThanOrEqual(1);

  await page.getByRole("button", { name: "Take selfie" }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await expect(page.getByText(/camera is not available/i)).toHaveCount(0);

  const stopsBeforeRetake = (await cameraSpy(page)).stops;
  await page.getByRole("button", { name: "Retake" }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
  await expect(page.getByText(/camera is not available/i)).toHaveCount(0);
  const again = await liveVideo(page);
  expect(again.paused).toBe(false);
  expect(again.hasSrc).toBe(true);
  expect(again.width).toBeGreaterThan(10);
  const retaken = await cameraSpy(page);
  expect(retaken.calls).toBe(3);
  expect(retaken.stops).toBeGreaterThan(stopsBeforeRetake);
  expect(retaken.enumerated).toBe(false);
  expect(retaken.permissions).toBe(false);

  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await expect(page.getByText(/camera is not available/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use the phone camera" })).toHaveCount(0);
});

test("denied camera tells the user how to allow it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Chromium permission stub on desktop");
  const logs: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") logs.push(message.text());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" })),
      },
    });
  });
  await page.goto("/s/demo-salon");
  await expect(page.getByText(/permission was denied/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Take selfie" }).click();
  await expect(page.getByRole("alert")).toHaveText(/Camera permission was denied\. Allow the camera for this site from the address bar/i);
  await expect(page.getByRole("button", { name: "Use the phone camera" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take photo" })).toHaveCount(0);
  await expect.poll(() => logs.some((line) => line.includes("[camera]") && line.includes("NotAllowedError"))).toBe(true);
});
