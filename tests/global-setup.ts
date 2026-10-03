import { execSync } from "node:child_process";
import fs from "node:fs";

export default function setup() {
  fs.mkdirSync("prisma", { recursive: true });
  for (const file of ["prisma/test.db", "prisma/test.db-journal"]) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
