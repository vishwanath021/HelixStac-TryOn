import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

import { POST as generate } from "@/app/api/v1/tryon/generate/route";
import { STYLES } from "@/data/styles";
import { sortLeads } from "@/lib/leads";
import { prisma } from "@/lib/prisma";
import { ensureCatalogueStyles, styleEnabledForTenant, styleOnMenu } from "@/lib/style-menu";
import { buildBridalTrialText } from "@/lib/whatsapp";

describe("catalogue styles stay on the menu", () => {
  const slug = `style-menu-${Date.now()}`;
  afterEach(async () => {
    await prisma.tenant.deleteMany({ where: { slug } });
  });

  it("treats a missing row as enabled and a saved row as the owner's choice", () => {
    expect(styleOnMenu(undefined)).toBe(true);
    expect(styleOnMenu(null)).toBe(true);
    expect(styleOnMenu({ enabled: true })).toBe(true);
    expect(styleOnMenu({ enabled: false })).toBe(false);
  });

  it("enables a new catalogue style for an existing salon and writes the row", async () => {
    const tenant = await prisma.tenant.create({ data: { slug, name: "Menu salon", productTryOn: true } });
    await prisma.tenantStyle.create({ data: { tenantId: tenant.id, styleId: "soft-bob", enabled: false, serviceIds: "[]" } });
    expect(await styleEnabledForTenant(tenant.id, "jasmine-bridal-braid")).toBe(true);
    expect(await styleEnabledForTenant(tenant.id, "soft-bob")).toBe(false);
    const created = await prisma.tenantStyle.findUnique({ where: { tenantId_styleId: { tenantId: tenant.id, styleId: "jasmine-bridal-braid" } } });
    expect(created?.enabled).toBe(true);
    expect(await ensureCatalogueStyles(tenant.id)).toBe(STYLES.length - 2);
    expect(await ensureCatalogueStyles(tenant.id)).toBe(0);
    const off = await prisma.tenantStyle.findUnique({ where: { tenantId_styleId: { tenantId: tenant.id, styleId: "soft-bob" } } });
    expect(off?.enabled).toBe(false);
  });

  it("does not tell the guest a new style is missing from the menu", async () => {
    const tenant = await prisma.tenant.create({ data: { slug, name: "Menu salon", productTryOn: true, creditBalance: 0 } });
    const form = new FormData();
    form.set("slug", tenant.slug);
    form.set("styleId", "jasmine-bridal-braid");
    form.set("sessionId", "session-12");
    form.set("tool", "style");
    form.set("photo", new File([Uint8Array.from([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" }));
    const res = await generate(new Request("http://localhost/api/v1/tryon/generate", { method: "POST", body: form }));
    const body = await res.json();
    expect(body.error).not.toBe("STYLE");
    expect(String(body.message || "")).not.toContain("not on this salon's menu");
    const row = await prisma.tenantStyle.findUnique({ where: { tenantId_styleId: { tenantId: tenant.id, styleId: "jasmine-bridal-braid" } } });
    expect(row?.enabled).toBe(true);
  });
});

describe("bridal leads", () => {
  it("puts the soonest bridal date first", () => {
    const leads = sortLeads([
      { type: "LOOK", eventDate: "", createdAt: new Date("2026-10-02") },
      { type: "BRIDAL", eventDate: "2026-12-20", createdAt: new Date("2026-10-01") },
      { type: "BRIDAL", eventDate: "2026-11-02", createdAt: new Date("2026-09-01") },
    ]);
    expect(leads.map((lead) => lead.eventDate)).toEqual(["2026-11-02", "2026-12-20", ""]);
  });

  it("writes a short trial message with the looks and the signed link", () => {
    const text = buildBridalTrialText({
      name: "Lakshmi",
      eventLabel: "Wedding",
      eventDate: "2026-12-20",
      looks: ["Telugu Muhurtham Classic"],
      urls: ["https://127.0.0.1:3000/api/v1/media?key=generations/a/b/result.jpg&exp=1&sig=abc"],
    });
    expect(text).toContain("Lakshmi");
    expect(text).toContain("bridal trial");
    expect(text).toContain("Wedding");
    expect(text).toContain("2026-12-20");
    expect(text).toContain("Telugu Muhurtham Classic");
    expect(text).toContain("/api/v1/media");
  });
});
