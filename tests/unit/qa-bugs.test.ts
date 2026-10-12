import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compare, hash } from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as caddyAsk } from "@/app/api/caddy/ask/route";
import PrivacyPage from "@/app/privacy/page";
import { SalonPaused } from "@/components/guest/SalonPaused";
import { POST as changePassword } from "@/app/api/v1/account/password/route";
import { POST as saveDomain } from "@/app/api/v1/admin/domain/route";
import { GET as exportLeads } from "@/app/api/v1/admin/leads/export/route";
import { DELETE as removeStaff, POST as inviteStaff } from "@/app/api/v1/admin/team/route";
import { LOCALES, t } from "@/data/i18n";
import { csvCell } from "@/lib/csv";
import { isPlatformHost } from "@/lib/host";
import { prisma } from "@/lib/prisma";
import { sessionIsCurrent } from "@/lib/session-revocation";

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

function removeMember(userId: string) {
  return removeStaff(
    new Request("http://localhost/api/v1/admin/team", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    }),
  );
}

function postDomain(body: Record<string, unknown>) {
  return saveDomain(
    new Request("http://localhost/api/v1/admin/domain", {
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

  it("removes a staff membership only, writes an audit row, and keeps the last owner", async () => {
    const { tenant, owner } = await salonOwner("team-rm");
    const staff = await prisma.user.create({
      data: { email: `staff-${tag()}@example.test`, name: "Staff", passwordHash: "staff-hash" },
    });
    createdUsers.push(staff.id);
    await prisma.membership.create({ data: { userId: staff.id, tenantId: tenant.id, role: "STAFF" } });
    const removed = await removeMember(staff.id);
    expect(removed.status).toBe(200);
    expect(await prisma.membership.findUnique({ where: { userId_tenantId: { userId: staff.id, tenantId: tenant.id } } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: staff.id } })).toBeTruthy();
    const audit = await prisma.auditLog.findFirst({ where: { action: "TEAM_REMOVE", target: staff.id } });
    expect(audit?.actorId).toBe(owner.id);
    await prisma.auditLog.deleteMany({ where: { target: staff.id } });

    const self = await removeMember(owner.id);
    expect(self.status).toBe(400);
    expect(await prisma.membership.findUnique({ where: { userId_tenantId: { userId: owner.id, tenantId: tenant.id } } })).toBeTruthy();
  });
});

describe("custom domains", () => {
  it("treats the app host, the root, and their subdomains as platform hosts", () => {
    const env = { APP_DOMAIN: "https://lookuvi.example.test", ROOT_DOMAIN: "example.test" };
    expect(isPlatformHost("lookuvi.example.test", env)).toBe(true);
    expect(isPlatformHost("example.test", env)).toBe(true);
    expect(isPlatformHost("demo.try.example.test", env)).toBe(true);
    expect(isPlatformHost("www.lookuvi.example.test", env)).toBe(true);
    expect(isPlatformHost("salon.example.com", env)).toBe(false);
  });

  it("refuses another salon's domain and platform hosts, and stores new domains unverified", async () => {
    const previousApp = process.env.APP_DOMAIN;
    const previousRoot = process.env.ROOT_DOMAIN;
    process.env.APP_DOMAIN = "lookuvi.example.test";
    process.env.ROOT_DOMAIN = "example.test";
    try {
      const other = await prisma.tenant.create({ data: { slug: `dom-b-${tag()}`, name: "B", plan: "PRO" } });
      createdTenants.push(other.id);
      const takenHost = `taken-${tag()}.example.com`;
      await prisma.domain.create({ data: { host: takenHost, tenantId: other.id, token: "helix-verify=abc", verified: true } });
      const { tenant } = await salonOwner("dom-a");
      const taken = await postDomain({ host: takenHost });
      expect(taken.status).toBe(409);
      const still = await prisma.domain.findUniqueOrThrow({ where: { host: takenHost } });
      expect(still.tenantId).toBe(other.id);
      expect(still.verified).toBe(true);

      const platform = await postDomain({ host: "demo.try.example.test" });
      expect(platform.status).toBe(400);
      expect(await prisma.domain.findUnique({ where: { host: "demo.try.example.test" } })).toBeNull();

      const freshHost = `fresh-${tag()}.example.com`;
      const created = await postDomain({ host: freshHost });
      expect(created.status).toBe(200);
      const row = await prisma.domain.findUniqueOrThrow({ where: { host: freshHost } });
      expect(row.tenantId).toBe(tenant.id);
      expect(row.verified).toBe(false);
    } finally {
      if (previousApp === undefined) delete process.env.APP_DOMAIN;
      else process.env.APP_DOMAIN = previousApp;
      if (previousRoot === undefined) delete process.env.ROOT_DOMAIN;
      else process.env.ROOT_DOMAIN = previousRoot;
    }
  });
});

describe("session revocation", () => {
  it("treats a missing token version as 0 and rejects a bumped version", () => {
    expect(sessionIsCurrent(undefined, 0)).toBe(true);
    expect(sessionIsCurrent(0, 0)).toBe(true);
    expect(sessionIsCurrent(0, 1)).toBe(false);
    expect(sessionIsCurrent(1, 1)).toBe(true);
  });

  it("bumps sessionVersion when the password changes", async () => {
    const password = "CorrectHorse#1";
    const user = await prisma.user.create({
      data: { email: `pw-${tag()}@example.test`, name: "Password", passwordHash: await hash(password, 12), sessionVersion: 0 },
    });
    createdUsers.push(user.id);
    vi.mocked(auth).mockResolvedValue({
      user: { id: user.id, email: user.email, isSuperAdmin: false },
      expires: "2099-01-01T00:00:00.000Z",
    });
    const res = await changePassword(
      new Request("http://localhost/api/v1/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword: "CorrectHorse#2", confirmPassword: "CorrectHorse#2" }),
      }),
    );
    expect(res.status).toBe(200);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh.sessionVersion).toBe(1);
    expect(await compare("CorrectHorse#2", fresh.passwordHash)).toBe(true);
  });
});

