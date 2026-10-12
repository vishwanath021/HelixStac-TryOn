export type PlanId = "LITE" | "STARTER" | "PRO";

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

/** Price list. Edit this file to change names, ex-GST prices, and included tries.
 *  Invoices add 18% GST. Annual = 10× monthly (2 months free).
 */
export const PLANS: Record<PlanId, PlanDef> = {
  LITE: {
    id: "LITE",
    name: "Lite",
    monthlyExGst: 2999,
    setupExGst: 0,
    credits: 300,
    styleLimit: 25,
    customDomain: false,
    leadExport: false,
    removeBranding: false,
    embed: false,
    outlets: 1,
    languages: 2,
  },
  STARTER: {
    id: "STARTER",
    name: "Starter",
    monthlyExGst: 5999,
    setupExGst: 0,
    credits: 900,
    styleLimit: null,
    customDomain: true,
    leadExport: true,
    removeBranding: false,
    embed: true,
    outlets: 1,
    languages: null,
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    monthlyExGst: 10999,
    setupExGst: 0,
    credits: 1800,
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
  return value === "LITE" || value === "STARTER" || value === "PRO";
}

export function planById(id: string): PlanDef {
  if (isPlanId(id)) return PLANS[id];
  if (id === "CHAIN") return PLANS.PRO;
  return PLANS.LITE;
}
