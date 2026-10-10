import { describe, expect, it } from "vitest";
import { enabledTools, guestLimitMessage, maskToolFlags, previewRateLimits, toolEnabled } from "@/lib/tools";

const allOn = {
  toolStyle: true,
  toolColour: true,
  toolBrows: true,
  toolBeard: true,
  toolNails: true,
};

describe("enabled tools", () => {
  it("defaults to hairstyle only", () => {
    expect([...enabledTools(undefined)]).toEqual(["hairstyle"]);
    expect([...enabledTools("")]).toEqual(["hairstyle"]);
    expect([...enabledTools("style")]).toEqual(["hairstyle"]);
    expect(toolEnabled("colour", "hairstyle")).toBe(false);
    expect(toolEnabled("hairstyle", undefined)).toBe(true);
  });

  it("accepts a list or all", () => {
    expect([...enabledTools("hairstyle,colour, brows")].sort()).toEqual(["brows", "colour", "hairstyle"]);
    expect([...enabledTools("all")].sort()).toEqual(["beard", "brows", "colour", "hairstyle", "nails"]);
    expect([...enabledTools("nope")]).toEqual(["hairstyle"]);
  });

  it("masks salon flags without forgetting the stored values when the flag is widened", () => {
    expect(maskToolFlags(allOn, "hairstyle")).toEqual({
      toolStyle: true,
      toolColour: false,
      toolBrows: false,
      toolBeard: false,
      toolNails: false,
    });
    expect(maskToolFlags({ ...allOn, toolStyle: false }, "all").toolStyle).toBe(false);
    expect(maskToolFlags(allOn, "brows,beard")).toMatchObject({ toolBrows: true, toolBeard: true, toolStyle: false, toolColour: false });
  });

  it("drops the live colour sentence while that tool is hidden", () => {
    expect(guestLimitMessage("rate", "hairstyle")).toBe("Too many previews from this connection.");
    expect(guestLimitMessage("rate", "hairstyle")).not.toMatch(/colour/i);
    expect(guestLimitMessage("daily", "hairstyle")).not.toMatch(/colour/i);
    expect(guestLimitMessage("member", "hairstyle")).not.toMatch(/colour/i);
    expect(guestLimitMessage("anon", "hairstyle")).not.toMatch(/colour/i);
    expect(guestLimitMessage("credits", "hairstyle")).not.toMatch(/colour/i);
    expect(guestLimitMessage("rate", "all")).toBe("Too many previews from this connection. Live colour is still free.");
  });

  it("gives signed-in salon staff a higher configurable preview limit", () => {
    const keys = [
      "GENERATE_PER_IP_HOUR",
      "GENERATE_PER_IP_DAY",
      "GENERATE_PER_TENANT_MINUTE",
      "GENERATE_STAFF_PER_IP_HOUR",
      "GENERATE_STAFF_PER_IP_DAY",
      "GENERATE_STAFF_PER_MINUTE",
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    try {
      expect(previewRateLimits(false)).toEqual({ hour: 6, day: 20, minute: 30 });
      expect(previewRateLimits(true)).toEqual({ hour: 240, day: 1000, minute: 120 });
      process.env.GENERATE_STAFF_PER_IP_HOUR = "400";
      expect(previewRateLimits(true).hour).toBe(400);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