describe("leads csv", () => {
  it("prefixes formula characters and keeps quotes", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+cmd")).toBe("\"'+cmd\"");
    expect(csvCell("-1")).toBe("\"'-1\"");
    expect(csvCell("@sum")).toBe("\"'@sum\"");
    expect(csvCell("\t=1")).toBe("\"'\t=1\"");
    expect(csvCell("\r=1")).toBe("\"'\r=1\"");
    expect(csvCell("Ada")).toBe("\"Ada\"");
    expect(csvCell("say \"hi\"")).toBe("\"say \"\"hi\"\"\"");
  });

  it("exports a formula name as a neutralised cell", async () => {
    const { tenant } = await salonOwner("csv");
    await prisma.lead.create({
      data: { tenantId: tenant.id, name: "=HYPERLINK(\"http://x\")", lookName: "Pixie", phone: "+9198" },
    });
    const res = await exportLeads();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(body).toContain("\"'+9198\"");
    await prisma.lead.deleteMany({ where: { tenantId: tenant.id } });
  });
});

describe("suspended salon", () => {
  it("allows a certificate for an existing suspended salon and shows a paused page", async () => {
    const html = renderToStaticMarkup(createElement(SalonPaused, { name: "QA Salon" }));
    expect(html).toContain("This salon is paused");
    expect(html).toContain("QA Salon");
    const previousApp = process.env.APP_DOMAIN;
    const previousRoot = process.env.ROOT_DOMAIN;
    process.env.APP_DOMAIN = "lookuvi.example.test";
    process.env.ROOT_DOMAIN = "example.test";
    try {
      const slug = `paused-${tag()}`;
      const tenant = await prisma.tenant.create({ data: { slug, name: "Paused Salon", status: "SUSPENDED" } });
      createdTenants.push(tenant.id);
      const paused = await caddyAsk(new Request(`http://localhost/api/caddy/ask?domain=${slug}.try.example.test`));
      expect(paused.status).toBe(200);
      const missing = await caddyAsk(new Request(`http://localhost/api/caddy/ask?domain=missing-${tag()}.try.example.test`));
      expect(missing.status).toBe(404);
    } finally {
      if (previousApp === undefined) delete process.env.APP_DOMAIN;
      else process.env.APP_DOMAIN = previousApp;
      if (previousRoot === undefined) delete process.env.ROOT_DOMAIN;
      else process.env.ROOT_DOMAIN = previousRoot;
    }
  });
});

describe("privacy page", () => {
  it("names the real processors and hides the template note", () => {
    const html = renderToStaticMarkup(createElement(PrivacyPage));
    expect(html).toContain("fal (Black Forest Labs FLUX)");
    expect(html).toContain("OpenAI");
    expect(html).toContain("Hostinger");
    expect(html).toContain("Cloudflare");
    expect(html).toContain("Digital Personal Data Protection Act, 2023");
    expect(html.toLowerCase()).not.toContain("template");
    expect(html.toLowerCase()).not.toContain("lawyer");
    expect(html.toLowerCase()).not.toContain("gemini");
  });
});

describe("consent copy", () => {
  it("names fal and OpenAI in every locale and drops the Gemini demo wording", () => {
    for (const locale of LOCALES) {
      const text = t(locale, "consentProcessor");
      expect(text, locale).toContain("fal");
      expect(text, locale).toContain("Black Forest Labs FLUX");
      expect(text, locale).toContain("OpenAI");
      expect(text.toLowerCase(), locale).not.toContain("gemini");
      expect(text.toLowerCase(), locale).not.toContain("demo renderer");
    }
  });
});
