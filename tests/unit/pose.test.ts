import { describe, expect, it } from "vitest";
import { FACE_OVAL, JAW, LEFT_BROW, LIPS, RIGHT_BROW } from "@/lib/face/landmarks";
import {
  FACE_TOO_PITCH,
  FACE_TOO_TILTED,
  FACE_TOO_TURNED,
  JAW_NOT_VISIBLE,
  NO_FACE,
  BROWS_HIDDEN,
  analyzeRegion,
} from "@/lib/face/region";
import { HAIR, blank } from "@/lib/face/synthetic";
import {
  JAW_YAW_LIMIT,
  PITCH_LIMIT,
  ROLL_LIMIT,
  YAW_LIMIT,
  jawVisible,
  parseLandmarks,
  poseFromLandmarks,
  poseOutOfRange,
  type FaceLandmark,
} from "@/lib/face/pose";

const SIZE = 640;

function rotate(x: number, y: number, rollDeg: number) {
  const rad = (rollDeg * Math.PI) / 180;
  const dx = x - 0.5;
  const dy = y - 0.42;
  return { x: 0.5 + dx * Math.cos(rad) - dy * Math.sin(rad), y: 0.42 + dx * Math.sin(rad) + dy * Math.cos(rad), z: 0 };
}

/** A full 478-point face in normalized coordinates. Angles are recovered by poseFromLandmarks. */
function face(opts: { yaw?: number; roll?: number; pitch?: number; chinY?: number; jawScale?: number; cheekZ?: number } = {}): FaceLandmark[] {
  const points: FaceLandmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.55, z: 0 }));
  const roll = opts.roll ?? 0;
  const yaw = opts.yaw ?? 0;
  const pitch = opts.pitch ?? 0;
  const chinY = opts.chinY ?? 0.78;
  const jawScale = opts.jawScale ?? 1;
  const put = (index: number, x: number, y: number, z = 0) => {
    const turned = rotate(x, y, roll);
    points[index] = { ...turned, z };
  };
  put(33, 0.5 - 0.12, 0.42);
  put(263, 0.5 + 0.12, 0.42);
  const noseDx = Math.tan((yaw * Math.PI) / 180) * 0.24;
  const noseRatio = 0.36 + pitch / 110;
  put(1, 0.5 + noseDx, 0.42 + noseRatio * (chinY - 0.42));
  put(152, 0.5, chinY);
  put(10, 0.5, 0.22);
  put(234, 0.32, 0.5, -(opts.cheekZ ?? 0));
  put(454, 0.68, 0.5, opts.cheekZ ?? 0);
  put(61, 0.44, 0.62);
  put(291, 0.56, 0.62);
  put(13, 0.5, 0.6);
  put(14, 0.5, 0.66);
  JAW.forEach((index, n) => {
    const t = n / (JAW.length - 1);
    const side = 1 - 2 * t;
    put(index, 0.5 + side * 0.14 * jawScale, 0.64 + Math.sin(t * Math.PI) * 0.12);
  });
  put(152, 0.5, chinY);
  RIGHT_BROW.forEach((index, n) => put(index, 0.36 + n * 0.014, 0.36));
  LEFT_BROW.forEach((index, n) => put(index, 0.52 + n * 0.014, 0.36));
  LIPS.forEach((index, n) => {
    const a = (n / LIPS.length) * Math.PI * 2;
    put(index, 0.5 + Math.cos(a) * 0.035, 0.63 + Math.sin(a) * 0.018);
  });
  for (const index of FACE_OVAL) {
    if (points[index].x === 0.5 && points[index].y === 0.55) put(index, 0.5, 0.5);
  }
  return points;
}

function check(tool: "brows" | "beard", points: FaceLandmark[], paint?: (data: Buffer) => void) {
  const data = blank(SIZE, SIZE);
  paint?.(data);
  return analyzeRegion(data, SIZE, SIZE, tool, { landmarks: points });
}

