import { writeFileSync } from "node:fs";
import { sampleCard } from "../src/lib/ai/sample-card";

async function main() {
  writeFileSync("public/samples/demo-before.jpg", await sampleCard("BEFORE", "Illustration"));
  writeFileSync("public/samples/demo-after.jpg", await sampleCard("AFTER", "Illustration"));
}

main();
