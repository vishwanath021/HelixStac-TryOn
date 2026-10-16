import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND_COLOUR_HINT, LOOKUVI_ACCENT, LOOKUVI_PRIMARY } from "@/lib/contrast";

describe("Lookuvi brand colour", () => {
  it("uses purple defaults and says where the colour shows", () => {
    expect(LOOKUVI_PRIMARY).toBe("#69517D");
    expect(LOOKUVI_ACCENT).toBe("#B6A0C9");
    expect(BRAND_COLOUR_HINT).toBe("Used on your QR poster.");
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toContain(`primaryColor        String    @default("${LOOKUVI_PRIMARY}")`);
    expect(schema).toContain(`accentColor         String    @default("${LOOKUVI_ACCENT}")`);
    expect(schema).not.toContain("#0E7C74");
    expect(schema).not.toContain("#E9897A");
  });

  it("changes only the column defaults", () => {
    const sql = readFileSync("prisma/migrations/20261016230000_brand_colour_defaults/migration.sql", "utf8");
    expect(sql).toContain(`ALTER COLUMN "primaryColor" SET DEFAULT '#69517D'`);
    expect(sql).toContain(`ALTER COLUMN "accentColor" SET DEFAULT '#B6A0C9'`);
    expect(sql.toUpperCase()).not.toContain("UPDATE ");
  });
});
