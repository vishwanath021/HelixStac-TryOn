import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resetRateLimits } from "@/lib/ratelimit";
import { consumePreviewRate, enabledTools, guestLimitMessage, maskToolFlags, previewRateLimits, previewRateMessage, toolEnabled } from "@/lib/tools";

const allOn = {
  toolStyle: true,
  toolColour: true,
  toolBrows: true,
  toolBeard: true,
  toolNails: true,
};

describe("enabled tools", () => {
  it("defaults to every tool", () => {
    expect([...enabledTools(undefined)].sort()).toEqual(["beard", "brows", "colour", "hairstyle", "nails"]);
    expect([...enabledTools("")].sort()).toEqual(["beard", "brows", "colour", "hairstyle", "nails"]);
    expect([...enabledTools("all")].sort()).toEqual(["beard", "brows", "colour", "hairstyle", "nails"]);
    expect([...enabledTools("hairstyle")]).toEqual(["hairstyle"]);
    expect([...enabledTools("style")]).toEqual(["hairstyle"]);
    expect(toolEnabled("colour", "hairstyle")).toBe(false);
    expect(toolEnabled("beard", undefined)).toBe(true);
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

  it("names the tool on a connection limit and keeps live colour off that sentence", () => {
    expect(previewRateMessage("beard")).toBe("Too many beard previews from this connection.");
    expect(previewRateMessage("brows")).toBe("Too many brow previews from this connection.");
    expect(previewRateMessage("nails")).toBe("Too many nail previews from this connection.");
    expect(previewRateMessage("style")).toBe("Too many hairstyle previews from this connection.");
    for (const tool of ["beard", "brows", "nails", "style"] as const) {
      expect(previewRateMessage(tool)).not.toMatch(/colour/i);
    }
    expect(guestLimitMessage("rate", "all")).toBe("Too many previews from this connection.");
    expect(guestLimitMessage("rate", "all")).not.toMatch(/colour/i);
    expect(guestLimitMessage("daily", "hairstyle")).not.toMatch(/colour/i);
    expect(guestLimitMessage("daily", "all")).toMatch(/Live colour is still free/);
  });

  it("counts a generate per tool and leaves the other tools alone", () => {
    const keys = ["GENERATE_PER_IP_HOUR", "GENERATE_PER_IP_DAY", "GENERATE_PER_TENANT_MINUTE", "GENERATE_STAFF_PER_IP_HOUR"] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    process.env.GENERATE_PER_IP_HOUR = "2";
    process.env.GENERATE_PER_TENANT_MINUTE = "2";
    process.env.GENERATE_STAFF_PER_IP_HOUR = "3";
    resetRateLimits();
    try {
      expect(consumePreviewRate({ tool: "beard", staff: false, bucket: "guest-a", tenantId: "salon", now: 1_000 }).ok).toBe(true);
      expect(consumePreviewRate({ tool: "beard", staff: false, bucket: "guest-a", tenantId: "salon", now: 1_100 }).ok).toBe(true);
      const blocked = consumePreviewRate({ tool: "beard", staff: false, bucket: "guest-a", tenantId: "salon", now: 1_200 });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) {
        expect(blocked.message).toBe("Too many beard previews from this connection.");
        expect(blocked.message).not.toMatch(/colour/i);
      }
      expect(consumePreviewRate({ tool: "style", staff: false, bucket: "guest-a", tenantId: "salon", now: 1_300 }).ok).toBe(true);
      expect(consumePreviewRate({ tool: "brows", staff: false, bucket: "guest-a", tenantId: "salon", now: 1_400 }).ok).toBe(true);
      const staff = { tool: "beard" as const, staff: true, bucket: "staff:owner", tenantId: "salon" };
      expect(consumePreviewRate({ ...staff, now: 2_000 }).ok).toBe(true);
      expect(consumePreviewRate({ ...staff, now: 2_100 }).ok).toBe(true);
      expect(consumePreviewRate({ ...staff, now: 2_200 }).ok).toBe(true);
      expect(consumePreviewRate({ ...staff, now: 2_300 }).ok).toBe(false);
      const route = readFileSync("src/app/api/v1/tryon/generate/route.ts", "utf8");
      expect(route.indexOf('claim.kind === "replay"')).toBeLessThan(route.indexOf("takePreviewSlot"));
      expect(route.indexOf("if (!placement.ok)")).toBeLessThan(route.lastIndexOf("takePreviewSlot"));
      expect(route).not.toContain("gen:ip:h:");
      expect(route).not.toContain('guestLimitMessage("rate")');
    } finally {
      resetRateLimits();
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
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
