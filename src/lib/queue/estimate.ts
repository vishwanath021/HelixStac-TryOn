export const ACTIVE_STATUSES = ["WAITING", "CALLED", "IN_SERVICE"] as const;

export function serviceMinutes(durationMin: number | null | undefined, avgMinutes: number) {
  if (durationMin && durationMin > 0) return durationMin;
  return Math.max(1, avgMinutes);
}

export type WaitRow = { id: string; status: string; joinedAt: Date; token: number };

/** People in front of this guest: anyone in a chair, anyone already called, then earlier tokens still waiting. */
export function peopleAhead<T extends WaitRow>(rows: T[], selfId: string | null) {
  const serving = rows.filter((row) => row.status === "IN_SERVICE" && row.id !== selfId);
  const called = rows.filter((row) => row.status === "CALLED" && row.id !== selfId);
  const self = selfId ? rows.find((row) => row.id === selfId) : null;
  const waiting = rows.filter((row) => {
    if (row.status !== "WAITING" || row.id === selfId) return false;
    if (!self || self.status !== "WAITING") return true;
    return row.token < self.token;
  });
  return [...serving, ...called, ...waiting];
}

/** Sum of the minutes ahead, split across the open chairs, stations, or rooms. */
export function waitMinutes(minutes: number[], units: number) {
  const active = Math.max(1, units);
  const sum = minutes.reduce((total, value) => total + Math.max(1, value), 0);
  return Math.ceil(sum / active);
}
