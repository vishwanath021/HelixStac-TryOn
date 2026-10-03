import type { UsageNumbers } from "@/lib/ai/tiers";

/** The provider rejected the model id. Do not call it again. */
export class UnknownModelError extends Error {
  readonly code = "UNKNOWN_MODEL" as const;

  constructor() {
    super("The image model is not available.");
    this.name = "UnknownModelError";
  }
}

/** The INR cap would be exceeded. Do not call the provider. */
export class SpendCapError extends Error {
  readonly code = "SPEND_CAP" as const;

  constructor() {
    super("The testing spend cap is reached.");
    this.name = "SpendCapError";
  }
}

/** The provider accepted the call (and may have billed it) but returned no usable image. */
export class BilledProviderError extends Error {
  readonly code = "BILLED_PROVIDER" as const;
  readonly costUsd: number;
  readonly usage?: UsageNumbers;

  constructor(costUsd: number, usage?: UsageNumbers) {
    super("The provider billed the call and returned no image.");
    this.name = "BilledProviderError";
    this.costUsd = costUsd;
    this.usage = usage;
  }
}

export function isUnknownModelResponse(status: number, body: string) {
  if (status !== 400 && status !== 404) return false;
  return /model_not_found|invalid_model|unknown model|does not exist|is not found|not a valid model|not supported/i.test(body);
}
