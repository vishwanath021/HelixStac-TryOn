import { NextResponse } from "next/server";
import { queueJson } from "@/lib/queue/http";
import { guestTicket } from "@/lib/queue/service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") || "";
  const ref = url.searchParams.get("ref") || "";
  if (!slug || !ref) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  try {
    return NextResponse.json(await guestTicket(slug, ref));
  } catch (error) {
    const response = queueJson(error);
    if (response) return response;
    throw error;
  }
}
