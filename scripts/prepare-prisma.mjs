import fs from "node:fs";

const schemaPath = new URL("../prisma/schema.prisma", import.meta.url);
const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
const provider = url.startsWith("file:") || url.startsWith("sqlite:") ? "sqlite" : "postgresql";
const schema = fs.readFileSync(schemaPath, "utf8");
const next = schema.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${provider}"`);
if (next !== schema) fs.writeFileSync(schemaPath, next);
console.log(`Prisma datasource provider set to ${provider}`);
