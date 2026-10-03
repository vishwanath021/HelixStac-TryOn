import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runCalibration } from "@/lib/ai/calibrate";

async function main() {
  const dir = path.join(process.cwd(), "docs/mask-overlays/calibration");
  mkdirSync(dir, { recursive: true });
  const result = await runCalibration();
  for (const panel of result.panels) {
    writeFileSync(path.join(dir, `${panel.name}-before.jpg`), panel.before);
    writeFileSync(path.join(dir, `${panel.name}-mask.png`), panel.overlay);
    writeFileSync(path.join(dir, `${panel.name}-after.jpg`), panel.after);
  }
  console.log(
    JSON.stringify(
      {
        spentInr: result.spentInr,
        capInr: result.capInr,
        panels: result.panels.map((panel) => ({ name: panel.name, tool: panel.tool, ok: panel.ok, calls: panel.calls, message: panel.message })),
      },
      null,
      2,
    ),
  );
}

main();
