import { appBaseUrl, rootDomain } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/** `<slug>.try.ROOT_DOMAIN`, or the salon's verified custom domain when it has one. */
export function salonPublicOrigin(slug: string, verifiedHost?: string | null) {
  const scheme = appBaseUrl().startsWith("http://") ? "http" : "https";
  const custom = verifiedHost?.trim().toLowerCase();
  if (custom) return `${scheme}://${custom}`;
  const root = rootDomain().split(":")[0]?.trim().toLowerCase() || "localhost";
  return `${scheme}://${slug}.try.${root}`;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/** A printed QR must not point at this computer. */
export function isLocalSalonHost(host: string) {
  const name = host.split(":")[0]?.trim().toLowerCase().replace(/^\[|\]$/g, "") || "";
  return !name || LOCAL_HOSTS.has(name) || name.endsWith(".localhost") || name.endsWith(".local");
}

/** Landing page on the salon host: Join queue and Try a look. Empty when the host is local. */
export function salonWelcomeLink(origin: string) {
  let host = "";
  let url = "";
  try {
    const parsed = new URL(`${origin.replace(/\/$/, "")}/welcome`);
    host = parsed.hostname;
    url = parsed.toString().replace(/\/$/, "");
  } catch {
    host = "";
  }
  const local = isLocalSalonHost(host);
  return { url: local ? "" : url, local, host };
}

export async function salonGuestOrigin(tenantId: string, slug: string) {
  const custom = await prisma.domain.findFirst({
    where: { tenantId, verified: true },
    orderBy: { host: "asc" },
    select: { host: true },
  });
  return salonPublicOrigin(slug, custom?.host);
}

export async function salonWelcomeTarget(tenantId: string, slug: string) {
  return salonWelcomeLink(await salonGuestOrigin(tenantId, slug));
}
