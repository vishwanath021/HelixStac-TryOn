import { prisma } from "@/lib/prisma";

export const AUDIT_PAGE_SIZE = 20;

const LABELS: Record<string, string> = {
  TENANT_CREATE: "Salon created",
  TENANT_UPDATE: "Salon updated",
  PLAN_ASSIGN: "Plan changed",
  CREDIT_ADJUST: "Credits adjusted",
  PASSWORD_CHANGE: "Password changed",
  TEAM_REMOVE: "Staff removed",
};

export function auditLabel(action: string) {
  return LABELS[action] || action;
}

export async function listAudit(input: { action?: string; page?: number }) {
  const action = input.action?.trim() || "";
  const page = Math.max(1, Math.floor(input.page || 1));
  const where = action ? { action } : {};
  const [total, rows, actions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);
  return {
    page,
    pageSize: AUDIT_PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    actions: actions.map((row) => row.action),
    items: rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      action: row.action,
      target: row.target,
      meta: row.meta,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
