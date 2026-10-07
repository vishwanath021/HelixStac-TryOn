import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { appBaseUrl } from "@/lib/env";
import { newSalonNonce, signSalonToken } from "@/lib/preview-access";
import { prisma } from "@/lib/prisma";
import { requireMembership, requireOwner } from "@/lib/session";

function salonUrl(slug: string, tenantId: string, nonce: string) {
  if (!nonce) return "";
  const token = signSalonToken(tenantId, nonce);
  return `${appBaseUrl()}/s/${slug}?salon=${token}`;
}

export async function GET() {
  const access = await requireMembership();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const url = salonUrl(access.tenant.slug, access.tenant.id, access.tenant.salonNonce);
  return NextResponse.json({ url });
}

export async function POST() {
  const access = await requireOwner();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const nonce = newSalonNonce();
  await prisma.tenant.update({ where: { id: access.tenant.id }, data: { salonNonce: nonce } });
  const url = salonUrl(access.tenant.slug, access.tenant.id, nonce);
  const png = await QRCode.toBuffer(url, { type: "png", width: 480, margin: 1, color: { dark: "#12312e", light: "#ffffff" } });
  return NextResponse.json({ url, qr: `data:image/png;base64,${png.toString("base64")}` });
}
