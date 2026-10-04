/** Explicit test switch. Off unless a super-admin asks, or this process flag is on. */
export function referenceModeEnvOn() {
  const raw = (process.env.TRYON_REFERENCE_MODE || "").trim().toLowerCase();
  return raw === "on" || raw === "1" || raw === "true" || raw === "yes";
}

/** The salon page renders the switch only for a signed-in super-admin. Guests never see it. */
export function showReferenceToggle(isSuperAdmin: boolean) {
  return isSuperAdmin;
}

/**
 * Hairstyles only. A request is ignored unless it is explicit.
 * A super-admin session may send it. TRYON_REFERENCE_MODE=on may also authorize it on a private machine.
 * The flag does not turn the path on by itself, and it does not show the switch to guests.
 */
export function referenceModeActive(args: { isSuperAdmin: boolean; requested: boolean; tool: string }) {
  if (args.tool !== "style") return false;
  if (!args.requested) return false;
  return args.isSuperAdmin || referenceModeEnvOn();
}

/** Second switch. It does nothing unless reference mode itself is active. */
export function hairCompositeRequested(reference: boolean, requested: boolean) {
  return reference && requested;
}
