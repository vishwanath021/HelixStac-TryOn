import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { appBaseUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") || "";
  const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return NextResponse.json({ error: "TENANT" }, { status: 404 });
  const target = `${appBaseUrl()}/s/${tenant.slug}?src=qr`;
  if (format === "svg") {
    const svg = await QRCode.toString(target, { type: "svg", margin: 1, color: { dark: "#12312e", light: "#ffffff" } });
    return new NextResponse(svg, {
      headers: {
        "content-type": "image/svg+xml",
        "content-disposition": `attachment; filename="${tenant.slug}-qr.svg"`,
      },
    });
  }
  const png = await QRCode.toBuffer(target, { type: "png", width: 640, margin: 1, color: { dark: "#12312e", light: "#ffffff" } });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-disposition": `attachment; filename="${tenant.slug}-qr.png"`,
    },
  });
}
