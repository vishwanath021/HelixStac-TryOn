export type Point = { x: number; y: number };

/** x' = a x - b y + tx, y' = b x + a y + ty. a = scale cos θ, b = scale sin θ. */
export type Similarity = { a: number; b: number; tx: number; ty: number };

export function applySimilarity(sim: Similarity, point: Point): Point {
  return {
    x: sim.a * point.x - sim.b * point.y + sim.tx,
    y: sim.b * point.x + sim.a * point.y + sim.ty,
  };
}

export function invertSimilarity(sim: Similarity): Similarity {
  const det = sim.a * sim.a + sim.b * sim.b;
  if (det < 1e-12) throw new Error("The alignment transform is not invertible.");
  return {
    a: sim.a / det,
    b: -sim.b / det,
    tx: -(sim.a * sim.tx + sim.b * sim.ty) / det,
    ty: (sim.b * sim.tx - sim.a * sim.ty) / det,
  };
}

/**
 * Least-squares 2D similarity mapping src onto dst.
 * Umeyama closed form for scale, rotation, and translation.
 */
export function fitSimilarity(src: Point[], dst: Point[]): Similarity {
  if (src.length < 2 || src.length !== dst.length) throw new Error("Alignment needs matching landmark pairs.");
  const n = src.length;
  let sx = 0;
  let sy = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += src[i].x;
    sy += src[i].y;
    dx += dst[i].x;
    dy += dst[i].y;
  }
  sx /= n;
  sy /= n;
  dx /= n;
  dy /= n;
  let varSrc = 0;
  let sxx = 0;
  let sxy = 0;
  let syx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const xs = src[i].x - sx;
    const ys = src[i].y - sy;
    const xd = dst[i].x - dx;
    const yd = dst[i].y - dy;
    varSrc += xs * xs + ys * ys;
    sxx += xd * xs;
    sxy += xd * ys;
    syx += yd * xs;
    syy += yd * ys;
  }
  if (varSrc < 1e-8) throw new Error("Alignment landmarks are degenerate.");
  const a = (sxx + syy) / varSrc;
  const b = (syx - sxy) / varSrc;
  return {
    a,
    b,
    tx: dx - (a * sx - b * sy),
    ty: dy - (b * sx + a * sy),
  };
}

export function roundTripError(sim: Similarity, points: Point[]) {
  const inverse = invertSimilarity(sim);
  let max = 0;
  for (const point of points) {
    const back = applySimilarity(inverse, applySimilarity(sim, point));
    max = Math.max(max, Math.hypot(back.x - point.x, back.y - point.y));
  }
  return max;
}
