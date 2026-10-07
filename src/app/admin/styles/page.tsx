import { CatalogueEditor } from "@/components/admin/CatalogueEditor";
import { SHADES } from "@/data/shades";
import { STYLES, toPublicStyle } from "@/data/styles";
import { applySuitability } from "@/lib/hair-suitability";
import { prisma } from "@/lib/prisma";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function StylesPage() {
  const { tenant } = await pageTenant();
  const [styleRows, shadeRows] = await Promise.all([
    prisma.tenantStyle.findMany({ where: { tenantId: tenant.id } }),
    prisma.tenantShade.findMany({ where: { tenantId: tenant.id } }),
  ]);
  return (
    <main>
      <h1 className="mb-2 font-serif text-4xl">Styles and shades</h1>
      <p className="mb-4 text-sm text-muted">Prompts stay on the server. Guests see the style photo. Density and texture tags decide which photos the hair-type picker shows.</p>
      <CatalogueEditor
        styles={STYLES.map((style) => applySuitability(toPublicStyle(style), styleRows.find((row) => row.styleId === style.id)?.suitabilityJson || ""))}
        shades={SHADES.map(({ id, name, hex }) => ({ id, name, hex }))}
        enabledStyles={styleRows.filter((row) => row.enabled).map((row) => row.styleId)}
        enabledShades={shadeRows.filter((row) => row.enabled).map((row) => row.shadeId)}
      />
    </main>
  );
}
