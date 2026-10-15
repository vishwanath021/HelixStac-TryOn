import { prisma } from "@/lib/prisma";

export const AUDIT_PAGE_SIZE = 20;

const LABELS: Record<string, string> = {
  TENANT_CREATE: "Salon created",
  TENANT_UPDATE: "Salon updated",
  PLAN_ASSIGN: "Plan changed",
  CREDIT_ADJUST: "Credits adjusted",
  PASSWORD_CHANGE: "Password changed",
  TEAM_REMOVE: "Staff removed",
  AI_KEY_UPDATE: "AI key update",
};

export function auditLabel(action: string) {
  return LABELS[action] || action;
}

function readMeta(meta: string) {
  try {
    const data = JSON.parse(meta) as Record<string, unknown>;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** Provider for a key change, or the field names on a salon update. */
export function auditDetail(action: string, meta: string) {
  const data = readMeta(meta);
  if (action === "AI_KEY_UPDATE") return typeof data.provider === "string" ? data.provider : "";
  if (action === "TENANT_UPDATE") return Object.keys(data).filter((key) => data[key] !== undefined).join(", ");
  return "";
}

export async function listAudit(input: { action?: string; page?: number; tenantId?: string }) {
  const action = input.action?.trim() || "";
  const tenantId = input.tenantId?.trim() || "";
  const page = Math.max(1, Math.floor(input.page || 1));
  const where = {
    ...(action ? { action } : {}),
    ...(tenantId ? { target: tenantId } : {}),
  };
  const [total, rows, actions, salons] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const actorIds = [...new Set(rows.map((row) => row.actorId))];
  const targetIds = [...new Set(rows.map((row) => row.target))];
  const [users, targets] = await Promise.all([
    actorIds.length
      ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
      : Promise.resolve([]),
    targetIds.length
      ? prisma.tenant.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const emails = new Map(users.map((user) => [user.id, user.email]));
  const names = new Map(targets.map((tenant) => [tenant.id, tenant.name]));
  return {
    page,
    pageSize: AUDIT_PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    actions: actions.map((row) => row.action),
    salons,
    items: rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actorEmail: emails.get(row.actorId) || "",
      action: row.action,
      target: row.target,
      salonName: row.target === "platform" ? "Platform" : names.get(row.target) || "",
      detail: auditDetail(row.action, row.meta),
      meta: row.meta,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
