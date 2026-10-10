import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same face landmarker the hair composite uses. Served from this app so the browser does not call a CDN. */
export async function GET() {
  const file = await readFile(path.join(process.cwd(), "assets/vision/face_landmarker.task"));
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "application/octet-stream",
      "cache-control": "public, max-age=86400",
    },
  });
}
