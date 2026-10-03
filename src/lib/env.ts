export function brandName() {
  return process.env.BRAND_NAME || "HelixStac TryOn";
}

export function appBaseUrl() {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function rootDomain() {
  return process.env.ROOT_DOMAIN || "localhost";
}

export function aiProviderName() {
  const requested = (process.env.AI_PROVIDER || "mock").toLowerCase();
  if (requested === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if ((requested === "replicate" || requested === "fal") && (process.env.REPLICATE_API_TOKEN || process.env.FAL_KEY)) {
    return requested === "fal" ? "fal" : "replicate";
  }
  return "mock";
}

export function billingProviderName() {
  if ((process.env.BILLING_PROVIDER || "mock").toLowerCase() === "razorpay" && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    return "razorpay";
  }
  return "mock";
}

export function numberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
