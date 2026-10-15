/** Owner extras stay in the product and stay off until an env flag is set. */
export const OWNER_FLAGS = {
  bookings: "FEATURE_BOOKINGS",
  salonAi: "FEATURE_SALON_AI",
  outlets: "FEATURE_OUTLETS",
  customDomain: "FEATURE_CUSTOM_DOMAIN",
  embed: "FEATURE_EMBED",
  concierge: "FEATURE_CONCIERGE",
  guide: "FEATURE_GUIDE",
  guestHub: "FEATURE_GUEST_HUB",
} as const;

export type OwnerFeatures = {
  bookings: boolean;
  salonAi: boolean;
  outlets: boolean;
  customDomain: boolean;
  embed: boolean;
  concierge: boolean;
  guide: boolean;
  guestHub: boolean;
};

export function envFlag(name: string, env: NodeJS.ProcessEnv = process.env) {
  const raw = (env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function ownerFeatures(env: NodeJS.ProcessEnv = process.env): OwnerFeatures {
  return {
    bookings: envFlag(OWNER_FLAGS.bookings, env),
    salonAi: envFlag(OWNER_FLAGS.salonAi, env),
    outlets: envFlag(OWNER_FLAGS.outlets, env),
    customDomain: envFlag(OWNER_FLAGS.customDomain, env),
    embed: envFlag(OWNER_FLAGS.embed, env),
    concierge: envFlag(OWNER_FLAGS.concierge, env),
    guide: envFlag(OWNER_FLAGS.guide, env),
    guestHub: envFlag(OWNER_FLAGS.guestHub, env),
  };
}

export type OwnerNavLink = { href: string; label: string; section: "main" | "more" };

/** Salon owner navigation. Try-on pages follow the salon product. Extras follow env flags. */
export function ownerNav(input: {
  role: string;
  slug: string;
  productTryOn: boolean;
  productQueue: boolean;
  features: OwnerFeatures;
  /** Hidden once the first-run wizard is finished. */
  onboardingDone?: boolean;
}): OwnerNavLink[] {
  const links: OwnerNavLink[] = [];
  if (input.onboardingDone === false) links.push({ href: "/admin/onboarding", label: "Onboarding", section: "main" });
  if (input.productQueue) links.push({ href: "/admin/queue", label: "Queue", section: "main" });
  links.push({ href: "/admin/leads", label: "Leads", section: "main" });
  if (input.productTryOn) links.push({ href: "/admin/qr", label: input.features.embed ? "QR and embed" : "QR", section: "main" });
  if (input.productTryOn) links.push({ href: "/admin/styles", label: "Styles", section: "more" });
  links.push({ href: "/admin/services", label: "Services", section: "more" });
  if (input.features.bookings) links.push({ href: "/admin/bookings", label: "Bookings", section: "more" });
  if (input.productTryOn && input.features.salonAi && input.role === "OWNER") {
    links.push({ href: "/admin/ai", label: "AI settings", section: "more" });
  }
  links.push({ href: "/admin/settings", label: "Settings", section: "more" });
  if (input.role === "OWNER") links.push({ href: "/admin/settings#team", label: "Team", section: "more" });
  links.push({ href: "/admin/billing", label: "Billing", section: "more" });
  if (input.role === "OWNER") links.push({ href: "/admin/security", label: "Security", section: "more" });
  return links;
}
