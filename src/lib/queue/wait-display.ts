/** Minutes to show between refreshes: the latest server wait, minus whole minutes since that sample, never below 0. */
export function displayedWait(serverWait: number, sampledAt: number, now: number) {
  const wait = Math.max(0, Math.floor(Number(serverWait) || 0));
  const elapsedMin = Math.floor(Math.max(0, now - sampledAt) / 60_000);
  return Math.max(0, wait - elapsedMin);
}
