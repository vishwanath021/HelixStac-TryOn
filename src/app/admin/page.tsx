import { redirect } from "next/navigation";
import { pageTenant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const { tenant } = await pageTenant();
  redirect(tenant.productQueue ? "/admin/queue" : "/admin/leads");
}
