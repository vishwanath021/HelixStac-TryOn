import { expect, test } from "@playwright/test";

const NAMES = [
  "Soft Arch",
  "High Arch",
  "Straight",
  "Rounded",
  "Feathered",
  "Bold Natural",
  "Flat Thick",
  "Natural Groomed",
  "Thin Defined",
  "Tapered",
  "Clean-up",
];

test("brow cards are distinct diagrams and chips do not generate", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/v1/tryon/generate")) posts.push(request.url());
  });
  await page.goto("/s/demo-salon");
  await page.getByRole("tab", { name: "Brows" }).click();
  const region = page.getByRole("region", { name: "Brows" });
  const photos = await region.locator("img").count();
  expect(photos === 0 || photos === NAMES.length).toBe(true);
  const paths = new Set<string>();
  for (const name of NAMES) {
    const card = region.getByRole("button", { name });
    await expect(card).toBeVisible();
    const d = await card.locator("path").first().getAttribute("d");
    expect(d, name).toBeTruthy();
    paths.add(d || "");
    const box = await card.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  expect(paths.size).toBe(NAMES.length);

  await page.setViewportSize({ width: 320, height: 700 });
  const narrow = await region.getByRole("button", { name: "Soft Arch" }).boundingBox();
  expect(narrow?.width ?? 0).toBeGreaterThanOrEqual(44);

  await region.getByRole("button", { name: "Soft Arch" }).click();
  const thickness = page.getByRole("group", { name: "Brow thickness" });
  const colour = page.getByRole("group", { name: "Brow colour" });
  for (const label of ["Thin", "Natural", "Bold"]) {
    const chip = thickness.getByRole("button", { name: label, exact: true });
    const box = await chip.boundingBox();
    expect(box?.height ?? 0, label).toBeGreaterThanOrEqual(44);
    await chip.click();
  }
  for (const label of ["Natural", "Soft brown", "Dark"]) {
    const chip = colour.getByRole("button", { name: label, exact: true });
    const box = await chip.boundingBox();
    expect(box?.height ?? 0, label).toBeGreaterThanOrEqual(44);
    await chip.click();
  }
  expect(posts).toEqual([]);
  await expect(page.getByRole("button", { name: "Try this look" })).toBeVisible();
});
