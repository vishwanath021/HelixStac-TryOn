export type LeadSortable = {
  type: string;
  eventDate: string;
  createdAt: Date;
};

function eventMillis(lead: LeadSortable) {
  if (lead.type !== "BRIDAL" || !/^\d{4}-\d{2}-\d{2}$/.test(lead.eventDate)) return null;
  const time = Date.parse(`${lead.eventDate}T00:00:00`);
  return Number.isNaN(time) ? null : time;
}

/** Bridal trials with a date come first, soonest event first. Other leads stay newest first. */
export function sortLeads<T extends LeadSortable>(leads: T[]) {
  return [...leads].sort((a, b) => {
    const left = eventMillis(a);
    const right = eventMillis(b);
    if (left !== null && right !== null && left !== right) return left - right;
    if (left !== null && right === null) return -1;
    if (left === null && right !== null) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export function formatEventDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(match[2]) - 1];
  if (!month) return value;
  return `${Number(match[3])} ${month} ${match[1]}`;
}
