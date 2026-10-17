import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { GeneratingLook } from "@/components/tryon/GeneratingLook";
import { BridalOwnLook } from "@/components/tryon/BridalOwnLook";
import { OWN_LOOK_ITEM_EDGE, OWN_LOOK_MAX_IMAGES, OWN_LOOK_MODEL, OWN_LOOK_SELFIE_EDGE, OWN_LOOK_SLOTS } from "@/data/bridal-own";
import { bridalMakeupById } from "@/data/bridal";
import {
  buildOwnLookPrompt,
  generateOwnLook,
  isPublicMediaKey,
  ownLookEstimateMeta,
  ownLookItemKey,
  planOwnLook,
  prepareOwnLook,
  quoteOwnLook,
  shrinkOwnLookJpeg,
} from "@/lib/bridal-own";
import { editFormFields } from "@/lib/ai/edit-request";
import { generationFrame } from "@/lib/generation-stage";
import { salonActionItems } from "@/lib/salon-actions";
import type { SalonConfig } from "@/lib/salon";

async function jpeg(width: number, height: number, color: { r: number; g: number; b: number }) {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
}

describe("your own look prompt", () => {
  it("labels each photo, keeps her face, and copies the items", () => {
    const makeup = bridalMakeupById("makeup-classic-red");
    expect(makeup).toBeTruthy();
    if (!makeup) return;
    const prompt = buildOwnLookPrompt(makeup, [
      { id: "saree", noun: "saree" },
      { id: "necklace", noun: "necklace" },
    ]);
    expect(prompt).toContain("Image 1 is the bride's own selfie");
    expect(prompt).toContain("Image 2 is her saree");
    expect(prompt).toContain("Image 3 is her necklace");
    expect(prompt).toContain("Copy that saree exactly");
    expect(prompt).toContain("Copy that necklace exactly");
    expect(prompt).toContain("exact face shape");
    expect(prompt).toContain("Do not slim, lift, smooth, or beautify");
    expect(prompt).toContain("Telugu bridal styling");
    expect(prompt).toContain("Do not put flowers in her hair");
    expect(prompt).not.toMatch(/add jasmine|add marigold|gajra in the hair/i);
    expect(prompt).toContain("classic bridal red lip");
    expect(prompt).toContain("Lip colour: Red");
  });

  it("does not invent clothes when she skipped every item", () => {
    const makeup = bridalMakeupById("makeup-maroon");
    expect(makeup).toBeTruthy();
    if (!makeup) return;
    const prompt = buildOwnLookPrompt(makeup, []);
    expect(prompt).toContain("She did not add item photos");
    expect(prompt).toContain("Do not invent a saree");
    expect(prompt).not.toContain("Image 2");
  });

  it("keeps slot order so the image numbers stay stable", () => {
    const planned = planOwnLook("makeup-nude-rose", ["earrings", "saree"]);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.model).toBe(OWN_LOOK_MODEL);
    expect(planned.plan.quality).toBe("medium");
    expect(planned.plan.size).toBe("1024x1536");
    expect(planned.plan.n).toBe(1);
    expect(planned.plan.inputFidelity).toBeNull();
    expect(planned.plan.imageOrder).toEqual(["selfie.jpg", "saree.jpg", "earrings.jpg"]);
    expect(planned.prompt).toContain("Image 2 is her saree");
    expect(planned.prompt).toContain("Image 3 is her earrings");
    const fields = editFormFields(planned.plan);
    expect(fields.input_fidelity).toBeUndefined();
    expect(fields.model).toBe("gpt-image-2.5-sunburst");
    expect(fields.quality).toBe("medium");
    expect("seed" in fields).toBe(false);
  });

  it("refuses an unknown makeup look and a repeated item", () => {
    expect(planOwnLook("not-a-card", []).ok).toBe(false);
    expect(planOwnLook("makeup-classic-red", ["tiara"]).ok).toBe(false);
    expect(planOwnLook("makeup-classic-red", ["saree", "saree"]).ok).toBe(false);
    expect(OWN_LOOK_SLOTS).toHaveLength(9);
    expect(OWN_LOOK_MAX_IMAGES).toBe(10);
  });
});

