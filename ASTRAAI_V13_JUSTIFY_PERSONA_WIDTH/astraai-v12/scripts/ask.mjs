#!/usr/bin/env node
/** npm run ask -- "What is Gaganyaan?"  prints how confident the archive is about a question. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.log('Usage: npm run ask -- "your question"');
  process.exit(1);
}
const report = path.join(os.tmpdir(), "astraai-ask.txt");
rmSync(report, { force: true });
const run = spawnSync("npx", ["vitest", "run", "src/tools/ask.spec.ts"], {
  env: { ...process.env, ASK: question },
  stdio: "ignore",
  shell: true,
});
if (!existsSync(report)) {
  console.error("Could not analyse the question. Run `npm install --legacy-peer-deps` and try again.");
  process.exit(run.status ?? 1);
}
console.log("\n" + readFileSync(report, "utf8") + "\n");
