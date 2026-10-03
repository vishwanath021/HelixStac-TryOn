export type PlanId = "STARTER" | "PRO" | "CHAIN";

export type PlanDef = {
  id: PlanId;
  name: string;
  monthlyExGst: number;
  setupExGst: number;
  credits: number;
  styleLimit: number | null;
  customDomain: boolean;
  leadExport: boolean;
  removeBranding: boolean;
  embed: boolean;
  outlets: number;
  languages: number | null;
};

/** Prices are INR, exclusive of GST. GST is 18% and added on the invoice. Annual = 10× monthly (2 months free). */
export const PLANS: Record<PlanId, PlanDef> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    monthlyExGst: 799,
    setupExGst: 0,
    credits: 100,
    styleLimit: 25,
    customDomain: false,
    leadExport: false,
    removeBranding: false,
    embed: false,
    outlets: 1,
    languages: 2,
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    monthlyExGst: 1999,
    setupExGst: 2999,
    credits: 300,
    styleLimit: null,
    customDomain: true,
    leadExport: true,
    removeBranding: true,
    embed: true,
    outlets: 1,
    languages: null,
  },
  CHAIN: {
    id: "CHAIN",
    name: "Chain / White-label",
    monthlyExGst: 4999,
    setupExGst: 9999,
    credits: 600,
    styleLimit: null,
    customDomain: true,
    leadExport: true,
    removeBranding: true,
    embed: true,
    outlets: 3,
    languages: null,
  },
};

export const CREDIT_PACKS = [
  { id: "pack100", credits: 100, priceExGst: 799 },
  { id: "pack500", credits: 500, priceExGst: 3499 },
  { id: "pack2000", credits: 2000, priceExGst: 11999 },
] as const;

export const HD_CREDIT_COST = 2;
export const STANDARD_CREDIT_COST = 1;
export const TRIAL_DAYS = 14;
export const GST_RATE = 0.18;

export function isPlanId(value: string): value is PlanId {
  return value === "STARTER" || value === "PRO" || value === "CHAIN";
}

export function planById(id: string): PlanDef {
  return isPlanId(id) ? PLANS[id] : PLANS.STARTER;
}
