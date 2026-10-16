/**
 * Fails when the migrations folder and schema.prisma disagree.
 * Prisma applies the migrations to a shadow Postgres database, then diffs that
 * database against the datamodel. An empty diff exits 0. A drift exits 2.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const shadow = process.env.SHADOW_DATABASE_URL;
if (!shadow) {
  console.error("SHADOW_DATABASE_URL is required (a Postgres database Prisma can reset).");
  process.exit(1);
}

const original = readFileSync("prisma/schema.prisma", "utf8");
const dir = mkdtempSync(join(tmpdir(), "lookuvi-schema-"));
const schemaPath = join(dir, "schema.prisma");
const patched = original
  .replace(/provider\s*=\s*"(sqlite|postgresql)"/, 'provider = "postgresql"')
  .replace(/url\s*=\s*env\("DATABASE_URL"\)/, `url = "${shadow.replaceAll('"', "")}"`);
writeFileSync(schemaPath, patched);

const result = spawnSync(
  "npx",
  [
    "prisma",
    "migrate",
    "diff",
    "--from-migrations",
    "prisma/migrations",
    "--to-schema-datamodel",
    schemaPath,
    "--shadow-database-url",
    shadow,
    "--exit-code",
  ],
  { encoding: "utf8" },
);

rmSync(dir, { recursive: true, force: true });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status === 0) {
  console.log("Migrations match prisma/schema.prisma.");
}
process.exit(result.status ?? 1);
