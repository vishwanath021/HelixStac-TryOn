export const OWNER_PLAN_MESSAGE = "Contact Lookuvi to activate your plan";

/** Production with mock billing cannot let an owner grant a plan or credits. Razorpay stays open. */
export function ownerSelfServeBlocked(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return false;
  const provider = (env.BILLING_PROVIDER || "mock").toLowerCase();
  if (provider === "razorpay" && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) return false;
  return true;
}
