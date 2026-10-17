import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { GeneratingLook } from "@/components/tryon/GeneratingLook";
import { BridalOwnLook } from "@/components/tryon/BridalOwnLook";
import { OWN_LOOK_ITEM_EDGE, OWN_LOOK_JEWELLERY_EDGE, OWN_LOOK_MAX_IMAGES, OWN_LOOK_MODEL, OWN_LOOK_SAREE_EDGE, OWN_LOOK_SLOTS, OWN_LOOK_THREE_BY_FOUR, ownLookItemEdge } from "@/data/bridal-own";
import { bridalMakeupById } from "@/data/bridal";
import {
  buildOwnLookPrompt,
  generateOwnLook,
  isPublicMediaKey,
  ownLookEstimateMeta,
  ownLookForm,
  ownLookFrameSize,
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
    const makeupAt = prompt.indexOf("Apply clearly visible bridal makeup:");
    const sareeAt = prompt.indexOf("Image 2 is her saree");
    expect(makeupAt).toBeGreaterThan(-1);
    expect(makeupAt).toBeLessThan(sareeAt);
    expect(prompt).toContain("Apply clearly visible bridal makeup: Makeup: classic bridal red lip, even HD base, kohl, and a round red bindi. Photo-ready HD makeup with an even base that still looks like skin. Lip colour: Red. Eye makeup: soft brown shadow and defined liner, clearly visible.");
    expect(prompt.indexOf("Eye makeup: soft brown shadow and defined liner, clearly visible.")).toBeLessThan(sareeAt);
    expect(prompt).toContain("Do not change face shape or features; makeup changes colour and finish only.");
    expect(prompt).toContain("Keep her natural skin tone and skin texture exactly; do not lighten, whiten or smooth the skin.");
    expect(prompt).not.toContain("exact face shape");
    expect(prompt).not.toContain("Do not slim, lift, smooth, or beautify");
    expect(prompt).toContain("neat side-swept front with a low bun visible at the side, no flowers.");
    expect(prompt).not.toContain("smooth bun or a braid");
    expect(prompt).toContain("Keep any nose pin already in her photo.");
    expect(prompt).toContain("Keep any sindoor at the hair parting and any bindi already in her photo.");
    expect(prompt).toContain("Telugu bridal styling");
    expect(prompt).toContain("Do not put flowers in her hair");
    expect(prompt).not.toMatch(/add jasmine|add marigold|gajra in the hair/i);
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
    const threeByFour = planOwnLook("makeup-nude-rose", ["saree"], OWN_LOOK_THREE_BY_FOUR);
    expect(threeByFour.ok).toBe(true);
    if (threeByFour.ok) {
      expect(threeByFour.plan.size).toBe("1024x1360");
      expect(ownLookForm(threeByFour.plan, []).get("size")).toBe("1024x1360");
    }
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
    const saree = await shrinkOwnLookJpeg(big, ownLookItemEdge("saree"));
    const necklace = await shrinkOwnLookJpeg(await jpeg(900, 900, { r: 180, g: 140, b: 40 }), ownLookItemEdge("necklace"));
    const blouse = await shrinkOwnLookJpeg(big, ownLookItemEdge("blouse"));
    expect(ownLookItemEdge("saree")).toBe(OWN_LOOK_SAREE_EDGE);
    expect(ownLookItemEdge("necklace")).toBe(OWN_LOOK_JEWELLERY_EDGE);
    expect(ownLookItemEdge("earrings")).toBe(OWN_LOOK_JEWELLERY_EDGE);
    expect(ownLookItemEdge("maang-tikka")).toBe(OWN_LOOK_JEWELLERY_EDGE);
    expect(ownLookItemEdge("bangles")).toBe(OWN_LOOK_JEWELLERY_EDGE);
    expect(ownLookItemEdge("nose-ring")).toBe(OWN_LOOK_JEWELLERY_EDGE);
    expect(ownLookItemEdge("blouse")).toBe(OWN_LOOK_ITEM_EDGE);
    expect(Math.max(saree.width, saree.height)).toBeLessThanOrEqual(OWN_LOOK_SAREE_EDGE);
    expect(Math.max(necklace.width, necklace.height)).toBeLessThanOrEqual(OWN_LOOK_JEWELLERY_EDGE);
    expect(Math.max(blouse.width, blouse.height)).toBeLessThanOrEqual(OWN_LOOK_ITEM_EDGE);
    expect(ownLookFrameSize(768, 1024)).toBe("1024x1360");
    expect(ownLookFrameSize(1400, 1800)).toBe("1024x1536");
    expect(ownLookFrameSize(1000, 1000)).toBe("1024x1024");
    expect(ownLookFrameSize(1600, 900)).toBe("1536x1024");
    const quoted = quoteOwnLook({
      prompt: "Image 1 is the bride.",
      size: "1024x1360",
      selfiePixels: 1024 * 1360,
      itemPixels: OWN_LOOK_SLOTS.map((slot) => {
        const edge = ownLookItemEdge(slot.id);
        return edge * edge;
      }),
    });
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    expect(quoted.quote.model).toBe("gpt-image-2.5-sunburst");
    expect(quoted.quote.quality).toBe("medium");
    expect(quoted.quote.imageCount).toBe(10);
    expect(quoted.quote.size).toBe("1024x1360");
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
          expect(form.get("size")).toBe("1024x1536");
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

  it("fits a 3:4 selfie on 1024x1360 and restores the frame", async () => {
    const prepared = await prepareOwnLook({
      selfie: await jpeg(768, 1024, { r: 200, g: 160, b: 140 }),
      items: [
        { id: "saree", bytes: await jpeg(900, 700, { r: 140, g: 20, b: 40 }) },
        { id: "bangles", bytes: await jpeg(1000, 800, { r: 180, g: 140, b: 40 }) },
      ],
      makeupId: "makeup-classic-red",
    });
    const face = await sharp(prepared.selfie).metadata();
    const saree = await sharp(prepared.items[0]?.jpeg).metadata();
    const bangles = await sharp(prepared.items[1]?.jpeg).metadata();
    expect(prepared.plan.size).toBe("1024x1360");
    expect(prepared.quote.size).toBe("1024x1360");
    expect(face.width).toBe(1024);
    expect(face.height).toBe(1360);
    expect(Math.max(saree.width || 0, saree.height || 0)).toBeLessThanOrEqual(OWN_LOOK_SAREE_EDGE);
    expect(Math.max(bangles.width || 0, bangles.height || 0)).toBeLessThanOrEqual(OWN_LOOK_JEWELLERY_EDGE);
    expect(prepared.plan.imageOrder).toEqual(["selfie.jpg", "saree.jpg", "bangles.jpg"]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const ok = await generateOwnLook({
        selfie: await jpeg(1600, 900, { r: 200, g: 160, b: 140 }),
        items: [],
        makeupId: "makeup-classic-red",
        tenantId: "tenant",
        requestId: "frame",
        put: async () => undefined,
        remove: async () => undefined,
        edit: async (form) => {
          expect(form.get("size")).toBe("1536x1024");
          return jpeg(1536, 1024, { r: 20, g: 20, b: 20 });
        },
      });
      const back = await sharp(ok.image).metadata();
      expect(back.width).toBe(1536);
      expect(back.height).toBeLessThan(1024);
    } finally {
      info.mockRestore();
    }
  });

  it("reads a turned selfie as 3:4 before choosing the canvas", async () => {
    const landscape = await jpeg(1024, 768, { r: 200, g: 160, b: 140 });
    const turned = await sharp(landscape).withMetadata({ orientation: 6 }).toBuffer();
    const prepared = await prepareOwnLook({
      selfie: turned,
      items: [],
      makeupId: "makeup-classic-red",
    });
    expect(prepared.plan.size).toBe("1024x1360");
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
    expect(html).toContain("Take a close-up of each piece on its own");
    expect(html).toContain("Close-up of the piece, on its own.");
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
