import { scanRepo } from "../src/lib/secrets";

const hits = scanRepo();
if (hits.length) {
  console.error("Possible secrets in the repo. Move them to .env or the host's secret store.");
  for (const hit of hits) console.error(`- ${hit.file} (${hit.name})`);
  process.exit(1);
}
console.log("No committed API-key patterns found.");