describe("your own look cost and privacy", () => {
  it("shrinks item photos and quotes sunburst at medium", async () => {
    const big = await jpeg(900, 600, { r: 180, g: 40, b: 70 });
    const item = await shrinkOwnLookJpeg(big, OWN_LOOK_ITEM_EDGE);
    expect(Math.max(item.width, item.height)).toBeLessThanOrEqual(OWN_LOOK_ITEM_EDGE);
    const face = await shrinkOwnLookJpeg(await jpeg(1200, 1600, { r: 210, g: 170, b: 150 }), OWN_LOOK_SELFIE_EDGE);
    expect(Math.max(face.width, face.height)).toBeLessThanOrEqual(OWN_LOOK_SELFIE_EDGE);
    const quoted = quoteOwnLook({
      prompt: "Image 1 is the bride.",
      selfiePixels: face.pixels,
      itemPixels: OWN_LOOK_SLOTS.map(() => OWN_LOOK_ITEM_EDGE * OWN_LOOK_ITEM_EDGE),
    });
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    expect(quoted.quote.model).toBe("gpt-image-2.5-sunburst");
    expect(quoted.quote.quality).toBe("medium");
    expect(quoted.quote.imageCount).toBe(10);
    expect(quoted.quote.estimateUsd).toBeGreaterThan(0);
    expect(quoted.quote.estimateInr).toBeLessThanOrEqual(30);
    const meta = ownLookEstimateMeta(quoted.quote, "salon");
    const banned = /photo|image|buffer|dataurl|base64|inlinedata|pixels|selfie|apikey|api_key|secret|cipher|authorization|token/i;
    for (const key of Object.keys(meta)) expect(key).not.toMatch(banned);
    expect(meta.estimateUsd).toBe(quoted.quote.estimateUsd);
  });

  it("refuses a quote above the cap and does not call the model", async () => {
    const previous = process.env.OWN_LOOK_CAP_INR;
    process.env.OWN_LOOK_CAP_INR = "0";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const put = vi.fn();
    const edit = vi.fn();
    try {
      await expect(generateOwnLook({
        selfie: await jpeg(200, 260, { r: 200, g: 160, b: 140 }),
        items: [{ id: "saree", bytes: await jpeg(200, 200, { r: 140, g: 20, b: 40 }) }],
        makeupId: "makeup-classic-red",
        tenantId: "tenant",
        requestId: "req-1",
        put,
        remove: async () => undefined,
        edit,
      })).rejects.toThrow(/cap/i);
      expect(put).not.toHaveBeenCalled();
      expect(edit).not.toHaveBeenCalled();
      expect(info.mock.calls.some((call) => String(call[0]).includes("cost estimate"))).toBe(true);
    } finally {
      info.mockRestore();
      if (previous === undefined) delete process.env.OWN_LOOK_CAP_INR;
      else process.env.OWN_LOOK_CAP_INR = previous;
    }
  });

  it("deletes private item photos after a successful edit and after a failure", async () => {
    const selfie = await jpeg(320, 400, { r: 210, g: 170, b: 150 });
    const saree = await jpeg(300, 300, { r: 150, g: 20, b: 40 });
    const stored = new Map<string, Buffer>();
    const removed: string[] = [];
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const ok = await generateOwnLook({
        selfie,
        items: [{ id: "saree", bytes: saree }],
        makeupId: "makeup-classic-red",
        tenantId: "tenant/../x",
        requestId: "req 1",
        put: async (key, body) => { stored.set(key, body); },
        remove: async (key) => { removed.push(key); stored.delete(key); },
        edit: async (form) => {
          expect(form.get("model")).toBe("gpt-image-2.5-sunburst");
          expect(form.get("quality")).toBe("medium");
          expect(form.get("input_fidelity")).toBeNull();
          expect(form.get("n")).toBe("1");
          const files = form.getAll("image[]") as File[];
          expect(files.map((file) => file.name)).toEqual(["selfie.jpg", "saree.jpg"]);
          return jpeg(64, 80, { r: 10, g: 10, b: 10 });
        },
      });
      expect(ok.quote.estimateUsd).toBeGreaterThan(0);
      expect(stored.size).toBe(0);
      expect(removed).toHaveLength(1);
      expect(removed[0]).toMatch(/^bridal-own\//);
      expect(isPublicMediaKey(removed[0] || "")).toBe(false);
      expect(isPublicMediaKey("generations/salon/result.jpg")).toBe(true);
      expect(String(info.mock.calls[0]?.[0])).toContain("gpt-image-2.5-sunburst");
      expect(String(info.mock.calls[0]?.[0])).toContain("quality medium");

      removed.length = 0;
      await expect(generateOwnLook({
        selfie,
        items: [{ id: "blouse", bytes: saree }],
        makeupId: "makeup-classic-red",
        tenantId: "tenant",
        requestId: "req-2",
        put: async (key, body) => { stored.set(key, body); },
        remove: async (key) => { removed.push(key); stored.delete(key); },
        edit: async () => { throw new Error("provider down"); },
      })).rejects.toThrow("provider down");
      expect(stored.size).toBe(0);
      expect(removed[0]).toBe(ownLookItemKey("tenant", "req-2", "blouse"));
      expect(isPublicMediaKey(removed[0] || "")).toBe(false);
    } finally {
      info.mockRestore();
    }
  });

  it("sends the shrunk selfie and item, not the original pixels", async () => {
    const prepared = await prepareOwnLook({
      selfie: await jpeg(1400, 1800, { r: 200, g: 160, b: 140 }),
      items: [{ id: "bangles", bytes: await jpeg(1000, 800, { r: 180, g: 140, b: 40 }) }],
      makeupId: "makeup-reception-glam",
    });
    const face = await sharp(prepared.selfie).metadata();
    const item = await sharp(prepared.items[0]?.jpeg).metadata();
    expect(Math.max(face.width || 0, face.height || 0)).toBeLessThanOrEqual(OWN_LOOK_SELFIE_EDGE);
    expect(Math.max(item.width || 0, item.height || 0)).toBeLessThanOrEqual(OWN_LOOK_ITEM_EDGE);
    expect(prepared.plan.imageOrder).toEqual(["selfie.jpg", "bangles.jpg"]);
  });
});

