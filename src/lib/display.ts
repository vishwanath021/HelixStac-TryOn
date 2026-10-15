import { BEARDS } from "@/data/beards";
import { BROWS } from "@/data/brows";
import { NAILS } from "@/data/nails";
import { SHADES } from "@/data/shades";
import { styleById } from "@/data/styles";

/** Salon-owner and super-admin timestamps. The zone is Asia/Kolkata, labelled IST. */
export function formatIst(value: string | Date, withTime = true) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const text = date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
  return `${text} IST`;
}

/** AI spend uses two decimal places everywhere so ₹13.80 and ₹14.00 match. */
export function formatAiInr(value: number) {
  const amount = Number.isFinite(value) ? value : 0;
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function friendlyModel(id: string) {
  const model = id.trim();
  if (!model) return "—";
  if (model.includes("flux-3") || model.includes("flux/3")) return "FLUX";
  if (model.includes("nano-banana")) return "Gemini image";
  if (model.includes("seedream")) return "Seedream";
  if (model.includes("gpt-image-2")) return "GPT Image 2";
  if (model.includes("gpt-image-1.5")) return "GPT Image 1.5";
  if (model.includes("gpt-image-1-mini")) return "GPT Image mini";
  if (model === "gpt-image-1" || model.startsWith("gpt-image-1")) return "GPT Image (retiring)";
  return model;
}

function titleFromSlug(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Owner screens show "Curtain Bangs", not "curtain-bangs". */
export function humanLookName(value: string | null | undefined) {
  const raw = (value || "").trim();
  if (!raw) return "";
  const style = styleById(raw);
  if (style) return style.name;
  const brow = BROWS.find((item) => item.id === raw);
  if (brow) return brow.name;
  const beard = BEARDS.find((item) => item.id === raw);
  if (beard) return beard.name;
  const nail = NAILS.find((item) => item.id === raw);
  if (nail) return nail.name;
  const shade = SHADES.find((item) => item.id === raw);
  if (shade) return shade.name;
  if (raw === raw.toLowerCase() && /[-_]/.test(raw)) return titleFromSlug(raw);
  return raw;
}

export function humanShade(value: string | null | undefined) {
  const raw = (value || "").trim();
  if (!raw) return "";
  const shade = SHADES.find((item) => item.id === raw || item.name.toLowerCase() === raw.toLowerCase());
  if (shade) return shade.name;
  if (raw === raw.toLowerCase()) return titleFromSlug(raw);
  return raw;
}
