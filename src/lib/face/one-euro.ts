/**
 * One Euro filter (Casiez, Roussel, Vogel). A low cutoff holds a still
 * point, and beta raises the cutoff as soon as the point moves, so a
 * webcam landmark follows the mouth instead of trailing it.
 */

export type Pt = { x: number; y: number };

function smoothingAlpha(cutoff: number, dt: number) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / Math.max(dt, 1e-4));
}

export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(
    private minCutoff = 1.5,
    private beta = 0.7,
    private dCutoff = 1,
  ) {}

  filter(value: number, timestampMs: number) {
    if (this.xPrev == null || this.tPrev == null) {
      this.xPrev = value;
      this.tPrev = timestampMs;
      return value;
    }
    const dt = Math.max(1e-3, (timestampMs - this.tPrev) / 1000);
    const dx = (value - this.xPrev) / dt;
    const dxHat = smoothingAlpha(this.dCutoff, dt) * dx + (1 - smoothingAlpha(this.dCutoff, dt)) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const next = smoothingAlpha(cutoff, dt) * value + (1 - smoothingAlpha(cutoff, dt)) * this.xPrev;
    this.xPrev = next;
    this.dxPrev = dxHat;
    this.tPrev = timestampMs;
    return next;
  }
}

/** One filter per landmark axis. The first sample passes through. */
export class LandmarkOneEuro {
  private filters: OneEuroFilter[] = [];

  filter(points: Pt[], timestampMs: number): Pt[] {
    if (this.filters.length !== points.length * 2) {
      this.filters = points.flatMap(() => [new OneEuroFilter(), new OneEuroFilter()]);
    }
    return points.map((point, index) => ({
      x: this.filters[index * 2]!.filter(point.x, timestampMs),
      y: this.filters[index * 2 + 1]!.filter(point.y, timestampMs),
    }));
  }
}
