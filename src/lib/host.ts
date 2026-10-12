const RESERVED = new Set(["by-host", "admin", "api", "embed", "login", "privacy", "terms", "super", "www", "app", "s"]);

export type HostParse =
  | { kind: "platform"; host: string }
  | { kind: "subdomain"; host: string; slug: string }
  | { kind: "custom"; host: string };

export function parseHost(hostHeader: string, rootDomain = "localhost", appDomain = ""): HostParse {
  const host = hostHeader.split(":")[0]?.trim().toLowerCase() || "";
  const root = rootDomain.split(":")[0]?.trim().toLowerCase() || "localhost";
  const app = appDomain.split(":")[0]?.trim().toLowerCase();
  if (!host || host === root || (app && (host === app || host === `www.${app}`)) || host === "localhost" || host === "127.0.0.1" || host === `www.${root}` || host === `app.${root}`) {
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

function platformHostname(value: string | undefined) {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    if (raw.includes("://")) return new URL(raw).hostname;
  } catch {
    return "";
  }
  return raw.split("/")[0]?.split(":")[0] || "";
}

/** APP_DOMAIN, ROOT_DOMAIN, and any host under them. */
export function isPlatformHost(host: string, env: { APP_DOMAIN?: string; ROOT_DOMAIN?: string } = process.env) {
  const name = host.trim().toLowerCase().replace(/\.$/, "").split(":")[0] || "";
  if (!name) return false;
  const roots = [platformHostname(env.APP_DOMAIN), platformHostname(env.ROOT_DOMAIN)].filter(Boolean);
  return roots.some((root) => name === root || name.endsWith(`.${root}`));
}
