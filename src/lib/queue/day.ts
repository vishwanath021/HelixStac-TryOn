/** Calendar day in Asia/Kolkata, YYYY-MM-DD. */
export function kolkataDayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function kolkataToday(now = new Date()) {
  return kolkataDayKey(now);
}
