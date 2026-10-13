import { NextResponse } from "next/server";
import { z } from "zod";
import { queueJson } from "@/lib/queue/http";
import { joinQueue, publicBoard } from "@/lib/queue/service";
import { requestClientIp } from "@/lib/ratelimit";

const joinSchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().max(80),
  phone: z.string().max(20),
  serviceId: z.string().max(40).optional(),
  consent: z.boolean(),
  requestedDate: z.string().max(10).optional(),
  requestedSlot: z.string().max(5).optional(),
});

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ error: "INVALID", message: "Salon is required." }, { status: 400 });
  try {
    return NextResponse.json(await publicBoard(slug));
  } catch (error) {
    const response = queueJson(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(req: Request) {
  const parsed = joinSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID", message: "Check the name and phone." }, { status: 400 });
  try {
    const ticket = await joinQueue({ ...parsed.data, ip: requestClientIp(req) });
    return NextResponse.json(ticket);
  } catch (error) {
    const response = queueJson(error);
    if (response) return response;
    throw error;
  }
}
