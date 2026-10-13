import { NextResponse } from "next/server";
import { z } from "zod";
import { queueJson } from "@/lib/queue/http";
import { guestVisit } from "@/lib/queue/service";
import { requestClientIp } from "@/lib/ratelimit";

const schema = z.object({
  slug: z.string().min(1),
  ref: z.string().min(8).max(80),
  action: z.enum(["way", "cancel"]),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  try {
    return NextResponse.json(await guestVisit({ ...parsed.data, ip: requestClientIp(req) }));
  } catch (error) {
    const response = queueJson(error);
    if (response) return response;
    throw error;
  }
}
