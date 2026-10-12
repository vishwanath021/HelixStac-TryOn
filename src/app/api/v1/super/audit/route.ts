import { NextResponse } from "next/server";
import { listAudit } from "@/lib/super/audit";
import { requireSuper } from "@/lib/session";

export async function GET(req: Request) {
  const access = await requireSuper();
  if ("error" in access && access.error) return access.error;
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || "1");
  const action = url.searchParams.get("action") || "";
  const body = await listAudit({ action, page: Number.isFinite(page) ? page : 1 });
  return NextResponse.json(body);
}
