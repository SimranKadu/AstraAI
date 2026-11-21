#!/usr/bin/env node
/**
 * ASTRAAI "training" step.
 *
 *   npm run train
 *
 * Reads every document under ./data (PDF, DOCX, DOC, TXT, MD), extracts the text,
 * removes duplicates, splits it into overlapping passages and writes the search
 * index to src/data/trained-index.json. The chatbot answers from this index first
 * and only calls the AI API when the index has no confident answer.
 *
 * This is retrieval "training" (building a searchable knowledge base from your files),
 * not neural-network fine-tuning. Drop new files into ./data and run it again.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const OUT_FILE = path.join(ROOT, "src", "data", "trained-index.json");

const CHUNK_TARGET = 1000; // characters per passage
const CHUNK_MAX = 1400;
const MIN_CHUNK = 80;
const SUPPORTED = new Set([".pdf", ".docx", ".doc", ".txt", ".md"]);

// Never index personal documents (IDs, résumés, CVs) even if they end up in ./data.
const PERSONAL = /(aadh?aa?r|adhar|pan[\s_-]?card|passport|resume|curriculum|\bcv\b|driving[\s_-]?licen)/i;

const sha1 = (input) => createHash("sha1").update(input).digest("hex");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function cleanText(raw) {
  return raw
    .replace(/\r/g, "\n")
    .replace(/\u00ad/g, "")
    .replace(/(\[(?:\d+|[a-z]|citation needed|note \d+)\])+/gi, "") // [12] [a] style references
    .replace(/\b([ap])\. ?m\./gi, "$1m")
    .replace(/\b(Fig|Figs|approx|vs|Dr|Mr|Mrs|No)\./g, "$1")
    .replace(/-\n(?=[a-z])/g, "") // re-join words hyphenated across lines
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

function prettySource(file) {
  const base = path.basename(file, path.extname(file));
  return decodeURIComponent(base.replace(/%(?![0-9a-f]{2})/gi, "%25"))
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractPdf(file) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(file)));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).map((t, i) => ({ page: i + 1, text: t }));
}

const SKIP_SECTIONS = /^(references?|external links?|see also|gallery|notes?|further reading|bibliography|citations?|footnotes?|sources?)$/i;

const decode = (t) =>
  t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'");
const plain = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Word documents keep their headings, lists and fact tables so answers can be organised by section. */
async function extractDocx(file) {
  const mammoth = (await import("mammoth")).default;
  const { value: html } = await mammoth.convertToHtml(
    { path: file },
    { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) },
  );
  // Tables: the first row is the header. Rows become readable lines such as
  // "Technical Assistant. Typical work: ... Typical study route: ..." instead of loose cells.
  const withTables = html.replace(/<table[\s\S]*?<\/table>/g, (table) => {
    const rows = (table.match(/<tr[\s\S]*?<\/tr>/g) ?? []).map((row) =>
      (row.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map(plain),
    );
    const [headers = [], ...body] = rows;
    return body
      .map((cells) => {
        if (cells.filter(Boolean).length === 0) return "";
        if (cells.length === 2) return `<li>${/^month$/i.test(headers[0] ?? "") ? "Month " : ""}${cells[0]}: ${cells[1]}</li>`;
        const [first, ...rest] = cells;
        // A numbered register ("No." | "Launch event" | ...) reads as "Launch event 61: GSLV-F09 / GSAT-9; Date: ...".
        const numbered = /^(no\.?|#|sr\.?\s*no\.?)$/i.test(headers[0] ?? "");
        const lead = numbered ? `${headers[1] ?? "Entry"} ${first}: ${rest[0] ?? ""}` : first;
        const labels = numbered ? headers.slice(2) : headers.slice(1);
        const values = numbered ? rest.slice(1) : rest;
        const details = values
          .map((value, i) => (value ? `${labels[i] ?? "Detail"}: ${value.replace(/\.$/, "")}` : ""))
          .filter(Boolean)
          .join("; ");
        // one row = one sentence, so its date, launcher and notes stay together
        return `<li>${lead}${details ? `${numbered ? "; " : ": "}${details}` : ""}.</li>`;
      })
      .join("");
  });
  const chapters = (withTables.match(/<h1[ >]/g) ?? []).length >= 3; // chapter titles are kept only in multi-chapter books
  const sections = [];
  let h1 = "";
  let h2 = "";
  let h3 = "";
  let buffer = [];
  const flush = () => {
    const text = buffer.join("\n\n").trim();
    const heading = [chapters ? h1 : "", h2, h3].filter(Boolean).join(" > ");
    if (text && !SKIP_SECTIONS.test(h2 || h1)) sections.push({ page: null, heading: heading || "Overview", text });
    buffer = [];
  };
  for (const part of withTables.match(/<(h[1-6])[^>]*>[\s\S]*?<\/\1>|<(p|li)[^>]*>[\s\S]*?<\/\2>/g) ?? []) {
    const level = part.match(/^<h([1-6])/)?.[1];
    const text = plain(part);
    if (!text) continue;
    if (level) {
      flush();
      if (Number(level) === 1 && chapters) {
        h1 = text;
        h2 = "";
        h3 = "";
      } else if (Number(level) <= 2) {
        h2 = text;
        h3 = "";
      } else h3 = text;
    } else buffer.push(part.startsWith("<li") ? `- ${text}` : text);
  }
  flush();
  return sections;
}

async function extractDoc(file) {
  const WordExtractor = (await import("word-extractor")).default;
  const doc = await new WordExtractor().extract(file);
  return [{ page: null, text: doc.getBody() }];
}

/** Markdown notes keep their "##" headings, so answers can be organised by section. */
function extractMarkdown(text) {
  const sections = [];
  let heading = null;
  let buffer = [];
  const flush = () => {
    const body = buffer.join("\n\n").trim();
    if (body && heading) sections.push({ page: null, heading, text: body }); // text before the first "##" is a note to editors
    buffer = [];
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const title = line.match(/^(#{1,3})\s+(.*)$/);
    if (title) {
      if (title[1].length === 1) continue; // document title
      flush();
      heading = title[2];
    } else if (line) buffer.push(line.replace(/^[-*]\s+/, "- "));
    else buffer.push("");
  }
  flush();
  return sections.map((s) => ({ ...s, text: s.text.replace(/\n{3,}/g, "\n\n") }));
}

async function extractPlain(file) {
  return [{ page: null, text: await readFile(file, "utf8") }];
}

/**
 * Scraped web pages start with "URL: ..." and are full of one-word menu lines.
 * Name them after their URL and drop the menu fragments so only real content is indexed.
 */
function parseScrapedPage(text) {
  const match = text.match(/^\s*URL:\s*(\S+)/i);
  if (!match) return null;
  let title = match[1];
  try {
    const url = new URL(match[1]);
    title = `MOSDAC website ${url.pathname === "/" ? "home page" : url.pathname.replace(/^\/|\/$/g, "")}`;
  } catch {
    /* keep the raw URL */
  }
  const body = text
    .replace(/^\s*URL:.*$/im, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.split(/\s+/).length >= 3)
    .join("\n");
  return { title, body };
}

async function extract(file) {
  switch (path.extname(file).toLowerCase()) {
    case ".pdf":
      return extractPdf(file);
    case ".docx":
      return extractDocx(file);
    case ".doc":
      return extractDoc(file);
    case ".md":
      return extractMarkdown(await readFile(file, "utf8"));
    default:
      return extractPlain(file);
  }
}

/** Dotted abbreviations (B.E., M.Sc., Ph.D.) must not be read as sentence ends. */
const ABBREVIATIONS = /\b(?:B\.E\.|B\.Tech|M\.Tech|M\.E\.|B\.Sc\.|M\.Sc\.|Ph\.D\.|e\.g\.|i\.e\.|etc\.(?=\s*[;,)])|vs\.)/g;
const protectDots = (text) => text.replace(ABBREVIATIONS, (m) => m.replace(/\./g, "\u2024"));
const restoreDots = (text) => text.replace(/\u2024/g, ".");

/** Joins sentences with spaces, keeping list items ("- ...") on their own lines. */
const joinSentences = (list) =>
  list.reduce((out, sentence) => (out ? `${out}${sentence.startsWith("- ") ? "\n" : " "}${sentence}` : sentence), "").trim();

/** Split text into passages of roughly CHUNK_TARGET characters on sentence/paragraph borders. */
function chunkText(text) {
  const sentences =
    protectDots(text)
      .split(/\n{2,}/)
      .flatMap((para) => para.replace(/\n/g, " ").match(/(?:[^.!?]|\.(?=\d))+(?:[.!?]+["')\]]?|$)\s*/g) ?? [])
      .map((s) => restoreDots(s.replace(/\s+/g, " ").trim()))
      .filter(Boolean) ?? [];
  const chunks = [];
  let current = [];
  let length = 0;
  const flush = () => {
    const body = joinSentences(current);
    if (body.length >= MIN_CHUNK) chunks.push(body);
    // keep the last sentence as overlap so answers spanning a boundary are not lost
    const tail = current.at(-1);
    current = tail && tail.length < 300 ? [tail] : [];
    length = joinSentences(current).length;
  };
  for (let sentence of sentences) {
    while (sentence.length > CHUNK_MAX) {
      current.push(sentence.slice(0, CHUNK_MAX));
      sentence = sentence.slice(CHUNK_MAX);
      flush();
    }
    current.push(sentence);
    length += sentence.length + 1;
    if (length >= CHUNK_TARGET) flush();
  }
  if (joinSentences(current).length >= MIN_CHUNK) flush();
  return chunks;
}

/** True when a passage is mostly numbers, table debris or boilerplate rather than prose. */
function looksLikeNoise(text) {
  const letters = (text.match(/[a-z]/gi) ?? []).length;
  if (letters / text.length < 0.5) return true;
  const words = text.split(/\s+/);
  const short = words.filter((w) => w.length <= 2).length;
  return words.length > 20 && short / words.length > 0.55;
}

async function main() {
  console.log("ASTRAAI training: scanning ./data ...\n");
  let files;
  try {
    files = (await walk(DATA_DIR)).filter((f) => SUPPORTED.has(path.extname(f).toLowerCase()));
  } catch {
    console.error(`Could not read ${DATA_DIR}. Create it and put your documents inside.`);
    process.exit(1);
  }
  // Descriptive file names first, so duplicates keep the meaningful name (not "file_07.pdf").
  const generic = (f) => /^(file|page|doc|document)[_\s-]?\d+/i.test(path.basename(f));
  files.sort((a, b) => Number(generic(a)) - Number(generic(b)) || a.localeCompare(b));

  const seenFiles = new Map(); // content hash -> first file name
  const seenChunks = new Set();
  const counters = new Map(); // passage numbers must keep counting across headings of one document/page
  const chunks = [];
  const report = [];

  for (const file of files) {
    const rel = path.relative(DATA_DIR, file);
    if (PERSONAL.test(path.basename(file))) {
      report.push({ rel, status: "skipped (looks like a personal document)" });
      continue;
    }
    const buffer = await readFile(file);
    const fileHash = sha1(buffer);
    if (seenFiles.has(fileHash)) {
      report.push({ rel, status: `skipped (duplicate of ${seenFiles.get(fileHash)})` });
      continue;
    }
    seenFiles.set(fileHash, rel);

    let pages;
    try {
      pages = await extract(file);
    } catch (error) {
      report.push({ rel, status: `FAILED (${error instanceof Error ? error.message : error})` });
      continue;
    }

    let source = prettySource(file);
    let added = 0;
    let repeated = 0;
    for (const { page, text, heading = null } of pages) {
      let raw = text ?? "";
      const scraped = path.extname(file).toLowerCase() === ".txt" ? parseScrapedPage(raw) : null;
      if (scraped) {
        source = scraped.title;
        raw = scraped.body;
      }
      const body = cleanText(raw);
      if (!body) continue;
      const counterKey = `${source}|${page}`;
      for (const piece of chunkText(body)) {
        if (looksLikeNoise(piece)) continue;
        const key = sha1(piece.toLowerCase().replace(/\W+/g, ""));
        if (seenChunks.has(key)) {
          repeated += 1;
          continue;
        }
        seenChunks.add(key);
        const section = (counters.get(counterKey) ?? 0) + 1;
        counters.set(counterKey, section);
        chunks.push({ source, page, section, ...(heading ? { heading } : {}), text: piece });
        added += 1;
      }
    }
    report.push({
      rel,
      status: added
        ? `${added} passages`
        : repeated
          ? "skipped (content already indexed)"
          : "no readable text (scanned image? needs OCR)",
    });
  }

  // Career Hub: every role in src/data/careers.json becomes a searchable document with sections
  // (About, Education, Exams, Subjects and books, Study resources, Roadmap).
  try {
    const guide = JSON.parse(await readFile(path.join(ROOT, "src", "data", "careers.json"), "utf8"));
    let roleCount = 0;
    for (const role of guide.roles) {
      const exams = role.exams.map((key) => guide.examRoutes[key]).filter(Boolean);
      const subjects = role.subjects.map((key) => guide.subjects[key]).filter(Boolean);
      const resources = role.resources.map((key) => guide.resources[key]).filter(Boolean);
      const bullets = (list) => list.map((item) => `- ${item}`).join("\n\n");
      const sections = [
        ["About the role", [`${role.title}: ${role.work}`, role.goal ? `Related career goal: ${role.goal}.` : "", `This role is in the group: ${role.group}.`]],
        ["Education needed", [`Typical study route: ${role.study}`, role.path ? `Education path: ${role.path.replace(/ → /g, ", then ")}` : "", "Check the latest official advertisement for accepted degrees, minimum marks and age."]],
        ["Exams and selection", [guide.noSingleExam, ...exams.map((route) => `${route.title}: ${route.points.join(" ")}${route.link ? ` Official site: ${route.link.url}` : ""}`), role.examNote]],
        ["Subjects and books", [
          ...subjects.map((subject) => `${subject.area}: ${subject.topics}`),
          role.subjectNote ?? "",
          role.books.length ? `Suggested standard books for ${role.title} (ASTRAAI suggestions, not from the ISRO guide):` : "",
          role.books.length ? bullets(role.books.map((book) => `${book.title} by ${book.author}`)) : "",
          guide.bookNote,
        ]],
        ["Study resources", [bullets(resources.map((resource) => `${resource.name}: ${resource.use} ${resource.url}`))]],
        ["Roadmap", [
          role.path ? `Step 1, education: ${role.path.replace(/ → /g, ", then ")}` : `Step 1, education: ${role.study}`,
          "Step 2, choose one target post and read its latest official advertisement from beginning to end.",
          `Six-month foundation plan: ${guide.plan.map((m) => `Month ${m.month}: ${m.focus}`).join(" ")}`,
          guide.dailyRoutine,
          `Preparing for selection: ${guide.prepSteps.join(" ")}`,
          guide.disclaimer,
        ]],
      ];
      const counterKey = `${role.title}|null`;
      let added = 0;
      for (const [heading, paragraphs] of sections) {
        const body = cleanText(paragraphs.filter(Boolean).join("\n\n"));
        for (const piece of chunkText(body)) {
          const key = sha1(`${role.title}|${piece.toLowerCase().replace(/\W+/g, "")}`);
          if (seenChunks.has(key)) continue;
          seenChunks.add(key);
          const section = (counters.get(counterKey) ?? 0) + 1;
          counters.set(counterKey, section);
          chunks.push({ source: role.title, page: null, section, heading, text: piece });
          added += 1;
        }
      }
      if (added) roleCount += 1;
    }
    report.push({ rel: "src/data/careers.json (Career Hub roles)", status: `${roleCount} roles` });
  } catch (error) {
    report.push({ rel: "src/data/careers.json", status: `skipped (${error instanceof Error ? error.message : error})` });
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const payload = {
    version: 1,
    builtAt: new Date().toISOString(),
    files: files.length,
    chunks,
  };
  await writeFile(OUT_FILE, JSON.stringify(payload));
  const size = (await stat(OUT_FILE)).size;

  for (const { rel, status } of report) console.log(`  ${rel.padEnd(70)} ${status}`);
  const sources = new Set(chunks.map((c) => c.source)).size;
  console.log(
    `\nDone. ${chunks.length} passages from ${sources} documents -> src/data/trained-index.json (${(size / 1024 / 1024).toFixed(1)} MB)`,
  );
  console.log("Restart `npm run dev` if it is running so the new index is loaded.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
