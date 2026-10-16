/** Live bridal makeup drawn from MediaPipe Face Landmarker indices. */

export type Pt = { x: number; y: number };

export const OUTER_LIP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
export const INNER_LIP = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
/** Person's right eye (viewer's left on an unmirrored frame). */
export const UPPER_LASH_R = [33, 246, 161, 160, 159, 158, 157, 173, 133];
export const LOWER_LASH_R = [33, 7, 163, 144, 145, 153, 154, 155, 133];
export const UPPER_LASH_L = [263, 466, 388, 387, 386, 385, 384, 398, 362];
export const LOWER_LASH_L = [263, 249, 390, 373, 374, 380, 381, 382, 362];
/** Closed brow rings: top edge then back along the bottom edge. */
export const BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
export const BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];

export type MakeupOptions = {
  lip: string;
  kajal: boolean;
  lashes: boolean;
  blush: boolean;
  brow: boolean;
};

export type MakeupSamples = {
  lip: Pt;
  near: Pt;
  eye: Pt;
};

export type LookSamples = {
  lip: Pt;
  near: Pt;
  eye: Pt;
  hair: Pt;
  forehead: Pt;
  cheek: Pt;
  lid: Pt;
  beard: Pt;
  brow: Pt;
};

function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Points used to check that colour landed on lips and hair, not on teeth, eyes or beard. */
export function lookSamples(points: Pt[]): LookSamples | null {
  const upperOuter = points[0];
  const upperInner = points[13];
  const lowerOuter = points[17];
  const lowerInner = points[14];
  const chin = points[152];
  const forehead = points[10];
  if (!upperOuter || !upperInner || !lowerOuter || !lowerInner || !chin || !forehead) return null;
  const lower = midpoint(lowerOuter, lowerInner);
  const upper = midpoint(upperOuter, upperInner);
  const lip = lower.y > upper.y ? lower : upper;
  const eyeSpots = [...UPPER_LASH_R, ...LOWER_LASH_R].map((index) => points[index]).filter((point): point is Pt => Boolean(point));
  const browSpots = BROW_R.map((index) => points[index]).filter((point): point is Pt => Boolean(point));
  if (eyeSpots.length < 4 || browSpots.length < 4) return null;
  return {
    lip,
    near: { x: lip.x * 0.25 + chin.x * 0.75, y: lip.y * 0.25 + chin.y * 0.75 },
    eye: centroid(eyeSpots),
    hair: {
      x: points[332]?.x ?? forehead.x,
      y: Math.max(0.02, Math.min(forehead.y, points[332]?.y ?? forehead.y) - 0.12),
    },
    forehead: { x: forehead.x, y: forehead.y + 0.03 },
    cheek: points[50] ?? { x: forehead.x - 0.12, y: forehead.y + 0.28 },
    lid: points[159] ?? centroid(eyeSpots),
    beard: { x: chin.x, y: Math.min(0.98, chin.y) },
    brow: centroid(browSpots),
  };
}

export function smoothLandmarks(prev: Pt[] | null, next: Pt[], alpha = 0.35): Pt[] {
  if (!prev || prev.length !== next.length) return next.map((point) => ({ x: point.x, y: point.y }));
  const keep = 1 - alpha;
  return next.map((point, index) => ({
    x: prev[index]!.x * keep + point.x * alpha,
    y: prev[index]!.y * keep + point.y * alpha,
  }));
}

