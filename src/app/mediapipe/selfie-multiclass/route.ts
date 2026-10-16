import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Selfie multiclass segmenter: hair, body-skin, face-skin, clothes. Served locally, not from a CDN. */
export async function GET() {
  const file = await readFile(path.join(process.cwd(), "assets/vision/selfie_multiclass_256x256.tflite"));
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "application/octet-stream",
      "cache-control": "public, max-age=86400",
    },
  });
}
