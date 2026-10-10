import { expect, test, type Page } from "@playwright/test";

async function usePhoto(page: Page, file: string) {
  await page.locator('input[data-photo="gallery"]').setInputFiles(file);
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
}

async function look(page: Page, tab: string, region: string, name: string, posts: { count: number }) {
  await page.getByRole("tab", { name: tab }).click();
  const before = posts.count;
  await page.getByRole("region", { name: region }).getByRole("button", { name }).click();
  await expect.poll(() => posts.count).toBe(before);
  await expect(page.getByText(/Too many/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Try this look" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 20_000 });
  const slider = page.getByRole("slider", { name: /BEFORE \/ AFTER/i });
  await expect(slider).toBeVisible();
  await slider.fill("28");
  await expect(slider).toHaveValue("28");
  await page.getByRole("button", { name: "Try another" }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
}

test("style, colour, brows, beard, and nails preview on this screen", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const posts = { count: 0 };
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/v1/tryon/generate")) posts.count += 1;
  });

  await page.goto("/s/demo-salon");
  await expect(page.getByRole("tab")).toHaveCount(5);
  await usePhoto(page, "public/samples/portrait.jpg");
  await page.getByRole("checkbox", { name: /photo is used only/i }).check();

  await look(page, "Hair style", "Styles", "Soft Bob", posts);
  await usePhoto(page, "public/samples/portrait.jpg");
  await page.getByRole("tab", { name: "Hair colour" }).click();
  const beforeColour = posts.count;
  await page.getByRole("button", { name: "Cherry Red" }).click();
  await expect(page.getByRole("region", { name: "Photo" }).locator("canvas")).toHaveAttribute("aria-label", "Cherry Red");
  const intensity = page.getByRole("slider").last();
  await intensity.fill("40");
  await expect(intensity).toHaveValue("40");
  await page.getByRole("button", { name: "Honey Blonde" }).click();
  await expect(page.getByRole("region", { name: "Photo" }).locator("canvas")).toHaveAttribute("aria-label", "Honey Blonde");
  expect(posts.count).toBe(beforeColour);
  await expect(page.getByText(/Too many/i)).toHaveCount(0);

  await look(page, "Brows", "Brows", "Soft Arch", posts);
  await usePhoto(page, "public/samples/portrait.jpg");
  await look(page, "Beard", "Beards", "Short Boxed", posts);
  await page.getByRole("tab", { name: "Nails" }).click();
  await usePhoto(page, "tests/fixtures/hand.jpg");
  await look(page, "Nails", "Nails", "Classic French", posts);

  expect(posts.count).toBe(4);
  expect(testInfo.project.name).toMatch(/android|iphone|desktop|tablet/);
});
