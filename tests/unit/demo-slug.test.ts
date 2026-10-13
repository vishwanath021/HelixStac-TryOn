import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotFound from "@/app/not-found";
import { demoSalonPath, demoSlug } from "@/lib/demo-slug";

function withDemoSlug(value: string | undefined, run: () => void) {
  const previous = process.env.DEMO_SLUG;
  if (value === undefined) delete process.env.DEMO_SLUG;
  else process.env.DEMO_SLUG = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.DEMO_SLUG;
    else process.env.DEMO_SLUG = previous;
  }
}

describe("demo salon slug", () => {
  it("defaults to the seeded production slug", () => {
    withDemoSlug(undefined, () => {
      expect(demoSlug()).toBe("demo");
      expect(demoSalonPath()).toBe("/s/demo");
    });
  });

  it("follows DEMO_SLUG and rejects a path that is not a slug", () => {
    withDemoSlug("  Custom-Demo  ", () => {
      expect(demoSlug()).toBe("custom-demo");
      expect(demoSalonPath()).toBe("/s/custom-demo");
    });
    withDemoSlug("../admin", () => {
      expect(demoSlug()).toBe("demo");
      expect(demoSalonPath()).toBe("/s/demo");
    });
  });

  it("points the Demo salon button at the same slug the seed writes", () => {
    withDemoSlug(undefined, () => {
      const html = renderToStaticMarkup(createElement(NotFound));
      expect(html).toContain("Demo salon");
      expect(html).toContain(`href="${demoSalonPath()}"`);
      expect(html).toContain('href="/s/demo"');
      expect(html).not.toContain("demo-salon");
    });
    const seed = readFileSync("prisma/seed.ts", "utf8");
    expect(seed).toContain("demoSlug()");
    expect(seed).not.toContain('slug: "demo-salon"');
    expect(seed).not.toContain('slug: "demo"');
  });
});
