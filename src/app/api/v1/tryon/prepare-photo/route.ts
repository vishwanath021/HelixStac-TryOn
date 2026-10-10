import { NextResponse } from "next/server";
import { ImageError, previewJpeg } from "@/lib/images";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File)) return NextResponse.json({ error: "TYPE" }, { status: 400 });
  const jpeg = await previewJpeg(Buffer.from(await photo.arrayBuffer())).catch((error: unknown) => error);
  if (jpeg instanceof ImageError) {
    const status = jpeg.code === "SIZE" ? 413 : 415;
    return NextResponse.json({ error: jpeg.code }, { status });
  }
  if (!(jpeg instanceof Buffer)) return NextResponse.json({ error: "DECODE" }, { status: 415 });
  return new NextResponse(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
}
