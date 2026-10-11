import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const DEMO = new Set(["DemoSalon#2026", "DemoStaff#2026", "SuperAdmin#2026"]);
const email = (process.env.SUPER_ADMIN_EMAIL || "").toLowerCase().trim();
const password = process.env.SUPER_ADMIN_PASSWORD || "";

if (!email.includes("@") || password.length < 12 || DEMO.has(password)) {
  console.error("Set SUPER_ADMIN_EMAIL and a SUPER_ADMIN_PASSWORD of at least 12 characters. Do not reuse a demo password.");
  process.exit(1);
}

const prisma = new PrismaClient();
const passwordHash = await hash(password, 12);
await prisma.user.upsert({
  where: { email },
  update: { passwordHash, isSuperAdmin: true, name: "Lookuvi Admin" },
  create: { email, name: "Lookuvi Admin", passwordHash, isSuperAdmin: true },
});
console.log(`Super-admin ready for ${email}`);
await prisma.$disconnect();
