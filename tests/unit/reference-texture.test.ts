import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReferenceTextureWarning } from "@/components/tryon/ReferenceTextureWarning";
import { STYLES } from "@/data/styles";
import { parseAskedTexture, referenceFingerprintMode, selectReferenceVariant, stylesMissingCurlyReference } from "@/lib/ai/reference-texture";

describe("reference texture", () => {
  it("keeps the catalogue JPEG and warns when the asked texture has no sibling", () => {
    const natural = selectReferenceVariant({
      styleId: "messy-texture",
      styleName: "Messy Texture",
      referenceTexture: "straight",
      asked: "natural",
      files: ["messy-texture.jpg"],
    });
    expect(natural.mismatch).toBe(false);
    expect(natural.warning).toBe("");
    expect(natural.fileName).toBe("messy-texture.jpg");

    const missing = selectReferenceVariant({
      styleId: "messy-texture",
      styleName: "Messy Texture",
      asked: "curly",
      files: ["messy-texture.jpg"],
    });
    expect(missing.fileName).toBe("messy-texture.jpg");
    expect(missing.referenceTexture).toBe("straight");
    expect(missing.mismatch).toBe(true);
    expect(missing.warning).toContain("straight hair");
    expect(missing.warning).toContain("No curly variant");
    expect(missing.warning).toContain("Image 2");

    const matched = selectReferenceVariant({
      styleId: "messy-texture",
      styleName: "Messy Texture",
      referenceTexture: "straight",
      asked: "curly",
      files: ["messy-texture.jpg", "messy-texture-curly.jpg"],
    });
    expect(matched.fileName).toBe("messy-texture-curly.jpg");
    expect(matched.referenceTexture).toBe("curly");
    expect(matched.mismatch).toBe(false);
    expect(matched.warning).toBe("");

    const wavy = selectReferenceVariant({
      styleId: "beach-waves",
      styleName: "Beach Waves",
      asked: "wavy",
      files: ["beach-waves.jpg"],
    });
    expect(wavy.mismatch).toBe(false);
    expect(wavy.fileName).toBe("beach-waves.jpg");
  });

  it("lists styles that have no curly reference file", () => {
    const missing = stylesMissingCurlyReference(STYLES, []);
    expect(missing).toContain("messy-texture");
    expect(missing).toContain("soft-curls");
    expect(missing).toContain("curly-top-fade");
    expect(missing).toContain("beach-waves");
    expect(missing).toHaveLength(STYLES.length);
    expect(stylesMissingCurlyReference([{ id: "pixie", name: "Pixie", referenceTexture: "straight" }], ["pixie-curly.jpg"])).toEqual([]);
    expect(STYLES.filter((style) => style.referenceTexture === "curly")).toEqual([]);
    expect(STYLES.find((style) => style.id === "beach-waves")?.referenceTexture).toBe("wavy");
    expect(STYLES.find((style) => style.id === "soft-waves")?.referenceTexture).toBe("wavy");
    expect(STYLES.find((style) => style.id === "messy-texture")?.referenceTexture).toBe("straight");
    expect(STYLES.find((style) => style.id === "soft-curls")?.referenceTexture).toBe("straight");
    expect(STYLES.find((style) => style.id === "kids-curly-crop")?.referenceTexture).toBe("straight");
  });

  it("appends only a set texture to the fingerprint and the warning", () => {
    expect(parseAskedTexture("curly")).toBe("curly");
    expect(parseAskedTexture("")).toBe("natural");
    expect(parseAskedTexture("coily")).toBe("natural");
    expect(referenceFingerprintMode("natural")).toBe("reference");
    expect(referenceFingerprintMode("curly")).toBe("reference-curly");
    expect(referenceFingerprintMode("wavy")).toBe("reference-wavy");
    expect(referenceFingerprintMode("natural", "gpt-image-2")).toBe("reference:gpt-image-2");
    expect(referenceFingerprintMode("curly", "gemini-3.1-flash-image")).toBe("reference-curly:gemini-3.1-flash-image");

    const warning = renderToStaticMarkup(createElement(ReferenceTextureWarning, {
      styleId: "messy-texture",
      styleName: "Messy Texture",
      referenceTexture: "straight",
      asked: "curly",
    }));
    expect(warning).toContain("The Messy Texture reference is straight hair");
    expect(warning).toContain("No curly variant");
    const quiet = renderToStaticMarkup(createElement(ReferenceTextureWarning, {
      styleId: "messy-texture",
      styleName: "Messy Texture",
      referenceTexture: "straight",
      asked: "natural",
    }));
    expect(quiet).toBe("");
    const same = renderToStaticMarkup(createElement(ReferenceTextureWarning, {
      styleId: "beach-waves",
      styleName: "Beach Waves",
      referenceTexture: "wavy",
      asked: "wavy",
    }));
    expect(same).toBe("");
  });
});
