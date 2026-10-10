import { beardById } from "@/data/beards";
import { browById } from "@/data/brows";
import { nailById } from "@/data/nails";
import { SHADES } from "@/data/shades";
import { styleById, type Gender } from "@/data/styles";
import { recommendStyles } from "@/lib/recommendations";

export type LookRef = { id: string; name: string; serviceKeys: string[]; tool: "style" | "brows" | "beard" | "nails"; gender?: Gender };

export function resolveLook(tool: string, id: string): LookRef | null {
  if (tool === "brows") {
    const brow = browById(id);
    return brow ? { id: brow.id, name: brow.name, serviceKeys: brow.serviceKeys, tool: "brows" } : null;
  }
  if (tool === "beard") {
    const beard = beardById(id);
    return beard ? { id: beard.id, name: beard.name, serviceKeys: beard.serviceKeys, tool: "beard" } : null;
  }
  if (tool === "nails") {
    const nail = nailById(id);
    return nail ? { id: nail.id, name: nail.name, serviceKeys: nail.serviceKeys, tool: "nails" } : null;
  }
  const style = styleById(id);
  return style ? { id: style.id, name: style.name, serviceKeys: style.serviceKeys, tool: "style", gender: style.gender } : null;
}

export function faceGuidance(shape: string, gender: Gender) {
  const pool = gender === "kids"
    ? ["kids-soft-bob", "kids-bowl", "kids-curly-crop", "kids-pixie"]
    : gender === "men"
      ? ["mid-fade", "textured-crop", "quiff", "old-money", "korean-two-block"]
      : ["soft-bob", "butterfly-layers", "curtain-bangs", "wolf-cut", "pixie"];
  const styles = pool.map((id) => styleById(id)).filter((item) => item !== null);
  const ranked = recommendStyles(styles, shape, "wavy", 3);
  return {
    label: "Rule-based guidance from the shape you picked. This is not a measurement of a face.",
    styles: (ranked.length ? ranked : styles.slice(0, 3)).map((item) => ({ id: item.id, name: item.name })),
  };
}

export function colourGuidance(input: { grey: boolean; undertone: "warm" | "cool" | "neutral" }) {
  const ids = input.grey
    ? input.undertone === "cool" ? ["ash-brown", "blue-black", "espresso"] : ["chestnut", "caramel", "burgundy"]
    : input.undertone === "cool" ? ["blue-black", "jet-black", "ash-brown"] : ["chocolate-brown", "mahogany", "honey-blonde"];
  return {
    label: "Rule-based shade ideas from your answers. This is not a colour analysis of a photo.",
    shades: ids.map((id) => SHADES.find((shade) => shade.id === id)).filter((item) => item !== undefined).map((item) => ({ id: item.id, name: item.name })),
  };
}

export function quizGuidance(input: { who: Gender; length: string; texture: string; occasion: string }) {
  const women: Record<string, string[]> = {
    short: ["pixie", "french-bob", "soft-bob"],
    long: ["butterfly-layers", "beach-waves", "long-layers"],
    shoulder: ["soft-bob", "curtain-bangs", "lob"],
  };
  const men: Record<string, string[]> = {
    short: ["buzz-cut", "crew-cut", "french-crop"],
    office: ["old-money", "side-part", "classic-taper"],
    party: ["quiff", "pompadour", "textured-crop"],
  };
  let ids = ["soft-bob", "mid-fade"];
  if (input.who === "kids") ids = ["kids-soft-bob", "kids-curly-crop", "kids-bowl"];
  else if (input.who === "men") ids = input.occasion === "office" ? men.office : input.length === "short" ? men.short : men.party;
  else ids = input.length === "long" || input.texture === "wavy" ? women.long : input.length === "short" ? women.short : women.shoulder;
  const services = input.occasion === "wedding" ? ["haircut", "styling", "colour"] : input.texture === "curly" ? ["haircut", "styling"] : ["haircut"];
  return {
    label: "Rule-based ideas from the quiz. A stylist confirms the cut and the price.",
    styles: ids.map((id) => styleById(id)).filter((item) => item !== null).map((item) => ({ id: item.id, name: item.name })),
    serviceKeys: services,
  };
}