describe("landmark pose", () => {
  it("reads a level face as near zero and keeps the stated limits", () => {
    const level = poseFromLandmarks(face(), SIZE, SIZE);
    expect(level).toBeTruthy();
    expect(Math.abs(level!.yaw)).toBeLessThan(1);
    expect(Math.abs(level!.roll)).toBeLessThan(1);
    expect(Math.abs(level!.pitch)).toBeLessThan(1);
    expect(YAW_LIMIT).toBe(25);
    expect(ROLL_LIMIT).toBe(20);
    expect(PITCH_LIMIT).toBe(25);
    expect(JAW_YAW_LIMIT).toBe(35);
  });

  it("accepts a frontal face, glasses-level fringe, and a slight roll for brows and beard", () => {
    expect(check("brows", face()).ok).toBe(true);
    expect(check("beard", face()).ok).toBe(true);
    expect(check("brows", face({ roll: 12 })).ok).toBe(true);
    expect(check("brows", face({ yaw: 15 })).ok).toBe(true);
    expect(check("beard", face({ yaw: 24 })).ok).toBe(true);
    expect(check("brows", face({ pitch: 10 })).ok).toBe(true);
    const brows = check("brows", face());
    const stroke = Math.round(0.36 * SIZE) * SIZE + Math.round(0.4 * SIZE);
    expect(brows.mask[stroke]).toBeGreaterThan(0);
    expect(brows.mask[Math.round(0.9 * SIZE) * SIZE + Math.round(0.5 * SIZE)]).toBe(0);
    const beard = check("beard", face());
    expect(beard.mask[Math.round(0.72 * SIZE) * SIZE + Math.round(0.5 * SIZE)]).toBeGreaterThan(0);
    expect(beard.mask[Math.round(0.3 * SIZE) * SIZE + Math.round(0.5 * SIZE)]).toBe(0);
  });

  it("rejects only a clearly turned, rolled, or pitched face, and names the check", () => {
    const yaw = check("brows", face({ yaw: 32 }));
    expect(yaw.ok).toBe(false);
    expect(yaw.reason).toBe("profile");
    expect(yaw.message).toBe(FACE_TOO_TURNED);
    expect(yaw.debug?.failed).toBe("yaw");
    expect(Math.abs(yaw.debug?.yaw ?? 0)).toBeGreaterThan(25);

    const edge = check("brows", face({ yaw: 25 }));
    expect(edge.ok).toBe(true);

    const roll = check("brows", face({ roll: 27 }));
    expect(roll.ok).toBe(false);
    expect(roll.message).toBe(FACE_TOO_TILTED);
    expect(roll.debug?.failed).toBe("roll");
    expect(check("brows", face({ roll: 18 })).ok).toBe(true);
    expect(poseOutOfRange({ yaw: 0, roll: 20, pitch: 0, eyePx: 100, faceSize: 200 })).toBeNull();
    expect(poseOutOfRange({ yaw: 25, roll: 0, pitch: 0, eyePx: 100, faceSize: 200 })).toBeNull();
    expect(poseOutOfRange({ yaw: 0, roll: 20.1, pitch: 0, eyePx: 100, faceSize: 200 })).toBe("roll");

    const pitch = check("brows", face({ pitch: 32 }));
    expect(pitch.ok).toBe(false);
    expect(pitch.message).toBe(FACE_TOO_PITCH);
    expect(pitch.debug?.failed).toBe("pitch");
    expect(check("brows", face({ pitch: 18 })).ok).toBe(true);
    expect(poseOutOfRange({ yaw: 0, roll: 0, pitch: 25, eyePx: 100, faceSize: 200 })).toBeNull();
    expect(poseOutOfRange({ yaw: 0, roll: 0, pitch: 25.1, eyePx: 100, faceSize: 200 })).toBe("pitch");

    const mildBeard = check("beard", face({ yaw: 30, roll: 12 }));
    expect(mildBeard.ok).toBe(true);
    const turnedBeard = check("beard", face({ yaw: 42 }));
    expect(turnedBeard.ok).toBe(false);
    expect(turnedBeard.message).toBe(JAW_NOT_VISIBLE);
  });

  it("rejects a beard only when the face or the jaw is missing", () => {
    const profile = check("beard", face({ yaw: 70 }));
    expect(profile.ok).toBe(false);
    expect(profile.message).toBe(JAW_NOT_VISIBLE);
    expect(profile.debug?.failed).toBe("jaw");

    const narrow = check("beard", face({ jawScale: 0.4 }));
    expect(narrow.ok).toBe(false);
    expect(narrow.message).toBe(JAW_NOT_VISIBLE);

    const cropped = check("beard", face({ chinY: 0.995 }));
    expect(cropped.ok).toBe(false);
    expect(cropped.message).toBe(JAW_NOT_VISIBLE);

    const empty = blank(SIZE, SIZE);
    const none = analyzeRegion(empty, SIZE, SIZE, "beard");
    expect(none.ok).toBe(false);
    expect(none.message).toBe(NO_FACE);

    expect(jawVisible(face({ yaw: 70 }), SIZE, SIZE, 70)).toBe(false);
    expect(jawVisible(face(), SIZE, SIZE, 0)).toBe(true);
  });

  it("names hair across the fringe and ignores a bindi and a thin glasses line", () => {
    const covered = check("brows", face(), (data) => {
      const y0 = Math.round(0.36 * SIZE - 0.2 * 0.24 * SIZE);
      const y1 = Math.round(0.36 * SIZE - 0.03 * 0.24 * SIZE);
      for (let y = y0; y <= y1; y += 1) {
        for (let x = Math.round(0.3 * SIZE); x <= Math.round(0.7 * SIZE); x += 1) {
          const i = (y * SIZE + x) * 3;
          data[i] = HAIR.r;
          data[i + 1] = HAIR.g;
          data[i + 2] = HAIR.b;
        }
      }
    });
    expect(covered.ok).toBe(false);
    expect(covered.message).toBe(BROWS_HIDDEN);
    expect(covered.debug?.failed).toBe("hair");
    expect(covered.debug?.value).toBeGreaterThan(0.62);

    const bindi = check("brows", face(), (data) => {
      const cy = Math.round(0.36 * SIZE - 0.1 * 0.24 * SIZE);
      const cx = Math.round(0.5 * SIZE);
      for (let y = cy - 5; y <= cy + 5; y += 1) {
        for (let x = cx - 5; x <= cx + 5; x += 1) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > 25) continue;
          const i = (y * SIZE + x) * 3;
          data[i] = 36;
          data[i + 1] = 12;
          data[i + 2] = 16;
        }
      }
    });
    expect(bindi.ok).toBe(true);
    expect(bindi.debug?.failed).toBeNull();

    const glasses = check("brows", face(), (data) => {
      const y = Math.round(0.36 * SIZE - 0.2 * 0.24 * SIZE);
      for (let x = Math.round(0.34 * SIZE); x <= Math.round(0.66 * SIZE); x += 1) {
        const i = (y * SIZE + x) * 3;
        data[i] = 20;
        data[i + 1] = 20;
        data[i + 2] = 20;
      }
    });
    expect(glasses.ok).toBe(true);
  });

  it("rejects brows that sit off the face and names the zone value", () => {
    const points = face();
    for (const index of [...RIGHT_BROW, ...LEFT_BROW]) points[index] = { x: points[index].x, y: 0.02, z: 0 };
    const off = check("brows", points);
    expect(off.ok).toBe(false);
    expect(off.message).toMatch(/don't line up/);
    expect(off.debug?.failed).toBe("zone");
    expect(off.debug?.value).not.toBeNull();
  });

  it("rejects a second face from the browser count and ignores a bad landmark payload", () => {
    const many = analyzeRegion(blank(SIZE, SIZE), SIZE, SIZE, "brows", { landmarks: face(), faceCount: 2 });
    expect(many.ok).toBe(false);
    expect(many.reason).toBe("many");
    expect(parseLandmarks("nope")).toBeNull();
    expect(parseLandmarks(JSON.stringify([{ x: 0, y: 0 }]))).toBeNull();
    const raw = JSON.stringify(face());
    expect(parseLandmarks(raw)).toHaveLength(478);
  });
});