/** Kajal stays a line. It never grows into a filled lid. */
export function lineWidthForFace(facePx: number) {
  if (!Number.isFinite(facePx) || facePx <= 0) return 1.5;
  return Math.min(3, Math.max(1.5, facePx * 0.012));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function placed(points: Pt[], indexes: number[], place: (point: Pt) => Pt) {
  const out: Pt[] = [];
  for (const index of indexes) {
    const point = points[index];
    if (point) out.push(place(point));
  }
  return out;
}

function trace(ctx: CanvasRenderingContext2D, spots: Pt[], close: boolean) {
  if (spots.length < 2) return false;
  ctx.beginPath();
  spots.forEach((spot, index) => {
    if (index === 0) ctx.moveTo(spot.x, spot.y);
    else ctx.lineTo(spot.x, spot.y);
  });
  if (close) ctx.closePath();
  return true;
}

function centroid(spots: Pt[]): Pt {
  const total = spots.reduce((sum, spot) => ({ x: sum.x + spot.x, y: sum.y + spot.y }), { x: 0, y: 0 });
  return { x: total.x / spots.length, y: total.y / spots.length };
}

function strokeLine(ctx: CanvasRenderingContext2D, spots: Pt[], width: number, color: string) {
  if (!trace(ctx, spots, false)) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function wing(ctx: CanvasRenderingContext2D, outer: Pt, along: Pt, facePx: number, width: number) {
  const dx = outer.x - along.x;
  const dy = outer.y - along.y;
  const mag = Math.hypot(dx, dy) || 1;
  const len = clamp(facePx * 0.045, 4, 12);
  ctx.beginPath();
  ctx.strokeStyle = "rgba(12, 10, 12, 0.8)";
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.moveTo(outer.x, outer.y);
  ctx.lineTo(outer.x + (dx / mag) * len, outer.y + (dy / mag) * len * 0.45);
  ctx.stroke();
}

function lashStrokes(ctx: CanvasRenderingContext2D, spots: Pt[], facePx: number) {
  if (spots.length < 3) return;
  const length = clamp(facePx * 0.028, 3, 8);
  const width = clamp(facePx * 0.004, 0.6, 1.3);
  ctx.strokeStyle = "rgba(12, 10, 12, 0.82)";
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  const mid = centroid(spots);
  for (let index = 1; index < spots.length - 1; index += 1) {
    const prev = spots[index - 1]!;
    const spot = spots[index]!;
    const next = spots[index + 1]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const mag = Math.hypot(dx, dy) || 1;
    let nx = -dy / mag;
    let ny = dx / mag;
    const away = (spot.x - mid.x) * nx + (spot.y - mid.y) * ny;
    if (away < 0) {
      nx *= -1;
      ny *= -1;
    }
    ctx.beginPath();
    ctx.moveTo(spot.x, spot.y);
    ctx.quadraticCurveTo(spot.x + nx * length * 0.45, spot.y + ny * length * 0.2, spot.x + nx * length, spot.y + ny * length);
    ctx.stroke();
  }
}

export function paintMakeup(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  place: (point: Pt) => Pt,
  options: MakeupOptions,
): MakeupSamples | null {
  const left = points[234];
  const right = points[454];
  if (!left || !right) return null;
  const earL = place(left);
  const earR = place(right);
  const facePx = Math.hypot(earL.x - earR.x, earL.y - earR.y);
  const line = lineWidthForFace(facePx);
  const outer = placed(points, OUTER_LIP, place);
  const inner = placed(points, INNER_LIP, place);
  const upperR = placed(points, UPPER_LASH_R, place);
  const lowerR = placed(points, LOWER_LASH_R, place);
  const upperL = placed(points, UPPER_LASH_L, place);
  const lowerL = placed(points, LOWER_LASH_L, place);

  if (options.blush) {
    for (const index of [50, 280]) {
      const point = points[index];
      if (!point) continue;
      const spot = place(point);
      const radius = clamp(facePx * 0.16, 12, 48);
      const gradient = ctx.createRadialGradient(spot.x, spot.y, radius * 0.1, spot.x, spot.y, radius);
      gradient.addColorStop(0, "rgba(196, 92, 108, 0.28)");
      gradient.addColorStop(1, "rgba(196, 92, 108, 0)");
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  if (options.brow) {
    ctx.save();
    ctx.filter = "blur(1.5px)";
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "rgb(92, 56, 40)";
    for (const ring of [BROW_R, BROW_L]) {
      const spots = placed(points, ring, place);
      if (trace(ctx, spots, true)) ctx.fill();
    }
    ctx.restore();
  }

  if (options.kajal) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    strokeLine(ctx, upperR, line, "rgba(12, 10, 12, 0.9)");
    strokeLine(ctx, lowerR, line * 0.85, "rgba(12, 10, 12, 0.75)");
    strokeLine(ctx, upperL, line, "rgba(12, 10, 12, 0.9)");
    strokeLine(ctx, lowerL, line * 0.85, "rgba(12, 10, 12, 0.75)");
    const outerR = upperR[0];
    const alongR = upperR[2];
    const outerL = upperL[0];
    const alongL = upperL[2];
    if (outerR && alongR) wing(ctx, outerR, alongR, facePx, line);
    if (outerL && alongL) wing(ctx, outerL, alongL, facePx, line);
    ctx.restore();
  }

  if (options.lashes) {
    ctx.save();
    lashStrokes(ctx, upperR, facePx);
    lashStrokes(ctx, upperL, facePx);
    ctx.restore();
  }

  if (outer.length > 3 && inner.length > 3) {
    ctx.save();
    ctx.filter = "blur(2.5px)";
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = options.lip;
    trace(ctx, outer, true);
    trace(ctx, inner, true);
    ctx.fill("evenodd");
    ctx.restore();
  }

  if (outer.length < 3 || upperR.length < 3) return null;
  const lip = centroid(outer);
  const chin = points[152] ? place(points[152]) : { x: lip.x, y: lip.y + facePx * 0.2 };
  const eye = centroid(upperR.concat(lowerR));
  return {
    lip,
    near: { x: (lip.x + chin.x) / 2, y: (lip.y + chin.y) / 2 },
    eye,
  };
}
