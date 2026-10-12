/** A labelled sample is not a successful paid hairstyle. Placement is a refusal. Only a real edit commits credits. */
export function salonOutcome(demoReason?: string) {
  if (demoReason === "placement") return { status: "FAILED" as const, commit: false, placement: true };
  if (demoReason) return { status: "DEMO" as const, commit: false, placement: false };
  return { status: "SUCCEEDED" as const, commit: true, placement: false };
}

/** Headers a guest is allowed to see. No model, provider, or cost. */
export function guestPreviewHeaders(args: { tryOnId: string; creditsLeft: number; demoReason?: string }) {
  return {
    "content-type": "image/jpeg",
    "cache-control": "no-store",
    "x-tryon-id": args.tryOnId,
    "x-credits-left": String(args.creditsLeft),
    "x-demo-reason": args.demoReason || "",
  };
}
