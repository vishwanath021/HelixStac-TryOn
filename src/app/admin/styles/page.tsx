import { CatalogueEditor } from "@/components/admin/CatalogueEditor";
import { SHADES } from "@/data/shades";
import { STYLES, toPublicStyle } from "@/data/styles";
import { applySuitability } from "@/lib/hair-suitability";
import { prisma } from "@/lib/prisma";
import { ensureCatalogueStyles } from "@/lib/style-menu";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function StylesPage() {
  const { tenant } = await pageTenant();
  if (!tenant.productTryOn) {
    return (
      <main>
        <h1 className="page-title">Styles</h1>
        <p className="mt-3 text-sm">Try-on is turned off for this salon.</p>
      </main>
    );
  }
  await ensureCatalogueStyles(tenant.id);
  const [styleRows, shadeRows] = await Promise.all([
    prisma.tenantStyle.findMany({ where: { tenantId: tenant.id } }),
    prisma.tenantShade.findMany({ where: { tenantId: tenant.id } }),
  ]);
  return (
    <main>
      <h1 className="mb-2 page-title">Styles and shades</h1>
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
