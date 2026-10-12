import { describe, expect, it } from "vitest";
import { isHeic } from "@/lib/images";

describe("isHeic", () => {
  it("recognises a HEIC ftyp brand and ignores jpeg", () => {
    const heic = Buffer.alloc(16);
    heic.write("ftyp", 4, "ascii");
    heic.write("heic", 8, "ascii");
    expect(isHeic(heic)).toBe(true);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(isHeic(jpeg)).toBe(false);
  });
});
