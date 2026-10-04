import type { UsageNumbers } from "@/lib/ai/tiers";

/** The provider rejected the model id. Do not call it again. */
export class UnknownModelError extends Error {
  readonly code = "UNKNOWN_MODEL" as const;

  constructor(message = "The image model is not available.") {
    super(message);
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

/**
 * The request was sent and the process did not get a definitive unbilled failure.
 * A timeout, a dropped connection, or a 5xx leaves the bill unknown. Do not call again.
 */
export class UncertainBillingError extends Error {
  readonly code = "UNCERTAIN_BILLING" as const;

  constructor(message = "The provider outcome is unknown. No second generation was started.") {
    super(message);
    this.name = "UncertainBillingError";
  }
}

/** The provider answered with a refusal before an image existed. The reservation can be released. */
export class UnbilledProviderError extends Error {
  readonly code = "UNBILLED_PROVIDER" as const;

  constructor(message: string) {
    super(message);
    this.name = "UnbilledProviderError";
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
