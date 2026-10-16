import { expect, type Page } from "@playwright/test";

/** The photo sheet shows once per browser session, before the camera opens. */
export async function agreeIfAsked(page: Page) {
  const agree = page.getByRole("button", { name: "I agree, start" });
  try {
    await agree.waitFor({ state: "visible", timeout: 800 });
    await agree.click();
  } catch {
    /* This session already agreed. */
  }
}

export async function openLive(page: Page, name = "Live styling") {
  await page.getByRole("button", { name, exact: true }).click();
  await agreeIfAsked(page);
}

/** The live camera has its own Retake control. A finished capture is the studio closing. */
export async function waitForCapture(page: Page) {
  await expect(page.locator("[data-studio='live']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
}
