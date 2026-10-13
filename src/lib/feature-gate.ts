import { NextResponse } from "next/server";
import { ownerFeatures } from "@/lib/features";

export function closedGuestHub() {
  if (ownerFeatures().guestHub) return null;
  return NextResponse.json({ error: "OFF", message: "Guest login is not available." }, { status: 404 });
}
