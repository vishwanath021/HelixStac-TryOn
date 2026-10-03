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
