import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as generate } from "@/app/api/v1/tryon/generate/route";
import { ownerFeatures, ownerNav } from "@/lib/features";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
}));

const off = {
  role: "OWNER",
  slug: "demo",
  productTryOn: true,
  productQueue: false,
  features: ownerFeatures({}),
};

describe("owner feature flags", () => {
  it("defaults every owner extra off", () => {
    expect(ownerFeatures({})).toEqual({
      bookings: false,
      salonAi: false,
      outlets: false,
      customDomain: false,
      embed: false,
      concierge: false,
      guide: false,
      guestHub: false,
    });
    const labels = ownerNav(off).map((link) => link.label);
    expect(labels).not.toContain("Bookings");
    expect(labels).not.toContain("AI settings");
    expect(labels).not.toContain("Queue");
    expect(labels).toContain("Styles");
    expect(labels).toContain("QR");
    expect(labels).not.toContain("QR and embed");
    expect(ownerNav(off).filter((link) => link.section === "more").map((link) => link.label)).toEqual([
      "Settings",
      "Team",
      "Billing",
      "Security",
    ]);
  });

  it("shows queue only when that product is on, and hides try-on pages when it is off", () => {
    const queued = ownerNav({ ...off, productTryOn: false, productQueue: true });
    const labels = queued.map((link) => link.label);
    expect(labels).toContain("Queue");
    expect(labels).not.toContain("Styles");
    expect(labels).not.toContain("View try-on");
    expect(labels).not.toContain("QR and embed");
  });
});

describe("try-on product switch", () => {
  afterEach(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: "product-off-" } } });
  });

  it("refuses a preview when AI try-on is off for the salon", async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `product-off-${Date.now()}`, name: "Queue only", productTryOn: false },
    });
    const form = new FormData();
    form.set("slug", tenant.slug);
    form.set("styleId", "pixie");
    form.set("sessionId", "session-12");
    form.set("tool", "style");
    form.set("photo", new File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" }));
    const res = await generate(new Request("http://localhost/api/v1/tryon/generate", { method: "POST", body: form }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("PRODUCT");
    expect(await prisma.tryOn.count({ where: { tenantId: tenant.id } })).toBe(0);
  });
});
