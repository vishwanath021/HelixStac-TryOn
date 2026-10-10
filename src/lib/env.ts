export function brandName() {
  return process.env.BRAND_NAME || "Lookuvi";
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
  if (requested === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if ((requested === "replicate" || requested === "fal") && (process.env.REPLICATE_API_TOKEN || process.env.FAL_KEY)) {
    return requested === "fal" ? "fal" : "replicate";
  }
  return "mock";
}

export function usingDemoProvider() {
  return aiProviderName() === "mock";
}

export function billingProviderName() {
  if ((process.env.BILLING_PROVIDER || "mock").toLowerCase() === "razorpay" && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    return "razorpay";
  }
  return "mock";
}

/** Problems that must stop a production process before it serves traffic. */
export function productionEnvProblems(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is required");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 16) problems.push("AUTH_SECRET must be at least 16 characters");
  if (env.AUTH_TRUST_HOST !== "true") problems.push("AUTH_TRUST_HOST must be true");
  if (!env.APP_BASE_URL) problems.push("APP_BASE_URL is required");
  if (env.ALLOW_DEV_MAGIC_LINK === "true") problems.push("ALLOW_DEV_MAGIC_LINK must be off in production");
  if (env.ALLOW_DEV_OTP === "true") problems.push("ALLOW_DEV_OTP must be off in production");
  return problems;
}

export function numberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
