import type { Point } from "@/lib/face/similarity";

export type RgbImage = { data: Buffer; width: number; height: number };

export function fillPolygon(mask: Uint8Array, width: number, height: number, points: Point[]) {
  if (points.length < 3) return;
  let minY = height;
  let maxY = 0;
  for (const point of points) {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(height - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y += 1) {
    const scan = y + 0.5;
    const hits: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a.y <= scan && b.y > scan) || (b.y <= scan && a.y > scan)) {
        const t = (scan - a.y) / (b.y - a.y);
        hits.push(a.x + t * (b.x - a.x));
      }
    }
    hits.sort((left, right) => left - right);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(hits[i]));
      const x1 = Math.min(width - 1, Math.floor(hits[i + 1]));
      const row = y * width;
      for (let x = x0; x <= x1; x += 1) mask[row + x] = 255;
    }
  }
}

export function stampDisks(mask: Uint8Array, width: number, height: number, points: Point[], radius: number) {
  const r = Math.max(1, radius);
  const r2 = r * r;
  for (const point of points) {
    const x0 = Math.max(0, Math.floor(point.x - r));
    const x1 = Math.min(width - 1, Math.ceil(point.x + r));
    const y0 = Math.max(0, Math.floor(point.y - r));
    const y1 = Math.min(height - 1, Math.ceil(point.y + r));
    for (let y = y0; y <= y1; y += 1) {
      const dy = y + 0.5 - point.y;
      const row = y * width;
      for (let x = x0; x <= x1; x += 1) {
        const dx = x + 0.5 - point.x;
        if (dx * dx + dy * dy <= r2) mask[row + x] = 255;
      }
    }
  }
}

/** Approximate Euclidean distance to the nearest pixel where mask is 0. Inside a solid region this grows from the boundary. */
export function distanceFromOff(mask: Uint8Array, width: number, height: number) {
  const inf = 1e8;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < dist.length; i += 1) dist[i] = mask[i] >= 128 ? inf : 0;
  chamfer(dist, width, height);
  return dist;
}

export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number) {
  if (radius <= 0) return Uint8Array.from(mask);
  const inf = 1e8;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < dist.length; i += 1) dist[i] = mask[i] >= 128 ? 0 : inf;
  chamfer(dist, width, height);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i += 1) if (dist[i] <= radius) out[i] = 255;
  return out;
}

function chamfer(dist: Float32Array, width: number, height: number) {
  const diag = 1.41421356;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const i = row + x;
      let best = dist[i];
      if (x > 0) best = Math.min(best, dist[i - 1] + 1);
      if (y > 0) best = Math.min(best, dist[i - width] + 1);
      if (x > 0 && y > 0) best = Math.min(best, dist[i - width - 1] + diag);
      if (x + 1 < width && y > 0) best = Math.min(best, dist[i - width + 1] + diag);
      dist[i] = best;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    const row = y * width;
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = row + x;
      let best = dist[i];
      if (x + 1 < width) best = Math.min(best, dist[i + 1] + 1);
      if (y + 1 < height) best = Math.min(best, dist[i + width] + 1);
      if (x + 1 < width && y + 1 < height) best = Math.min(best, dist[i + width + 1] + diag);
      if (x > 0 && y + 1 < height) best = Math.min(best, dist[i + width - 1] + diag);
      dist[i] = best;
    }
  }
}

export function sampleBilinear(image: RgbImage, x: number, y: number): [number, number, number] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dx = x - x0;
  const dy = y - y0;
  const at = (px: number, py: number) => {
    const cx = Math.max(0, Math.min(image.width - 1, px));
    const cy = Math.max(0, Math.min(image.height - 1, py));
    const i = (cy * image.width + cx) * 3;
    return [image.data[i], image.data[i + 1], image.data[i + 2]] as const;
  };
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  const mix = (index: number) => {
    const top = a[index] * (1 - dx) + b[index] * dx;
    const bottom = c[index] * (1 - dx) + d[index] * dx;
    return Math.max(0, Math.min(255, Math.round(top * (1 - dy) + bottom * dy)));
  };
  return [mix(0), mix(1), mix(2)];
}

export function sampleNearest(mask: Uint8Array, width: number, height: number, x: number, y: number) {
  const cx = Math.max(0, Math.min(width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(height - 1, Math.round(y)));
  return mask[cy * width + cx];
}
