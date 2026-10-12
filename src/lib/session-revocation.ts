import { prisma } from "@/lib/prisma";

/** Missing on older cookies, which were issued at version 0. */
export function sessionIsCurrent(tokenVersion: unknown, current: number) {
  const version = tokenVersion === undefined || tokenVersion === null || tokenVersion === "" ? 0 : Number(tokenVersion);
  return Number.isFinite(version) && version === current;
}

export async function revokeUserSessions(userId: string) {
  if (!userId) return;
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}
