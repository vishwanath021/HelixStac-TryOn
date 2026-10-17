import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { tooMany } from "@/lib/http/guard";
import { prisma } from "@/lib/prisma";
import { salonWelcomeTarget } from "@/lib/public-url";

export async function GET(req: Request) {
  const limited = await tooMany(req, "qr", 60, 60 * 60 * 1000);
  if (limited) return limited;
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") || "";
  const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) return NextResponse.json({ error: "TENANT" }, { status: 404 });
  const target = await salonWelcomeTarget(tenant.id, tenant.slug);
  if (target.local || !target.url) {
    return NextResponse.json({ error: "LOCAL_DOMAIN", message: "Set a real salon domain before printing the QR." }, { status: 409 });
  }
  if (format === "svg") {
    const svg = await QRCode.toString(target.url, { type: "svg", margin: 1, color: { dark: "#12312e", light: "#ffffff" } });
    return new NextResponse(svg, {
      headers: {
        "content-type": "image/svg+xml",
        "content-disposition": `attachment; filename="${tenant.slug}-qr.svg"`,
      },
    });
  }
  const png = await QRCode.toBuffer(target.url, { type: "png", width: 640, margin: 1, color: { dark: "#12312e", light: "#ffffff" } });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "content-disposition": `attachment; filename="${tenant.slug}-qr.png"`,
    },
  });
}
