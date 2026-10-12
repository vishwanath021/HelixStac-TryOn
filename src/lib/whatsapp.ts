export type WhatsAppInput = {
  phone: string;
  salonName: string;
  lookName: string;
  shadeName?: string | null;
  services: { name: string; priceInr: number }[];
  lang?: string;
};

const INTRO: Record<string, string> = {
  en: "Hi {salon}, I tried a look on your try-on page and I would like to book it.",
  hi: "नमस्ते {salon}, मैंने आपके ट्राई-ऑन पर एक लुक आज़माया है और उसे बुक करना चाहता/चाहती हूँ।",
  kn: "ನಮಸ್ಕಾರ {salon}, ನಿಮ್ಮ ಟ್ರೈ-ಆನ್‌ನಲ್ಲಿ ಒಂದು ಲುಕ್ ನೋಡಿದ್ದೇನೆ ಮತ್ತು ಅದನ್ನು ಬುಕ್ ಮಾಡಲು ಇಚ್ಛಿಸುತ್ತೇನೆ.",
  ta: "வணக்கம் {salon}, உங்கள் ட்ரை-ஆனில் ஒரு லுக்கை பார்த்தேன். அதை பதிவு செய்ய விரும்புகிறேன்.",
  te: "నమస్తే {salon}, మీ ట్రై-ఆన్‌లో ఒక లుక్ చూశాను. దాన్ని బుక్ చేయాలనుకుంటున్నాను.",
  mr: "नमस्कार {salon}, मी तुमच्या ट्राय-ऑनवर एक लुक पाहिला आहे आणि तो बुक करू इच्छितो/इच्छिते.",
};

export function normalizeWhatsAppPhone(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function buildWhatsAppText(input: WhatsAppInput) {
  const intro = (INTRO[input.lang || "en"] ?? INTRO.en).replace("{salon}", input.salonName);
  const lines = [intro, `Look: ${input.lookName}`];
  if (input.shadeName) lines.push(`Colour: ${input.shadeName}`);
  if (input.services.length) {
    const priced = input.services.map((service) => `${service.name} (₹${service.priceInr.toLocaleString("en-IN")})`).join(", ");
    lines.push(`Suggested services: ${priced}`);
  }
  lines.push("This preview is a guide. Please confirm the cut in the salon.");
  return lines.join("\n");
}

export function buildWhatsAppLink(input: WhatsAppInput) {
  const phone = normalizeWhatsAppPhone(input.phone);
  const text = buildWhatsAppText(input);
  if (!phone) return { phone: "", text, url: "" };
  return { phone, text, url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` };
}
