import { NextResponse } from "next/server";
import { QueueError } from "@/lib/queue/service";

export function queueJson(error: unknown) {
  if (error instanceof QueueError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  }
  return null;
}
