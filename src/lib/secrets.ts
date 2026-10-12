import fs from "node:fs";
import path from "node:path";

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "google", re: /AIza[0-9A-Za-z\-_]{20,}/g },
  { name: "openai", re: /sk-(?:proj-)?[A-Za-z0-9_\-]{20,}/g },
  { name: "aws", re: /AKIA[0-9A-Z]{16}/g },
  { name: "github", re: /ghp_[A-Za-z0-9]{36,}/g },
  { name: "slack", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
];

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "out", "coverage", "test-results", "playwright-report", "ai-smoke", "ai-samples", "blob-report"]);
const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".mp4", ".zip", ".db"]);

export function findSecrets(text: string) {
  const hits: { name: string }[] = [];
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(text)) hits.push({ name: pattern.name });
  }
  return hits;
}

export function scanRepo(root = process.cwd()) {
  const found: { file: string; name: string }[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name === ".env" || entry.name.startsWith(".env.")) {
        if (entry.name !== ".env.example") continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SKIP_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      if (entry.name.endsWith(".db-journal")) continue;
      const stat = fs.statSync(full);
      if (stat.size > 1_000_000) continue;
      const text = fs.readFileSync(full, "utf8");
      if (text.includes("\u0000")) continue;
      for (const hit of findSecrets(text)) found.push({ file: path.relative(root, full), name: hit.name });
    }
  }
  walk(root);
  return found;
}
