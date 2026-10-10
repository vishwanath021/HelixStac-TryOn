import { describe, expect, it } from "vitest";
import { isPlatformLogo } from "@/components/brand/LookuviMark";

describe("platform logo", () => {
  it("uses the Lookuvi mark when a salon has no logo of its own", () => {
    expect(isPlatformLogo(null)).toBe(true);
    expect(isPlatformLogo("")).toBe(true);
    expect(isPlatformLogo("/brand/lookuvi-mark.svg")).toBe(true);
    expect(isPlatformLogo("/brand/demo-mark.svg")).toBe(true);
    expect(isPlatformLogo("/brand/mark.svg")).toBe(true);
    expect(isPlatformLogo("data:image/jpeg;base64,abc")).toBe(false);
    expect(isPlatformLogo("/uploads/salon.png")).toBe(false);
  });
});