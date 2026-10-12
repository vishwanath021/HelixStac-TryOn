import { compare } from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as inviteStaff } from "@/app/api/v1/admin/team/route";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

import { auth } from "@/auth";

const createdTenants: string[] = [];
const createdUsers: string[] = [];

function tag() {
  return Math.random().toString(36).slice(2, 10);
}

async function salonOwner(label: string) {
  const tenant = await prisma.tenant.create({
    data: { slug: `${label}-${tag()}`, name: label, plan: "PRO" },
  });
  createdTenants.push(tenant.id);
  const owner = await prisma.user.create({
    data: { email: `${label}-${tag()}@example.test`, name: `${label} owner`, passwordHash: "owner-hash" },
  });
  createdUsers.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tenant.id, role: "OWNER" } });
  vi.mocked(auth).mockResolvedValue({
    user: { id: owner.id, email: owner.email, isSuperAdmin: false, tenantId: tenant.id, role: "OWNER" },
    expires: "2099-01-01T00:00:00.000Z",
  });
  return { tenant, owner };
}

function invite(body: Record<string, string>) {
  return inviteStaff(
    new Request("http://localhost/api/v1/admin/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(async () => {
  if (createdTenants.length) {
    await prisma.membership.deleteMany({ where: { tenantId: { in: createdTenants } } });
    await prisma.domain.deleteMany({ where: { tenantId: { in: createdTenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenants } } });
    createdTenants.length = 0;
  }
  if (createdUsers.length) {
    await prisma.membership.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    createdUsers.length = 0;
  }
});

describe("team invite", () => {
  it("adds an existing user without changing their password, name, or owner role", async () => {
    const { tenant } = await salonOwner("invite-a");
    const victim = await prisma.user.create({
      data: { email: `victim-${tag()}@example.test`, name: "Original Name", passwordHash: "original-hash" },
    });
    createdUsers.push(victim.id);
    const other = await prisma.tenant.create({ data: { slug: `other-${tag()}`, name: "Other", plan: "PRO" } });
    createdTenants.push(other.id);
    await prisma.membership.create({ data: { userId: victim.id, tenantId: other.id, role: "OWNER" } });

    const res = await invite({ email: victim.email, name: "Taken Over", password: "AttackerPassword#1" });
    expect(res.status).toBe(200);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(fresh.name).toBe("Original Name");
    expect(fresh.passwordHash).toBe("original-hash");
    const here = await prisma.membership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: victim.id, tenantId: tenant.id } },
    });
    expect(here.role).toBe("STAFF");
    const there = await prisma.membership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: victim.id, tenantId: other.id } },
    });
    expect(there.role).toBe("OWNER");
  });

  it("does not demote a co-owner of this salon", async () => {
    const { tenant } = await salonOwner("invite-b");
    const coOwner = await prisma.user.create({
      data: { email: `co-${tag()}@example.test`, name: "Co Owner", passwordHash: "co-hash" },
    });
    createdUsers.push(coOwner.id);
    await prisma.membership.create({ data: { userId: coOwner.id, tenantId: tenant.id, role: "OWNER" } });
    const res = await invite({ email: coOwner.email, name: "Demoted", password: "AttackerPassword#1" });
    expect(res.status).toBe(200);
    const membership = await prisma.membership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: coOwner.id, tenantId: tenant.id } },
    });
    expect(membership.role).toBe("OWNER");
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: coOwner.id } });
    expect(fresh.name).toBe("Co Owner");
    expect(fresh.passwordHash).toBe("co-hash");
  });

  it("refuses a super-admin email", async () => {
    await salonOwner("invite-c");
    const admin = await prisma.user.create({
      data: { email: `super-${tag()}@example.test`, name: "Platform", passwordHash: "super-hash", isSuperAdmin: true },
    });
    createdUsers.push(admin.id);
    const res = await invite({ email: admin.email, name: "Staff", password: "AttackerPassword#1" });
    expect(res.status).toBe(403);
    expect(await prisma.membership.count({ where: { userId: admin.id } })).toBe(0);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(fresh.passwordHash).toBe("super-hash");
  });

  it("creates a new user with the 12-character rule and bcrypt cost 12", async () => {
    const { tenant } = await salonOwner("invite-d");
    const weak = await invite({ email: `new-${tag()}@example.test`, name: "New Staff", password: "12345678" });
    expect(weak.status).toBe(400);
    const email = `new-${tag()}@example.test`;
    const created = await invite({ email, name: "New Staff", password: "StaffLogin#2026" });
    expect(created.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdUsers.push(user.id);
    expect(user.passwordHash.startsWith("$2")).toBe(true);
    expect(user.passwordHash.split("$")[2]?.startsWith("12")).toBe(true);
    expect(await compare("StaffLogin#2026", user.passwordHash)).toBe(true);
    const membership = await prisma.membership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    });
    expect(membership.role).toBe("STAFF");
  });
});
