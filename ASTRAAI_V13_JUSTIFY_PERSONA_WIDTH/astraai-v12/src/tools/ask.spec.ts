/**
 * `npm run ask -- "your question"` runs this and prints a readable report.
 * Outside that command (no ASK variable) the test is skipped.
 */
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";
import { diagnose } from "@/lib/local-knowledge.server";

it.skipIf(!process.env["ASK"])("explains the confidence of one question", () => {
  const question = process.env["ASK"]!;
  const d = diagnose(question);
  const ok = d.confidence >= d.threshold;
  const found = d.terms.filter((t) => t.inBest).map((t) => t.term);
  const elsewhere = d.terms.filter((t) => !t.inBest && t.inTop).map((t) => t.term);
  const missing = d.terms.filter((t) => !t.inTop).sort((a, b) => b.weight - a.weight).map((t) => t.term);
  const lines = [
    `Question:    ${question}`,
    `Confidence:  ${d.confidence.toFixed(2)}   (needs ${d.threshold.toFixed(2)} to answer from the archive)`,
    `Result:      ${ok ? "ANSWERS FROM THE ARCHIVE" : "goes to the AI backup (or shows the closest passages)"}`,
    `Topic check: ${d.onTopic ? "passed" : "FAILED. No space, satellite or mission word found, so confidence is capped at 0.45"}`,
    "",
    "Important words in the question:",
    `  found in the best passage : ${found.join(", ") || "none"}`,
    `  found in other passages   : ${elsewhere.join(", ") || "none"}`,
    `  NOT found anywhere nearby : ${missing.join(", ") || "none"}`,
    "",
    "Best passages:",
    ...d.top.flatMap((t, i) => [`  ${i + 1}. ${t.source}${t.heading ? ` > ${t.heading}` : ""}${t.page ? ` (p. ${t.page})` : ""}  [score ${t.score.toFixed(1)}]`, `     ${t.preview}...`]),
    "",
    ok
      ? "Nothing to fix. This question is already answered from your own data."
      : missing.length
        ? `To raise it: add a sentence to a note in data/curated that uses these words: ${missing.slice(0, 5).join(", ")}. Then run npm run train.`
        : "To raise it: add a note that answers this question directly, using the same wording people would use. Then run npm run train.",
  ];
  writeFileSync(path.join(os.tmpdir(), "astraai-ask.txt"), lines.join("\n"));
});
