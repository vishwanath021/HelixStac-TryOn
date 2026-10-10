import { NextResponse } from "next/server";
import { planById } from "@/data/plans";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET() {
  const access = await requireMembership();
  if ("error" in access && access.error) return access.error;
  if (!("tenant" in access)) return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  const plan = planById(access.tenant.plan);
  if (!plan.leadExport && access.tenant.status !== "TRIAL") {
    return NextResponse.json({ error: "PLAN", message: "CSV export is on Pro and Chain." }, { status: 403 });
  }
  const leads = await prisma.lead.findMany({ where: { tenantId: access.tenant.id }, orderBy: { createdAt: "desc" } });
  const lines = ["created,name,phone,look,shade,services,status,lang,src"];
  for (const lead of leads) {
    lines.push(
      [lead.createdAt.toISOString(), lead.name || "", lead.phone || "", lead.lookName, lead.shadeName || "", lead.services, lead.status, lead.lang, lead.src || ""]
        .map((cell) => csvCell(String(cell)))
        .join(","),
    );
  }
  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${access.tenant.slug}-leads.csv"`,
    },
  });
}
