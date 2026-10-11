import { NextResponse } from "next/server";
import { requestClientIp, sharedRateLimit } from "@/lib/ratelimit";

export async function tooMany(req: Request, name: string, limit: number, windowMs: number) {
  const result = await sharedRateLimit(`${name}:${requestClientIp(req)}`, limit, windowMs);
  if (result.ok) return null;
  const retry = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  return NextResponse.json(
    { error: "RATE", message: "Too many requests. Try again shortly." },
    { status: 429, headers: { "retry-after": String(retry) } },
  );
}
