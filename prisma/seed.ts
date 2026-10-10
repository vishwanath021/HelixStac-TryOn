import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { SHADES } from "../src/data/shades";
import { STYLES } from "../src/data/styles";
import { PLANS, TRIAL_DAYS } from "../src/data/plans";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "DemoSalon#2026";
const STAFF_PASSWORD = "DemoStaff#2026";
const SUPER_PASSWORD = "SuperAdmin#2026";

async function main() {
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-salon" },
    update: {
      creditBalance: PLANS.PRO.credits,
      status: "TRIAL",
      plan: "PRO",
      trialEndsAt: trialEnds,
      toolColour: true,
      toolStyle: true,
      toolBrows: true,
      toolBeard: true,
      toolNails: true,
      anonDailyCap: 8,
      memberDailyCap: 30,
      requireLoginToBook: false,
    },
    create: {
      slug: "demo-salon",
      name: "Demo Salon – Bengaluru",
      logoUrl: "/brand/lookuvi-mark.svg",
      primaryColor: "#69517D",
      accentColor: "#B6A0C9",
      languages: JSON.stringify(["en", "hi", "kn", "ta", "te", "mr"]),
      defaultLang: "en",
      whatsapp: "919800011122",
      address: "12, 4th Main, Indiranagar, Bengaluru 560038",
      mapsUrl: "https://maps.google.com/?q=Indiranagar+Bengaluru",
      city: "Bengaluru",
      plan: "PRO",
      status: "TRIAL",
      trialEndsAt: trialEnds,
      creditBalance: PLANS.PRO.credits,
      dailyCap: PLANS.PRO.credits,
      removeBranding: false,
      onboardingDone: true,
      showMen: true,
      showWomen: true,
      showKids: true,
      toolColour: true,
      toolStyle: true,
      toolBrows: true,
      toolBeard: true,
      toolNails: true,
      anonDailyCap: 8,
      memberDailyCap: 30,
      requireLoginToBook: false,
    },
  });

  const inheritedLogo = !tenant.logoUrl || tenant.logoUrl === "/brand/demo-mark.svg" || tenant.logoUrl === "/brand/mark.svg";
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      primaryColor: "#69517D",
      accentColor: "#B6A0C9",
      ...(inheritedLogo ? { logoUrl: "/brand/lookuvi-mark.svg" } : {}),
    },
  });

  const services = [
    { key: "haircut", name: "Haircut", priceInr: 499, durationMin: 45 },
    { key: "colour", name: "Hair Colour", priceInr: 2499, durationMin: 90 },
    { key: "balayage", name: "Balayage", priceInr: 4500, durationMin: 150 },
    { key: "highlights", name: "Highlights", priceInr: 3500, durationMin: 120 },
    { key: "styling", name: "Styling", priceInr: 799, durationMin: 30 },
    { key: "keratin", name: "Keratin", priceInr: 5999, durationMin: 180 },
    { key: "beard", name: "Beard Trim", priceInr: 299, durationMin: 20 },
    { key: "kids", name: "Kids Cut", priceInr: 349, durationMin: 30 },
    { key: "eyebrow-threading", name: "Eyebrow Threading", priceInr: 149, durationMin: 15 },
    { key: "eyebrow-shaping", name: "Eyebrow Shaping", priceInr: 249, durationMin: 20 },
    { key: "nails", name: "Nail Art", priceInr: 599, durationMin: 45 },
  ];
  for (const service of services) {
    await prisma.service.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: service.key } },
      update: service,
      create: { ...service, tenantId: tenant.id, nameI18n: "{}" },
    });
  }

  for (const style of STYLES) {
    await prisma.tenantStyle.upsert({
      where: { tenantId_styleId: { tenantId: tenant.id, styleId: style.id } },
      update: { enabled: true },
      create: { tenantId: tenant.id, styleId: style.id, enabled: true, serviceIds: "[]" },
    });
  }
  for (const shade of SHADES) {
    await prisma.tenantShade.upsert({
      where: { tenantId_shadeId: { tenantId: tenant.id, shadeId: shade.id } },
      update: { enabled: true },
      create: { tenantId: tenant.id, shadeId: shade.id, enabled: true, serviceIds: "[]" },
    });
  }

  await prisma.outlet.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.outlet.create({
    data: {
      tenantId: tenant.id,
      name: "Indiranagar",
      whatsapp: "919800011122",
      address: "12, 4th Main, Indiranagar, Bengaluru 560038",
      mapsUrl: "https://maps.google.com/?q=Indiranagar+Bengaluru",
      isPrimary: true,
    },
  });

  const ownerHash = await hash(DEMO_PASSWORD, 10);
  const staffHash = await hash(STAFF_PASSWORD, 10);
  const superHash = await hash(SUPER_PASSWORD, 10);
  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.helixstac.app" },
    update: { passwordHash: ownerHash, name: "Demo Owner" },
    create: { email: "owner@demo.helixstac.app", name: "Demo Owner", passwordHash: ownerHash },
  });
  const staff = await prisma.user.upsert({
    where: { email: "staff@demo.helixstac.app" },
    update: { passwordHash: staffHash, name: "Demo Staff" },
    create: { email: "staff@demo.helixstac.app", name: "Demo Staff", passwordHash: staffHash },
  });
  const superAdmin = await prisma.user.upsert({
    where: { email: "super@helixstac.app" },
    update: { passwordHash: superHash, name: "Lookuvi Admin", isSuperAdmin: true },
    create: { email: "super@helixstac.app", name: "Lookuvi Admin", passwordHash: superHash, isSuperAdmin: true },
  });
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: owner.id, tenantId: tenant.id } },
    update: { role: "OWNER" },
    create: { userId: owner.id, tenantId: tenant.id, role: "OWNER" },
  });
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: staff.id, tenantId: tenant.id } },
    update: { role: "STAFF" },
    create: { userId: staff.id, tenantId: tenant.id, role: "STAFF" },
  });

  const grant = await prisma.creditLedger.findFirst({ where: { tenantId: tenant.id, reason: "PLAN_GRANT" } });
  if (!grant) {
    await prisma.creditLedger.create({
      data: {
        tenantId: tenant.id,
        delta: PLANS.PRO.credits,
        reason: "TRIAL_GRANT",
        balanceAfter: PLANS.PRO.credits,
        refId: "seed",
      },
    });
  }

  console.log(`Seeded ${tenant.name}`);
  console.log("  Public:  /s/demo-salon");
  console.log(`  Owner:   owner@demo.helixstac.app  /  ${DEMO_PASSWORD}`);
  console.log(`  Staff:   staff@demo.helixstac.app  /  ${STAFF_PASSWORD}`);
  console.log(`  Super:   super@helixstac.app  /  ${SUPER_PASSWORD}`);
  console.log("  These are demo logins for a local database, not production secrets.");
  void superAdmin;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
