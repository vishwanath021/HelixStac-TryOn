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

export async function salonGuestOrigin(tenantId: string, slug: string) {
  const custom = await prisma.domain.findFirst({
    where: { tenantId, verified: true },
    orderBy: { host: "asc" },
    select: { host: true },
  });
  return salonPublicOrigin(slug, custom?.host);
}
