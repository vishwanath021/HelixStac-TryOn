import { describe, expect, it, vi, afterEach } from "vitest";
import { auth } from "@/auth";
import { GET } from "@/app/api/v1/super/audit/route";
import { POST as createLead } from "@/app/api/v1/leads/route";
import { logGenerateEvent } from "@/lib/ai/guest-hairstyle";
import { grantCredits } from "@/lib/credits";
import { loadSalons } from "@/lib/super/directory";
import { appMediaUrl } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
}));

describe("super audit and salon usage", () => {
  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { target: { startsWith: "test-audit-" } } });
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: "audit-salon-" } } });
  });

  it("returns 403 unless the caller is a super-admin", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const guest = await GET(new Request("http://localhost/api/v1/super/audit"));
    expect(guest.status).toBe(403);
    vi.mocked(auth).mockResolvedValue({ user: { id: "owner", isSuperAdmin: false, email: "owner@demo.agenticbuildworks.com" }, expires: "2099-01-01T00:00:00.000Z" });
    const owner = await GET(new Request("http://localhost/api/v1/super/audit"));
    expect(owner.status).toBe(403);
  });

  it("lists audit rows and filters by action", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "super", isSuperAdmin: true, email: "super@agenticbuildworks.com" }, expires: "2099-01-01T00:00:00.000Z" });
    await prisma.auditLog.create({ data: { actorId: "super", action: "CREDIT_ADJUST", target: "test-audit-1", meta: "{\"note\":\"goodwill\"}" } });
    await prisma.auditLog.create({ data: { actorId: "super", action: "TENANT_UPDATE", target: "test-audit-2", meta: "{}" } });
    const all = await GET(new Request("http://localhost/api/v1/super/audit"));
    expect(all.status).toBe(200);
    const body = await all.json();
    expect(body.items.some((row: { target: string }) => row.target === "test-audit-1")).toBe(true);
    expect(body.pageSize).toBe(20);
    const filtered = await GET(new Request("http://localhost/api/v1/super/audit?action=CREDIT_ADJUST"));
    const filteredBody = await filtered.json();
    expect(filteredBody.items.every((row: { action: string }) => row.action === "CREDIT_ADJUST")).toBe(true);
    expect(filteredBody.items.some((row: { target: string }) => row.target === "test-audit-1")).toBe(true);
    expect(filteredBody.items.some((row: { target: string }) => row.target === "test-audit-2")).toBe(false);
  });

  it("counts succeeded previews this month from one grouped query", async () => {
    const tenant = await prisma.tenant.create({ data: { slug: `audit-salon-${Date.now()}`, name: "Audit salon" } });
    await prisma.tryOn.create({ data: { tenantId: tenant.id, sessionId: `month-${tenant.id}`, kind: "style", status: "SUCCEEDED" } });
    await prisma.tryOn.create({ data: { tenantId: tenant.id, sessionId: `month-fail-${tenant.id}`, kind: "style", status: "FAILED" } });
    await prisma.tryOn.create({ data: { tenantId: tenant.id, sessionId: `month-demo-${tenant.id}`, kind: "style", status: "DEMO" } });
    await prisma.tryOn.create({
      data: {
        tenantId: tenant.id,
        sessionId: `month-old-${tenant.id}`,
        kind: "style",
        status: "SUCCEEDED",
        createdAt: new Date("2020-01-15T00:00:00.000Z"),
      },
    });
    const row = (await loadSalons()).find((item) => item.id === tenant.id);
    expect(row?.previewsThisMonth).toBe(1);
    expect(row?.tryOns).toBe(2);
  });

  it("stores the adjustment note on the credit ledger", async () => {
    const tenant = await prisma.tenant.create({ data: { slug: `audit-salon-note-${Date.now()}`, name: "Note salon", creditBalance: 0 } });
    const balance = await grantCredits(tenant.id, 50, "ADJUSTMENT", "super", "goodwill");
    expect(balance).toBe(50);
    const row = await prisma.creditLedger.findFirst({ where: { tenantId: tenant.id, reason: "ADJUSTMENT" } });
    expect(row?.note).toBe("goodwill");
    expect(row?.delta).toBe(50);
  });

  it("logs a generate event for every real preview", async () => {
    const tenant = await prisma.tenant.create({ data: { slug: `audit-salon-gen-${Date.now()}`, name: "Generate salon" } });
    await logGenerateEvent({ tenantId: tenant.id, sessionId: "session-1", styleId: "soft-bob", tool: "style", tryOnId: "try-1" });
    await logGenerateEvent({ tenantId: tenant.id, sessionId: "session-1", styleId: "wolf-cut", tool: "style", tryOnId: "try-2" });
    const rows = await prisma.usageEvent.findMany({ where: { tenantId: tenant.id, name: "generate" }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => JSON.parse(row.props).styleId)).toEqual(["soft-bob", "wolf-cut"]);
  });
});

describe("book this look", () => {
  afterEach(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: "lead-salon-" } } });
  });

  it("does not create a lead when the salon has no WhatsApp number", async () => {
    const slug = `lead-salon-${Date.now()}`;
    await prisma.tenant.create({ data: { slug, name: "No WhatsApp", whatsapp: "" } });
    const res = await createLead(new Request("http://localhost/api/v1/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, sessionId: "session-lead-1", styleId: "soft-arch", tool: "brows" }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("WHATSAPP");
    expect(await prisma.lead.count({ where: { tenant: { slug } } })).toBe(0);
  });

  it("includes a signed look image link when the salon has a number", async () => {
    const slug = `lead-salon-ok-${Date.now()}`;
    await prisma.tenant.create({ data: { slug, name: "Has WhatsApp", whatsapp: "9800011122" } });
    const lookUrl = appMediaUrl("generations/tenant/request/result.jpg", 3600);
    const res = await createLead(new Request("http://localhost/api/v1/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, sessionId: "session-lead-2", styleId: "soft-arch", tool: "brows", lookUrl }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toContain(`Look image: ${lookUrl}`);
    expect(body.whatsappUrl).toContain("919800011122");
    expect(await prisma.lead.count({ where: { tenant: { slug } } })).toBe(1);

    const dropped = await createLead(new Request("http://localhost/api/v1/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        sessionId: "session-lead-3",
        styleId: "soft-arch",
        tool: "brows",
        lookUrl: "https://evil.example/look.jpg",
      }),
    }));
    const droppedBody = await dropped.json();
    expect(droppedBody.text).not.toContain("evil.example");
    expect(droppedBody.text).not.toContain("Look image:");
  });
});
