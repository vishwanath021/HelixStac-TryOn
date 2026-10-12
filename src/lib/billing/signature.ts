import { createHmac, timingSafeEqual } from "node:crypto";

export function razorpaySignature(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyRazorpaySignature(rawBody: string, signature: string, secret: string) {
  if (!signature || !secret) return false;
  const expected = razorpaySignature(rawBody, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
