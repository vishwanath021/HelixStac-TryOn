import { isReservedSlug } from "@/lib/host";

export type CaddyKind = "apex" | "salon" | "custom" | "no";

/** Decide whether Caddy may ask Let's Encrypt for this hostname. */
export function caddyKind(domain: string, rootDomain: string, appHost: string): { kind: CaddyKind; slug?: string } {
  const host = domain.trim().toLowerCase().replace(/\.$/, "").split(":")[0] || "";
  if (!host || !/^[a-z0-9.-]+$/.test(host) || host.includes("..")) return { kind: "no" };
  const root = rootDomain.split(":")[0]?.trim().toLowerCase() || "";
  const apex = appHost.split(":")[0]?.trim().toLowerCase() || "";
  if (apex && (host === apex || host === `www.${apex}`)) return { kind: "apex" };
  const suffix = `.try.${root}`;
  if (root && root !== "localhost" && host.endsWith(suffix)) {
    const slug = host.slice(0, -suffix.length);
    if (!slug || slug.includes(".") || isReservedSlug(slug)) return { kind: "no" };
    return { kind: "salon", slug };
  }
  if (host === root || host === "localhost" || host === "127.0.0.1") return { kind: "no" };
  return { kind: "custom" };
}
