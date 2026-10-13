import { describe, expect, it, vi, afterEach } from "vitest";
import { auth } from "@/auth";
import { GET } from "@/app/api/v1/super/audit/route";
import { loadSalons } from "@/lib/super/directory";
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
    const rows = await loadSalons();
    expect(rows.find((row) => row.id === tenant.id)?.previewsThisMonth).toBe(1);
  });
});
