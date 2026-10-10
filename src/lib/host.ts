const RESERVED = new Set(["by-host", "admin", "api", "embed", "login", "privacy", "terms", "super", "www", "app", "s"]);

export type HostParse =
  | { kind: "platform"; host: string }
  | { kind: "subdomain"; host: string; slug: string }
  | { kind: "custom"; host: string };

export function parseHost(hostHeader: string, rootDomain = "localhost"): HostParse {
  const host = hostHeader.split(":")[0]?.trim().toLowerCase() || "";
  const root = rootDomain.split(":")[0]?.trim().toLowerCase() || "localhost";
  if (!host || host === root || host === "localhost" || host === "127.0.0.1" || host === `www.${root}` || host === `app.${root}`) {
    return { kind: "platform", host };
  }
  if (host.endsWith(".localhost")) {
    const slug = host.slice(0, -".localhost".length);
    if (slug && !slug.includes(".") && !RESERVED.has(slug)) return { kind: "subdomain", host, slug };
  }
  const suffix = `.try.${root}`;
  if (root !== "localhost" && host.endsWith(suffix)) {
    const slug = host.slice(0, -suffix.length);
    if (slug && !slug.includes(".") && !RESERVED.has(slug)) return { kind: "subdomain", host, slug };
  }
  return { kind: "custom", host };
}

export function isReservedSlug(slug: string) {
  return RESERVED.has(slug);
}
