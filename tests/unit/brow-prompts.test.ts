import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { BROW_COLOURS, BROW_THICKNESS, BROWS, browById, browsForAudience, parseBrowColour, parseBrowThickness } from "@/data/brows";
import { BROW_CARD_CUES, BROW_CARD_PHOTO_IDS, browCardPhoto } from "@/data/brow-cards";
import { BROW_SHAPES } from "@/data/brow-shapes";
import { browDiagramJpeg } from "@/lib/ai/brow-diagram";
import { buildBrowPrompt } from "@/lib/prompts";

const ONLY = "Change only the eyebrows.";
const KEEP = "Keep the face, identity, hair, skin, background and framing identical.";

describe("brow prompts", () => {
  it("gives each type and variation a distinct prompt", () => {
    const prompts = new Set<string>();
    for (const brow of BROWS) {
      for (const thickness of BROW_THICKNESS) {
        for (const colour of BROW_COLOURS) {
          const prompt = buildBrowPrompt(brow, { thickness: thickness.id, colour: colour.id });
          prompts.add(prompt);
          expect(prompt, `${brow.id} ${thickness.id} ${colour.id}`).toContain(ONLY);
          expect(prompt).toContain(KEEP);
          expect(prompt).toContain("brow-shape diagram, not a face to copy");
          expect(prompt).toContain(brow.prompt);
          expect(prompt).toContain(thickness.line);
          expect(prompt).toContain(colour.line);
          expect(prompt.toLowerCase()).not.toContain("mask");
          expect(brow.prompt).not.toContain(thickness.line);
          expect(brow.prompt).not.toContain(colour.line);
        }
      }
    }
    expect(prompts.size).toBe(BROWS.length * BROW_THICKNESS.length * BROW_COLOURS.length);
    expect(browById("soft-arch")?.prompt).toBe("Arch position: a low gentle rise just past the iris. Tail: a soft downward taper.");
    expect(browById("high-arch")?.prompt).toBe("Arch position: a high peak above the outer iris. Tail: a steep descent after the peak.");
    expect(browById("angled")?.prompt).toBe("Arch position: two straight edges meet in a hard angle above the outer iris. Tail: a straight line dropping away from that corner.");
    const sShape = browById("s-shape")?.prompt ?? "";
    const defined = browById("thin-defined")?.prompt ?? "";
    expect(sShape).toContain("the head dips, then the body lifts into an S");
    expect(sShape).toContain("upward flick");
    expect(sShape).toContain("not a thin high arch");
    expect(defined).toContain("a precise high peak");
    expect(defined).toContain("long fine point");
    expect(defined).toContain("does not flick upward");
    expect(sShape).not.toBe(defined);
    expect(buildBrowPrompt(browById("s-shape")!)).not.toBe(buildBrowPrompt(browById("thin-defined")!));
    const cues = BROWS.map((brow) => BROW_CARD_CUES[brow.id]);
    expect(cues.every(Boolean)).toBe(true);
    expect(new Set(cues).size).toBe(BROWS.length);
    for (const brow of BROWS) {
      expect(buildBrowPrompt(brow)).not.toContain(BROW_CARD_CUES[brow.id]);
    }
    expect(BROW_CARD_CUES["s-shape"]).toContain("flicks upward");
    expect(BROW_CARD_CUES["thin-defined"]).toContain("descends past the outer eye");
    expect(BROW_CARD_CUES.angled).toContain("hard sharp corner");
  });

  it("falls back to natural thickness and colour", () => {
    expect(parseBrowThickness("")).toBe("natural");
    expect(parseBrowThickness("huge")).toBe("natural");
    expect(parseBrowColour(null)).toBe("natural");
    expect(parseBrowColour("purple")).toBe("natural");
    const brow = BROWS[0];
    expect(buildBrowPrompt(brow)).toBe(buildBrowPrompt(brow, { thickness: "natural", colour: "natural" }));
    expect(buildBrowPrompt(brow, { thickness: "thin", colour: "dark" })).not.toBe(buildBrowPrompt(brow));
  });

  it("sorts by the customer's look and still lists every brow", () => {
    const men = browsForAudience(BROWS, "men");
    const women = browsForAudience(BROWS, "women");
    const kids = browsForAudience(BROWS, "kids");
    expect(new Set(men.map((brow) => brow.id)).size).toBe(BROWS.length);
    expect(new Set(women.map((brow) => brow.id)).size).toBe(BROWS.length);
    const menOrder = men.map((brow) => brow.audience);
    expect(menOrder.indexOf("men")).toBeLessThan(menOrder.indexOf("unisex"));
    expect(menOrder.indexOf("unisex")).toBeLessThan(menOrder.indexOf("women"));
    expect(women[0]?.audience).toBe("women");
    expect(women.map((brow) => brow.id)).toEqual(kids.map((brow) => brow.id));
    expect(men.filter((brow) => brow.audience === "men").map((brow) => brow.id)).toEqual(["flat-thick", "natural-groomed"]);
    expect(women.filter((brow) => brow.audience === "women").map((brow) => brow.id)).toEqual([
      "soft-arch",
      "high-arch",
      "rounded",
      "s-shape",
      "thin-defined",
    ]);
  });

  it("draws a distinct diagram for every brow", async () => {
    expect(BROW_SHAPES.map((shape) => shape.id)).toEqual(BROWS.map((brow) => brow.id));
    expect(new Set(BROW_SHAPES.map((shape) => shape.d)).size).toBe(BROW_SHAPES.length);
    const hashes = new Set<string>();
    for (const brow of BROWS) {
      const jpeg = await browDiagramJpeg(brow.id);
      expect(jpeg?.[0], brow.id).toBe(0xff);
      const meta = await sharp(jpeg!).metadata();
      expect(meta.width).toBe(512);
      expect(meta.height).toBe(512);
      hashes.add(createHash("sha256").update(jpeg!).digest("hex"));
    }
    expect(hashes.size).toBe(BROWS.length);
  });

  it("changes the prompt on Try and leaves chip clicks as state", async () => {
    const app = readFileSync("src/components/tryon/TryOnApp.tsx", "utf8");
    expect(app).toContain("onClick={() => setBrowThickness(item.id)}");
    expect(app).toContain("onClick={() => setBrowColour(item.id)}");
    expect(app).toContain('body.set("browThickness", browThickness)');
    expect(app).toContain('body.set("browColour", browColour)');
    expect(app).toContain("<BrowCard ");
    const card = readFileSync("src/components/tryon/BrowCard.tsx", "utf8");
    expect(card).toContain("browCardPhoto");
    expect(card).not.toContain("absolute bottom-1 right-1 h-9 w-9");
    expect(card).toContain("object-cover object-center");
    expect(card).toContain("aspect-video");
    expect(card).toContain("onError");
    expect([...BROW_CARD_PHOTO_IDS]).toEqual(BROWS.map((brow) => brow.id));
    for (const id of BROW_CARD_PHOTO_IDS) {
      expect(browById(id), id).toBeTruthy();
      const file = `public/brows/cards/${id}.webp`;
      expect(existsSync(file), id).toBe(true);
      const meta = await sharp(file).metadata();
      expect(meta.width, id).toBe(800);
      expect(meta.height, id).toBe(450);
      expect(browCardPhoto(id)).toBe(`/brows/cards/${id}.webp`);
    }
    expect(browCardPhoto("missing-brow")).toBeNull();
    expect(Object.keys(BROW_CARD_CUES)).toEqual(BROWS.map((brow) => brow.id));
    const script = readFileSync("scripts/generate-brow-cards.ts", "utf8");
    expect(script).toContain("BROW_CARD_CUES");
    expect(script).toContain("Exaggerate this brow shape");
    expect(script).toContain('const MODEL = "gpt-image-2.5-sunburst"');
    expect(script).toContain("const CAP_INR = 40");
    expect(script).toContain("OPENAI_API_KEY is not set");
    const route = readFileSync("src/app/api/v1/tryon/generate/route.ts", "utf8");
    expect(route).toContain("${browThickness}:${browColour}");
    expect(route).not.toMatch(/gpt-image/);
  });
});
