import { GST_RATE } from "@/data/plans";

export function withGst(exGstInr: number) {
  const gstInr = Math.round(exGstInr * GST_RATE);
  return { exGstInr, gstInr, totalInr: exGstInr + gstInr };
}

/** Annual price is 10× monthly: two months free. */
export function annualExGst(monthlyExGst: number) {
  return monthlyExGst * 10;
}

export type CostAssumptions = {
  fxInrPerUsd: number;
  retryFactor: number;
  standardUsd: number;
  hdUsd: number;
  label: string;
};

export const DEFAULT_COST_ASSUMPTIONS: CostAssumptions = {
  fxInrPerUsd: 96,
  retryFactor: 1.08,
  standardUsd: 0.0336,
  hdUsd: 0.067,
  label: "Assumption: ₹96 per USD, 8% retries, Gemini paid-tier list prices as of 3 Oct 2026.",
};

export function assumedInr(usd: number, assumptions: CostAssumptions = DEFAULT_COST_ASSUMPTIONS) {
  const raw = usd * assumptions.fxInrPerUsd * assumptions.retryFactor;
  return Math.round(raw * 10) / 10;
}

export function previewCogsInr(standardCount: number, hdCount: number, standardInr = 3.5, hdInr = 7) {
  return standardCount * standardInr + hdCount * hdInr;
}

export function breakEvenAccounts(fixedCostInr: number, grossProfitPerAccount: number) {
  if (grossProfitPerAccount <= 0) return Infinity;
  return Math.ceil(fixedCostInr / grossProfitPerAccount);
}
