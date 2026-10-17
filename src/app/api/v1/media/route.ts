import { NextResponse } from "next/server";
import { isPublicMediaKey } from "@/lib/bridal-own";
import { getObject, verifyObjectSig } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Signed local-disk preview. S3 deployments use provider signed URLs instead. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  const exp = Number(url.searchParams.get("exp") || 0);
  const sig = url.searchParams.get("sig") || "";
  if (!isPublicMediaKey(key)) {
    return NextResponse.json({ error: "KEY" }, { status: 404 });
  }
  if (!verifyObjectSig(key, exp, sig)) return NextResponse.json({ error: "SIGNATURE" }, { status: 403 });
  const body = await getObject(key);
  if (!body) return NextResponse.json({ error: "MISSING" }, { status: 404 });
  const type = key.endsWith(".json") ? "application/json" : key.endsWith(".png") ? "image/png" : "image/jpeg";
  return new NextResponse(new Uint8Array(body), { headers: { "content-type": type, "cache-control": "private, no-store" } });
}
