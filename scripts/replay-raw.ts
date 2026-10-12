import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { styleById } from "@/data/styles";
import { runLockedEdit } from "@/lib/face/pipeline";
import { hairExtentForStyle, preflightPhoto, renderOverlay } from "@/lib/face/region";

const [rawPath, originalPath, styleId = "long-layers"] = process.argv.slice(2);

async function main() {
  if (!rawPath || !originalPath) {
    console.error("Usage: npm run replay:raw -- <raw.jpg> <original.jpg> [styleId]");
    process.exit(1);
  }
  const raw = readFileSync(rawPath);
  const original = readFileSync(originalPath);
  const style = styleById(styleId);
  const extent = hairExtentForStyle(style, "style");
  const pre = await preflightPhoto(original, "style", { hairExtent: extent });
  const outDir = path.join(process.cwd(), "var", "replay");
  mkdirSync(outDir, { recursive: true });
  const overlay = await renderOverlay(pre.raw, pre.width, pre.height, pre.mask, pre.face);
  writeFileSync(path.join(outDir, "overlay.png"), overlay);
  const locked = await runLockedEdit({
    image: original,
    tool: "style",
    hairExtent: extent,
    edit: async () => ({ image: raw, mime: "image/jpeg", provider: "replay", providerCostUsd: 0, latencyMs: 0 }),
  });
  if (locked.ok) writeFileSync(path.join(outDir, "result.jpg"), locked.image);
  const report = {
    styleId,
    extent,
    placementOk: pre.ok,
    placementReason: pre.reason || "",
    ok: locked.ok,
    calls: locked.calls,
    reason: locked.ok ? "" : locked.reason,
    detail: locked.ok ? "" : locked.detail || "",
    message: locked.ok ? "" : locked.message,
    result: locked.ok ? "result.jpg" : "",
  };
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(locked.ok ? 0 : 2);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "replay failed");
  process.exit(1);
});
