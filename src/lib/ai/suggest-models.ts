/**
 * Cheap OpenAI vision models that accept an image and a strict json_schema.
 * Prices are USD per 1M tokens. Checked 7 Oct 2026.
 * gpt-4.1-nano: https://developers.openai.com/api/docs/models/gpt-4.1-nano
 * gpt-4.1-mini: https://developers.openai.com/api/docs/models/gpt-4.1-mini
 * gpt-4o-mini: https://developers.openai.com/api/docs/models/gpt-4o-mini
 * Pricing page: https://developers.openai.com/api/docs/pricing
 * Structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
 * Image input is billed as input tokens on these models.
 */
export const SUGGEST_MODELS = {
  "gpt-4.1-nano": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  "gpt-4.1-mini": { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
} as const;

export type SuggestModelId = keyof typeof SUGGEST_MODELS;

export const DEFAULT_SUGGEST_MODEL: SuggestModelId = "gpt-4.1-nano";

/** Reserved estimate only. A finished call uses the returned prompt and completion counts. */
export const SUGGEST_INPUT_ALLOWANCE = 2000;
export const SUGGEST_OUTPUT_ALLOWANCE = 300;

export function suggestRates(model: string) {
  if (model in SUGGEST_MODELS) return SUGGEST_MODELS[model as SuggestModelId];
  return null;
}

export function resolveSuggestModel(raw?: string | null): SuggestModelId | null {
  const id = (raw ?? process.env.SUGGEST_MODEL ?? DEFAULT_SUGGEST_MODEL).trim();
  if (!id) return DEFAULT_SUGGEST_MODEL;
  return suggestRates(id) ? (id as SuggestModelId) : null;
}

export function suggestEstimateUsd(model: SuggestModelId) {
  const rates = SUGGEST_MODELS[model];
  const usd = (SUGGEST_INPUT_ALLOWANCE * rates.inputPerMillion + SUGGEST_OUTPUT_ALLOWANCE * rates.outputPerMillion) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
