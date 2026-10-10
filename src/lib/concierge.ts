export type ConciergeService = { name: string; priceInr: number; durationMin?: number | null };

const PRICE = ["price", "cost", "rate", "charge", "kitna", "कीमत", "दाम", "ದರ", "ಬೆಲೆ", "விலை", "ధర", "किंमत", "किती"];
const BOOK = ["book", "whatsapp", "appointment", "slot", "बुक", "अपॉइंट", "ಬುಕ್", "பதிவு", "బుక్"];
const PRIVACY = ["privacy", "photo", "store", "delete", "dpdp", "consent", "फोटो", "प्राइवेसी", "ಗೌಪ್ಯ", "தனியுரிமை", "గోప్య"];
const COLOUR = ["damage", "colour", "color", "balayage", "keratin", "रंग", "कलर", "ಬಣ್ಣ", "நிறம்", "రంగు"];
const KIDS = ["kid", "child", "baby", "बच्च", "ಮಕ್ಕಳ", "குழந்தை", "పిల్ల", "मुल"];

function hit(message: string, words: string[]) {
  const q = message.toLowerCase();
  return words.some((word) => q.includes(word.toLowerCase()));
}

export function answerConcierge(message: string, salon: { name: string; services: ConciergeService[]; address?: string }) {
  const menu = salon.services
    .map((service) => `${service.name} ₹${service.priceInr.toLocaleString("en-IN")}${service.durationMin ? ` (${service.durationMin} min)` : ""}`)
    .join("; ");
  if (hit(message, PRICE)) {
    return menu
      ? `${salon.name} lists: ${menu}. Prices are a starting guide and can change after a consultation.`
      : `${salon.name} has not published prices in the try-on yet. Ask on WhatsApp.`;
  }
  if (hit(message, BOOK)) {
    return `Tap “Book this look”. It opens WhatsApp to ${salon.name} with the style, colour, and suggested services filled in. The salon confirms the appointment.`;
  }
  if (hit(message, PRIVACY)) {
    return "Live colour stays on this phone. A style preview is processed in memory and the photo is not stored. You can withdraw consent on the privacy page. This is a product notice, not legal advice.";
  }
  if (hit(message, COLOUR)) {
    return "Live colour is a flat on-device tint, so it will not show highlights or how light lifts dark hair. Your stylist confirms whether a shade is realistic for your hair. A keratin or colour service is only a suggestion from the menu.";
  }
  if (hit(message, KIDS)) {
    return "Kids' styles are for a child with a parent or guardian present. The preview is a guide for the stylist, not a measurement.";
  }
  if (salon.address && hit(message, ["where", "address", "location", "time", "hour", "open", "पता", "ವಿಳಾಸ", "முகவரி"])) {
    return `${salon.name} is at ${salon.address}. Hours are confirmed on WhatsApp — this chat does not know today's roster.`;
  }
  return `I can answer from ${salon.name}'s menu: prices, booking, colour limits, and privacy. I am not a stylist, and I do not see your photo.`;
}
