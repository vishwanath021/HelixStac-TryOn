import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { preflightPhoto, renderOverlay, type RegionTool } from "@/lib/face/region";
import {
  drawFrontal,
  drawHand,
  drawLongHair,
  drawProfile,
  drawTilted,
  drawTwoFaces,
  rotateCcw,
  type Scene,
} from "@/lib/face/synthetic";

export async function sceneJpeg(scene: Scene, opts?: { flop?: boolean; orientation?: number }) {
  let pipeline = sharp(scene.data, { raw: { width: scene.width, height: scene.height, channels: 3 } });
  if (opts?.flop) pipeline = pipeline.flop();
  const jpeg = await pipeline.jpeg({ quality: 92 }).toBuffer();
  if (!opts?.orientation) return jpeg;
  return sharp(jpeg).withMetadata({ orientation: opts.orientation }).toBuffer();
}

export function sceneCatalog() {
  const frontal = drawFrontal(480, 640);
  const wide = drawFrontal(1280, 720, 0.42, 0.5, 0.85);
  const camera = drawFrontal(720, 1280, 0.5, 0.42, 0.9);
  return {
    frontal,
    "off-centre": drawFrontal(480, 640, 0.72),
    tilted: drawTilted(),
    "low-res": drawFrontal(96, 128, 0.5, 0.48, 0.7),
    "two-face": drawTwoFaces(),
    "no-face": { name: "no-face", data: drawFrontal(480, 640).data.fill(20), width: 480, height: 640, face: null, nails: [] } as Scene,
    profile: drawProfile(),
    mirrored: frontal,
    "upload-wide": wide,
    "long-hair": drawLongHair(),
    "camera-portrait": camera,
    hand: drawHand(),
    exif: frontal,
  };
}

const FACE_TOOLS: RegionTool[] = ["style", "colour", "brows", "beard"];

export async function writeMaskFixtures(root = path.join(process.cwd(), "tests/fixtures/faces")) {
  mkdirSync(root, { recursive: true });
  const scenes = sceneCatalog();
  const files: { name: string; file: string; jpeg: Buffer; scene: Scene }[] = [];
  for (const [name, scene] of Object.entries(scenes)) {
    if (name === "mirrored") {
      const jpeg = await sceneJpeg(scene, { flop: true });
      const file = path.join(root, "mirrored.jpg");
      writeFileSync(file, jpeg);
      files.push({ name, file, jpeg, scene });
      continue;
    }
    if (name === "exif") {
      const turned = rotateCcw(scene);
      const jpeg = await sharp(turned.data, { raw: { width: turned.width, height: turned.height, channels: 3 } })
        .jpeg({ quality: 92 })
        .toBuffer();
      const tagged = await sharp(jpeg).withMetadata({ orientation: 6 }).toBuffer();
      const file = path.join(root, "exif-rotated.jpg");
      writeFileSync(file, tagged);
      files.push({ name, file, jpeg: tagged, scene });
      continue;
    }
    const jpeg = await sceneJpeg(scene);
    const file = path.join(root, `${name}.jpg`);
    writeFileSync(file, jpeg);
    files.push({ name, file, jpeg, scene });
  }
  writeFileSync(path.join(process.cwd(), "tests/fixtures/hand.jpg"), files.find((item) => item.name === "hand")!.jpeg);
  return files;
}

export async function writeOverlays(dir = path.join(process.cwd(), "docs/mask-overlays")) {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  const files = await writeMaskFixtures();
  const toolsFor = (name: string): RegionTool[] => (name === "hand" ? ["nails"] : name === "no-face" ? ["style"] : FACE_TOOLS);
  for (const item of files) {
    for (const tool of toolsFor(item.name)) {
      const report = await preflightPhoto(item.jpeg, tool);
      const file = path.join(dir, `${item.name}-${tool}.png`);
      writeFileSync(file, await renderOverlay(report.raw, report.width, report.height, report.mask, report.face));
      written.push(file);
    }
  }
  for (const [label, file, tool] of [
    ["soft-bob", "public/styles/soft-bob.jpg", "style"],
    ["soft-arch", "public/brows/soft-arch.jpg", "brows"],
    ["short-boxed", "public/beards/short-boxed.jpg", "beard"],
  ] as const) {
    const report = await preflightPhoto(readPublic(file), tool);
    const out = path.join(dir, `real-${label}-${tool}.png`);
    writeFileSync(out, await renderOverlay(report.raw, report.width, report.height, report.mask, report.face));
    written.push(out);
  }
  return written;
}

function readPublic(file: string) {
  return readFileSync(path.join(process.cwd(), file));
}