describe("your own look screen", () => {
  it("walks status lines on her photo without a blur veil", () => {
    expect(generationFrame("bridal-own", 0).label).toBe("Reading your photo");
    expect(generationFrame("bridal-own", 20_000).label).toBe("Placing your items");
    expect(generationFrame("bridal-own", 40_000).label).toBe("Applying the makeup");
    expect(generationFrame("bridal-own", 60_000).label).toBe("Finishing the portrait");
    expect(generationFrame("bridal-own", 120_000).pct).toBe(92);
    const own = renderToStaticMarkup(createElement(GeneratingLook, { tool: "bridal-own", blur: false }));
    expect(own).toContain("gen-shimmer");
    expect(own).toContain("gen-stage");
    expect(own).toContain("Reading your photo");
    expect(own).toContain("data-blur=\"no\"");
    expect(own).not.toContain("gen-blur");
    const bridal = renderToStaticMarkup(createElement(GeneratingLook, { tool: "bridal" }));
    expect(bridal).toContain("gen-blur");
  });

  it("offers every item slot and keeps Join queue off bridal", () => {
    const html = renderToStaticMarkup(createElement(BridalOwnLook, { config: { slug: "demo", defaultLang: "en" } as SalonConfig }));
    for (const slot of OWN_LOOK_SLOTS) {
      expect(html).toContain(slot.label);
      expect(html).toContain(`data-item="${slot.id}"`);
    }
    expect(html).toContain("Live makeup");
    expect(html).toContain("Use photo");
    expect(html).toContain("Take photo");
    expect(html).toContain("Classic Red");
    expect(html).toContain("btn sheen");
    expect(html).not.toContain("Join queue");
    expect(html).not.toMatch(/gold/i);
    expect(salonActionItems({ phone: true, showQueue: true, bridalOn: true })).toEqual(["book", "chat"]);
    expect(salonActionItems({ phone: true, showQueue: true, bridalOn: false })).toEqual(["book", "queue", "chat"]);
  });
});
