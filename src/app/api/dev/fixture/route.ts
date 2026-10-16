import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORTRAITS = new Set(["glasses-beard.jpg", "malayali-beard.jpg", "bindi-smile.jpg"]);
const LIVE = new Set(["woman-long-dark.jpg", "man-beard-dark.jpg"]);

/** Still portraits for the live-look pixel test. Not available in production. */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not found", { status: 404 });
  const name = new URL(req.url).searchParams.get("name") || "";
  const folder = LIVE.has(name) ? "live" : PORTRAITS.has(name) ? "portraits" : "";
  if (!folder) return new NextResponse("Not found", { status: 404 });
  const file = await readFile(path.join(process.cwd(), "tests/fixtures", folder, name));
  return new NextResponse(new Uint8Array(file), {
    headers: { "content-type": "image/jpeg", "cache-control": "no-store" },
  });
}
