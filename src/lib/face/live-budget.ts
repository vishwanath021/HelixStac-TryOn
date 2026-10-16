/** Live hair segmentation budget. Slow frames reuse the last mask. They never turn colour off. */

export const LIVE_FULL_EDGE = 480;
export const LIVE_LOW_EDGE = 360;
export const LIVE_SEG_INTERVAL = 6;
export const LIVE_SEG_SLOW_INTERVAL = 12;

export type LiveBudget = {
  edge: number;
  interval: number;
  /** Hair segmentation stays on. The last mask is reused between runs. */
  seg: true;
  degraded: boolean;
};

/**
 * Below 24fps, drop the sample edge once, then segment every 12th frame.
 * `seg` stays true so the colour does not disappear.
 */
export function nextLiveBudget(fps: number, edge: number, interval: number): LiveBudget {
  const current = Number.isFinite(edge) && edge > 0 ? edge : LIVE_FULL_EDGE;
  const every = Number.isFinite(interval) && interval > 0 ? interval : LIVE_SEG_INTERVAL;
  if (fps >= 24) {
    return {
      edge: current,
      interval: every,
      seg: true,
      degraded: current < LIVE_FULL_EDGE || every > LIVE_SEG_INTERVAL,
    };
  }
  if (current > LIVE_LOW_EDGE) {
    return { edge: LIVE_LOW_EDGE, interval: every, seg: true, degraded: true };
  }
  if (every < LIVE_SEG_SLOW_INTERVAL) {
    return { edge: current, interval: LIVE_SEG_SLOW_INTERVAL, seg: true, degraded: true };
  }
  return { edge: current, interval: every, seg: true, degraded: true };
}
