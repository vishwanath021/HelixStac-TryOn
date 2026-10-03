import { planById } from "@/data/plans";
import { SHADES } from "@/data/shades";
import { STYLES, toPublicStyle, type PublicStyle } from "@/data/styles";
import { parseJson } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export type SalonService = {
  id: string;
  key: string;
  name: string;
  nameI18n: Record<string, string>;
  priceInr: number;
  durationMin: number | null;
};

export type SalonConfig = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  languages: string[];
  defaultLang: string;
  whatsapp: string;
  address: string;
  mapsUrl: string;
  city: string;
  plan: string;
  status: string;
  removeBranding: boolean;
  creditBalance: number;
  showMen: boolean;
  showWomen: boolean;
  showKids: boolean;
  services: SalonService[];
  styles: PublicStyle[];
  shades: { id: string; name: string; hex: string; lift: number; serviceKeys: string[] }[];
  outlets: { id: string; name: string; whatsapp: string; address: string; mapsUrl: string; isPrimary: boolean }[];
  poweredBy: boolean;
};

type TenantWithRelations = NonNullable<Awaited<ReturnType<typeof tenantQuery>>>;

function tenantQuery(where: { slug: string } | { id: string }) {
  return prisma.tenant.findUnique({
    where,
    include: {
      services: { where: { active: true }, orderBy: { priceInr: "asc" } },
      styles: true,
      shades: true,
      outlets: { orderBy: { isPrimary: "desc" } },
    },
  });
}

export async function loadTenantBySlug(slug: string) {
  return tenantQuery({ slug });
}

export async function loadTenantByHost(host: string) {
  const domain = await prisma.domain.findUnique({ where: { host: host.toLowerCase() } });
  if (!domain?.verified) return null;
  return tenantQuery({ id: domain.tenantId });
}

export function toSalonConfig(tenant: TenantWithRelations): SalonConfig {
  const plan = planById(tenant.plan);
  const enabledStyles = new Set(tenant.styles.filter((row) => row.enabled).map((row) => row.styleId));
  const customNames = new Map(tenant.styles.map((row) => [row.styleId, row.customName]));
  let styles = STYLES.filter((style) => enabledStyles.has(style.id)).map((style) => {
    const pub = toPublicStyle(style);
    const custom = customNames.get(style.id);
    return custom ? { ...pub, name: custom } : pub;
  });
  if (!tenant.showWomen) styles = styles.filter((style) => style.gender !== "women");
  if (!tenant.showMen) styles = styles.filter((style) => style.gender !== "men");
  if (!tenant.showKids) styles = styles.filter((style) => style.gender !== "kids");
  if (plan.styleLimit) styles = styles.slice(0, plan.styleLimit);
  const enabledShades = new Set(tenant.shades.filter((row) => row.enabled).map((row) => row.shadeId));
  const shades = SHADES.filter((shade) => enabledShades.has(shade.id)).map(({ id, name, hex, lift, serviceKeys }) => ({
    id,
    name,
    hex,
    lift,
    serviceKeys,
  }));
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.primaryColor,
    accentColor: tenant.accentColor,
    languages: parseJson<string[]>(tenant.languages, ["en"]),
    defaultLang: tenant.defaultLang,
    whatsapp: tenant.whatsapp,
    address: tenant.address,
    mapsUrl: tenant.mapsUrl,
    city: tenant.city,
    plan: tenant.plan,
    status: tenant.status,
    removeBranding: tenant.removeBranding && plan.removeBranding,
    creditBalance: tenant.creditBalance,
    showMen: tenant.showMen,
    showWomen: tenant.showWomen,
    showKids: tenant.showKids,
    services: tenant.services.map((service) => ({
      id: service.id,
      key: service.key,
      name: service.name,
      nameI18n: parseJson<Record<string, string>>(service.nameI18n, {}),
      priceInr: service.priceInr,
      durationMin: service.durationMin,
    })),
    styles,
    shades,
    outlets: tenant.outlets.map((outlet) => ({
      id: outlet.id,
      name: outlet.name,
      whatsapp: outlet.whatsapp,
      address: outlet.address,
      mapsUrl: outlet.mapsUrl,
      isPrimary: outlet.isPrimary,
    })),
    poweredBy: !(tenant.removeBranding && plan.removeBranding),
  };
}

export function servicesForLook(config: SalonConfig, serviceKeys: string[]) {
  const keys = new Set(serviceKeys);
  return config.services.filter((service) => keys.has(service.key));
}
