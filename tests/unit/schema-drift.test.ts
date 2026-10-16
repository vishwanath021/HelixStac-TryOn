import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lookSamples } from "@/lib/face/makeup-paint";

describe("bridal migration", () => {
  const sql = readFileSync("prisma/migrations/20261016000000_bridal/migration.sql", "utf8");

  it("adds the bridal columns idempotently", () => {
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'LOOK'`);
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "eventName" TEXT NOT NULL DEFAULT ''`);
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "eventDate" TEXT NOT NULL DEFAULT ''`);
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "productBridal" BOOLEAN NOT NULL DEFAULT true`);
  });

  it("matches prisma/schema.prisma", () => {
    const out = execFileSync("node", ["scripts/check-schema-drift.mjs"], {
      encoding: "utf8",
      timeout: 120_000,
      env: {
        ...process.env,
        SHADOW_DATABASE_URL: process.env.SHADOW_DATABASE_URL || "postgresql://prisma:prisma@127.0.0.1:5432/lookuvi_shadow",
      },
    });
    expect(out).toContain("Migrations match prisma/schema.prisma.");
  }, 120_000);
});

describe("live look samples", () => {
  it("places the lip sample on the lip, not the teeth, and the beard sample on the chin", () => {
    const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    points[0] = { x: 0.5, y: 0.62 };
    points[13] = { x: 0.5, y: 0.66 };
    points[17] = { x: 0.5, y: 0.74 };
    points[14] = { x: 0.5, y: 0.7 };
    points[152] = { x: 0.5, y: 0.9 };
    points[10] = { x: 0.5, y: 0.22 };
    for (const index of [33, 246, 161, 160, 159, 158, 157, 173, 133, 7, 163, 144, 145, 153, 154, 155]) {
      points[index] = { x: 0.35, y: 0.4 };
    }
    for (const index of [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]) {
      points[index] = { x: 0.34, y: 0.32 };
    }
    const samples = lookSamples(points);
    expect(samples).toBeTruthy();
    if (!samples) return;
    expect(samples.lip.y).toBeCloseTo(0.72);
    expect(samples.near.y).toBeGreaterThan(samples.lip.y);
    expect(samples.beard.y).toBeGreaterThan(samples.lip.y);
    expect(samples.hair.y).toBeLessThan(samples.brow.y);
    expect(samples.eye.y).toBeCloseTo(0.4);
  });
});
