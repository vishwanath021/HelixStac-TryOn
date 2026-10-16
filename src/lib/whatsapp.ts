export type WhatsAppInput = {
  phone: string;
  salonName: string;
  lookName: string;
  shadeName?: string | null;
  services: { name: string; priceInr: number }[];
  lang?: string;
  lookUrl?: string | null;
};

const INTRO: Record<string, string> = {
  en: "Hi! I'd like to book this look: {look}.",
  hi: "नमस्ते! मैं यह लुक बुक करना चाहता/चाहती हूँ: {look}.",
  kn: "ನಮಸ್ಕಾರ! ನಾನು ಈ ಲುಕ್ ಬುಕ್ ಮಾಡಲು ಇಚ್ಛಿಸುತ್ತೇನೆ: {look}.",
  ta: "வணக்கம்! இந்த லுக்கை பதிவு செய்ய விரும்புகிறேன்: {look}.",
  te: "నమస్తే! ఈ లుక్‌ను బుక్ చేయాలనుకుంటున్నాను: {look}.",
  mr: "नमस्कार! मला हा लुक बुक करायचा आहे: {look}.",
};

export function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function buildWhatsAppText(input: WhatsAppInput) {
  const look = input.shadeName ? `${input.lookName} (${input.shadeName})` : input.lookName;
  const intro = (INTRO[input.lang || "en"] ?? INTRO.en).replace("{look}", look);
  return input.lookUrl ? `${intro} ${input.lookUrl}` : intro;
}

export function buildBridalTrialText(input: {
  name: string;
  eventLabel: string;
  eventDate: string;
  looks: string[];
  urls: string[];
}) {
  const who = input.name.trim() ? `${input.name.trim()}: ` : "";
  const looks = input.looks.filter(Boolean).join(", ") || "a bridal look";
  const links = input.urls.filter(Boolean).join(" ");
  const core = `Hi! ${who}I'd like a bridal trial for my ${input.eventLabel} on ${input.eventDate}. Looks: ${looks}.`;
  return links ? `${core} ${links}` : core;
}

export function buildWhatsAppLink(input: WhatsAppInput) {
  const phone = normalizeWhatsAppPhone(input.phone);
  const text = buildWhatsAppText(input);
  if (!phone) return { phone: "", text, url: "" };
  return { phone, text, url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` };
}
