/**
 * Built-in PDF summariser. It needs no AI service: it scores the document's own
 * sentences by how central their vocabulary is, then lays the best ones out as a summary.
 * Used when no AI key is set or the AI service fails.
 */
import { proseLike, splitSentences, tokenise } from "./local-knowledge.server";
import type { PdfText } from "./pdf-text.server";

type Sentence = { text: string; page: number; index: number; score: number; words: Set<string> };

const hasFigure = (s: string) => /\d/.test(s) && /\b(km|kg|m|cm|mm|nm|ghz|mhz|hz|k|%|percent|degrees?|channels?|bits?|sec|seconds?|minutes?|hours?|days?|years?|rms|rmse|accuracy)\b/i.test(s);
const jaccard = (a: Set<string>, b: Set<string>) => {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.max(1, a.size + b.size - shared);
};

function rank(doc: PdfText, focus?: string): Sentence[] {
  const sentences: Sentence[] = [];
  for (const { page, text } of doc.pages)
    for (const raw of splitSentences(text)) {
      const clean = raw.replace(/^\d{1,3}\s+(?=[A-Z])/, "").trim();
      if (clean.length < 50 || clean.length > 420 || !proseLike(clean)) continue;
      if (/\b\d+\.\d+\.\d+\b/.test(clean) || /^(fig|figure|table)\b/i.test(clean)) continue; // table and heading debris
      sentences.push({ text: clean, page, index: sentences.length, score: 0, words: new Set(tokenise(clean)) });
    }
  const frequency = new Map<string, number>();
  for (const s of sentences) for (const w of s.words) frequency.set(w, (frequency.get(w) ?? 0) + 1);
  const focusTerms = new Set(tokenise(focus ?? ""));
  const total = sentences.length || 1;
  for (const s of sentences) {
    let score = 0;
    for (const w of s.words) {
      const df = frequency.get(w) ?? 0;
      // words that recur but are not everywhere carry the topic of the document
      if (df >= 2 && df < total * 0.4) score += Math.log(1 + df);
      if (focusTerms.has(w)) score += 6;
    }
    score /= Math.sqrt(s.words.size || 1);
    if (hasFigure(s.text)) score *= 1.15;
    if (s.index < total * 0.12) score *= 1.25; // introductions state what the document is about
    s.score = score;
  }
  return sentences;
}

/** Highest-scoring sentences that are not near-duplicates, returned in reading order. */
function pick(pool: Sentence[], count: number, avoid: Sentence[] = []): Sentence[] {
  const chosen: Sentence[] = [];
  for (const s of [...pool].sort((a, b) => b.score - a.score)) {
    if (chosen.length >= count) break;
    if ([...chosen, ...avoid].some((c) => jaccard(c.words, s.words) > 0.55)) continue;
    chosen.push(s);
  }
  return chosen.sort((a, b) => a.index - b.index);
}

const bullet = (s: Sentence) => `- ${s.text} *(p. ${s.page})*`;

export function localSummary(
  fileName: string,
  doc: PdfText,
  options: { focus?: string; detail: "short" | "detailed"; note?: string },
): string {
  const sentences = rank(doc, options.focus);
  const title = fileName.replace(/\.pdf$/i, "").replace(/[_]+/g, " ");
  const note = options.note ? `\n\n*${options.note}*` : "";
  if (sentences.length < 3)
    return `## ${title}\n\nThis PDF has too little readable text to summarise.${note}`;

  const closing = sentences.filter((s) => s.index > sentences.length * 0.8);
  const concluding = (closing.length ? closing : sentences).filter((s) =>
    /\b(conclu|summar|demonstrat|show|result|achiev|recommend|future)/i.test(s.text),
  );
  const proseOnly = (list: Sentence[]) =>
    list.filter((s) => s.text.length <= 300 && s.text.split(/\s+/).filter((w) => /\d/.test(w)).length <= 2);
  const conclusionPool = proseOnly(concluding.length ? concluding : closing.length ? closing : sentences);
  const conclusion = pick(conclusionPool.length ? conclusionPool : sentences, 2);
  const focusLine = options.focus ? `Focus: **${options.focus}**\n\n` : "";

  if (options.detail === "short") {
    const overview = pick(sentences.slice(0, Math.max(8, Math.floor(sentences.length * 0.15))), 3);
    const points = pick(sentences, 7, [...overview, ...conclusion]);
    return [
      `## ${title}`,
      `### Short Summary\n\n${focusLine}${overview.map((s) => s.text).join(" ")}`,
      `### Key Points\n\n${points.map(bullet).join("\n")}`,
      `### Conclusion\n\n${conclusion.map((s) => s.text).join(" ")}`,
      `*${doc.pages.length} pages read.*${note}`,
    ].join("\n\n");
  }

  const overview = pick(sentences.slice(0, Math.max(10, Math.floor(sentences.length * 0.15))), 4);
  const used = [...overview, ...conclusion];
  const findings = pick(sentences, 9, used);
  const parameters = pick(sentences.filter((s) => hasFigure(s.text)), 8, [...used, ...findings]);
  // walk through the document in equal parts so every section is represented
  const parts = Math.min(6, Math.max(2, Math.round(doc.pages.length / 6)));
  const size = Math.ceil(sentences.length / parts);
  const insights = Array.from({ length: parts }, (_, i) => {
    const slice = sentences.slice(i * size, (i + 1) * size);
    const chosen = pick(slice, 2, [...used, ...findings, ...parameters]);
    if (chosen.length === 0) return "";
    const first = slice[0]?.page ?? 1;
    const last = slice.at(-1)?.page ?? first;
    return `**Pages ${first} to ${last}**\n\n${chosen.map((s) => s.text).join(" ")}`;
  }).filter(Boolean);
  return [
    `## ${title}`,
    `### Overview\n\n${focusLine}${overview.map((s) => s.text).join(" ")}`,
    `### Key Findings\n\n${findings.map(bullet).join("\n")}`,
    parameters.length ? `### Technical Parameters\n\n${parameters.map(bullet).join("\n")}` : "",
    `### Section Insights\n\n${insights.join("\n\n")}`,
    `### Conclusion\n\n${conclusion.map((s) => s.text).join(" ")}`,
    `*${doc.pages.length} pages read.*${note}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
