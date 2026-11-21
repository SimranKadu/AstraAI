/**
 * ASTRAAI local knowledge engine.
 *
 * Answers questions from the "trained" archive (everything in ./data, indexed by
 * `npm run train`, plus the built-in ISRO mission and launch vehicle dataset) without
 * calling any AI API. It also reports how confident it is, so the chat route can hand
 * the question to the API only when the archive cannot answer it.
 */
import seed from "@/data/astra-knowledge.json";
import { PERSONAS } from "@/data/personas";
import { CAREER_ROLES } from "@/data/careers";
import {
  LAUNCH_VEHICLES,
  SPACE_MISSIONS,
  missionToText,
  vehicleToText,
  type SpaceMission,
} from "@/data/space-dataset";

export type Chunk = { source: string; page: number | null; section: number; heading?: string | null; text: string };
export type RankedChunk = Chunk & { score: number };

// ---------------------------------------------------------------------------
// Loading the trained index (built by `npm run train`; optional so the app still starts)
// ---------------------------------------------------------------------------
const trainedModules = import.meta.glob("../data/trained-index.json", {
  eager: true,
  import: "default",
}) as Record<string, { builtAt?: string; chunks?: Chunk[] }>;
const trained = Object.values(trainedModules)[0] ?? { chunks: [] };

const datasetChunks: Chunk[] = [
  ...SPACE_MISSIONS.map((m, i) => ({
    source: "ISRO mission dataset",
    page: null,
    section: 1000 + i * 10,
    text: missionToText(m),
  })),
  ...LAUNCH_VEHICLES.map((v, i) => ({
    source: "Launch vehicle dataset",
    page: null,
    section: 5000 + i * 10,
    text: vehicleToText(v),
  })),
];

// ---------------------------------------------------------------------------
// Tokenising
// ---------------------------------------------------------------------------
const STOP = new Set(
  `the and for with that this from what which who whom how when where why does did are was were can could would should will you your about into have has had not but all any tell give show explain please there their its use used using get got also than then them they these those some such more most very just only own same other
   is of to in on at by an as or if it be do we me my us he she his her our out off per via etc eg ie vs and/or between among within without across over under each both few many much like need want know say said make made
   describe define list provide give kindly information details detail overview mean means meant does do
   take takes taken taking become becomes became went wrong gone got getting get gets goes going make makes help helps helping
   find finds look looks looking see seen says think thing things way ways let lets try tries really actually exactly basically
   anything something everything someone anyone people person compare compared comparing versus vs difference differences different walk walks walking through throughout`.split(/\s+/),
);

/** Words that mean the same thing for search purposes. */
const SYNONYM_GROUPS = [
  ["rain", "rainfall", "precipitation"],
  ["cyclone", "tc", "typhoon", "hurricane"],
  ["chlorophyll", "chl"],
  ["aerosol", "aod"],
  ["download", "access", "fetch"],
  ["satellite", "spacecraft"],
  ["launch", "liftoff", "lift-off"],
  ["rocket", "launcher", "vehicle"],
  ["sea-surface-temperature", "sst"],
  ["scatterometer", "scatterometry"],
  ["monsoon", "onset"],
  ["objective", "aim", "goal", "purpose", "mission"],
  ["payload", "instrument", "sensor"],
  ["accuracy", "error", "rmse"],
];
const SYNONYMS = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS)
  for (const word of group)
    SYNONYMS.set(
      stem(word),
      group.filter((w) => w !== word).map(stem),
    );

function stem(word: string): string {
  if (/\d/.test(word) || word.length <= 4) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 6) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 5) return word.slice(0, -2);
  if (word.endsWith("es") && /(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

/** "INSAT-3D" and "INSAT3D" must match each other, so hyphenated names index both forms. */
export function tokenise(value: string): string[] {
  const out: string[] = [];
  const matches = value.toLowerCase().match(/[a-z0-9]+(?:[-_][a-z0-9]+)*/g) ?? [];
  for (const raw of matches) {
    const parts = raw.split(/[-_]/).filter(Boolean);
    const candidates = parts.length > 1 ? [parts.join(""), ...parts] : parts;
    for (const piece of candidates) {
      const part = piece.replace(/^(\d+)(?:st|nd|rd|th)$/, "$1"); // "12th" and "Class 12" are the same thing
      if (part.length < 2 || STOP.has(part)) continue;
      out.push(stem(part));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------
type Indexed = Chunk & { terms: string[]; frequencies: Map<string, number>; lower: string; headingTerms: Set<string> };

const allChunks: Chunk[] = [...(seed as Chunk[]), ...(trained.chunks ?? []), ...datasetChunks];
const documentFrequency = new Map<string, number>();
const indexed: Indexed[] = allChunks.map((chunk) => {
  const terms = tokenise(`${chunk.source} ${chunk.heading ?? ""} ${chunk.text}`);
  new Set(terms).forEach((term) => documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1));
  const frequencies = new Map<string, number>();
  terms.forEach((term) => frequencies.set(term, (frequencies.get(term) ?? 0) + 1));
  return { ...chunk, terms, frequencies, lower: chunk.text.toLowerCase(), headingTerms: new Set(tokenise(chunk.heading ?? "")) };
});
const ROLE_SOURCES = new Set(CAREER_ROLES.map((role) => role.title));
const averageLength = indexed.reduce((sum, c) => sum + c.terms.length, 0) / (indexed.length || 1);
const MAX_IDF = Math.log(1 + (indexed.length + 0.5) / 0.5);

// ---------------------------------------------------------------------------
// Topic check: a question must be about space, satellites or something named in the archive.
// Without it, everyday questions ("capital of Australia") look answerable because each
// word happens to appear somewhere in some document.
// ---------------------------------------------------------------------------
const DOMAIN_WORDS = `space spacecraft spaceflight spacewalk satellite orbit orbital rocket launch launcher mission isro nasa esa jaxa cnes
  roscosmos astronaut cosmonaut vyomanaut moon lunar mars solar sun planet galaxy telescope radar sensor payload instrument radiometer
  scatterometer sounder imager atmosphere atmospheric ocean cyclone monsoon rainfall rain aerosol chlorophyll humidity wind cloud vapour
  vapor radiation retrieval algorithm atbd mosdac insat oceansat cartosat risat resourcesat megha tropiques saral scatsat kalpana
  chandrayaan aditya mangalyaan gaganyaan xposat nisar pslv gslv lvm3 slv aslv iss station telemetry geostationary polar
  sunsynchronous remote sensing weightless gravity ascent trajectory propulsion thruster reentry docking crew capsule shuttle soyuz
  sriharikota thumba bhoonidhi stratosphere ionosphere meteorological oceanographic hydrology brightness temperature radiance
  navic irnss gsat edusat hysis astrosat spadex proba scramjet rlv sslv bhaskara rohini aryabhata apple incospar sarabhai dhawan
  mangalyaan bluebird kourou ariane falcon starliner dragon vyommitra payloads gagan antariksh`
  .split(/\s+/)
  .filter(Boolean);
const GENERIC_TITLE_WORDS = new Set(["reference", "comprehensive", "points", "expanded", "encyclopedia", "guide", "notes", "page", "website", "curated", "frequently", "asked", "questions"]);
const DOMAIN = new Set<string>([
  ...DOMAIN_WORDS.map(stem),
  ...tokenise([...new Set(indexed.map((c) => c.source))].join(" ")).filter((t) => !GENERIC_TITLE_WORDS.has(t)), // names of documents in the archive
  ...tokenise(SPACE_MISSIONS.map((m) => m.name).join(" ")), // missions and launch vehicles
  ...tokenise(LAUNCH_VEHICLES.map((v) => v.name).join(" ")),
  ...tokenise(PERSONAS.map((p) => p.name).join(" ")), // the experts users can ask about
]);

export const knowledgeStats = {
  passages: indexed.length,
  documents: new Set(indexed.map((c) => c.source)).size,
  trainedAt: trained.builtAt ?? null,
};

console.log(
  `[astra] ready: ${knowledgeStats.passages} passages from ${knowledgeStats.documents} documents${knowledgeStats.trainedAt ? `, trained ${knowledgeStats.trainedAt.slice(0, 10)}` : ""}`,
);

const idf = (term: string) => {
  const df = documentFrequency.get(term) ?? 0;
  return df === 0 ? MAX_IDF : Math.log(1 + (indexed.length - df + 0.5) / (df + 0.5));
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------
export type Retrieval = {
  chunks: RankedChunk[];
  terms: string[];
  /** 0 to 1: how well the archive covers the question. */
  confidence: number;
};

const sameChunk = (a: Chunk, b: Chunk) =>
  a.source === b.source && a.page === b.page && a.section === b.section;

export function search(query: string, limit = 16): Retrieval {
  const terms = [...new Set(tokenise(query))];
  if (terms.length === 0) return { chunks: [], terms, confidence: 0 };

  const normalizedQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
  const rawWords = normalizedQuery.match(/[a-z0-9-]{3,}/g) ?? [];
  const weights = new Map(terms.map((t) => [t, idf(t)]));
  const wantsComparison = /\b(compar\w*|versus|vs|differences?)\b/i.test(query);

  const ranked = indexed
    .map((chunk) => {
      let score = 0;
      const lengthNorm = 0.25 + 0.75 * (chunk.terms.length / averageLength);
      for (const term of terms) {
        const frequency = chunk.frequencies.get(term) ?? 0;
        if (frequency > 0) {
          score += (weights.get(term) ?? 0) * ((frequency * 2.2) / (frequency + 1.2 * lengthNorm));
        } else {
          for (const alt of SYNONYMS.get(term) ?? []) {
            const altFreq = chunk.frequencies.get(alt) ?? 0;
            if (altFreq > 0) {
              score += 0.5 * idf(alt) * ((altFreq * 2.2) / (altFreq + 1.2 * lengthNorm));
              break;
            }
          }
        }
      }
      // a question word that is also the section title ("payloads", "launch") is a strong hint
      for (const term of terms) if (chunk.headingTerms.has(term)) score += 0.8 * (weights.get(term) ?? 0);
      // "compare X and Y" / "difference between": prefer sections titled as comparisons
      if (wantsComparison && /compar/i.test(chunk.heading ?? "")) score += 8;
      // exact phrase and adjacent word-pair bonuses
      if (normalizedQuery.length > 8 && chunk.lower.includes(normalizedQuery)) score += 12;
      for (let i = 0; i < rawWords.length - 1; i++) {
        if (chunk.lower.includes(`${rawWords[i]} ${rawWords[i + 1]}`)) score += 1.5;
      }
      // Career role notes repeat the shared exam text; for general questions prefer the master guide.
      if (ROLE_SOURCES.has(chunk.source)) score *= 0.9;
      return { source: chunk.source, page: chunk.page, section: chunk.section, heading: chunk.heading ?? null, text: chunk.text, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = ranked.slice(0, 10);
  const neighbours = top.flatMap((match) =>
    ranked
      .filter((c) => c.source === match.source && c.page === match.page && Math.abs(c.section - match.section) === 1)
      .map((c) => ({ ...c, score: c.score * 0.6 })),
  );
  const chunks = [...top, ...neighbours]
    .filter((chunk, index, all) => all.findIndex((c) => sameChunk(c, chunk)) === index)
    .slice(0, limit);

  const onTopic = terms.some((term) => DOMAIN.has(term));
  const confidence = coverage(terms, weights, top.slice(0, 3));
  return { chunks, terms, confidence: onTopic ? confidence : Math.min(confidence, 0.45) };
}

/** Share of the question's (idf-weighted) terms found in the best passages. */
function coverage(terms: string[], weights: Map<string, number>, top: RankedChunk[]) {
  if (top.length === 0) return 0;
  const total = terms.reduce((sum, t) => sum + (weights.get(t) ?? 0), 0);
  if (total === 0) return 0;
  const has = (chunk: Indexed | undefined, term: string) =>
    !!chunk && ((chunk.frequencies.get(term) ?? 0) > 0 || (SYNONYMS.get(term) ?? []).some((a) => (chunk.frequencies.get(a) ?? 0) > 0));
  const lookup = (c: RankedChunk) => indexed.find((i) => sameChunk(i, c));
  const best = lookup(top[0]!);
  const group = top.map(lookup);
  let inBest = 0;
  let inGroup = 0;
  for (const term of terms) {
    const w = weights.get(term) ?? 0;
    if (has(best, term)) inBest += w;
    if (group.some((c) => has(c, term))) inGroup += w;
  }
  return 0.6 * (inBest / total) + 0.4 * (inGroup / total);
}

/** Plain list of passages, used to ground the AI backup. */
export function retrieve(query: string) {
  return search(query).chunks;
}

// ---------------------------------------------------------------------------
// Conversation helpers
// ---------------------------------------------------------------------------
/** Short follow-ups ("what about its payloads?") borrow context from the previous question. */
export function buildQuery(current: string, previous: string[]): string {
  if (tokenise(current).length >= 3 || previous.length === 0) return current;
  return `${current} ${previous.slice(-2).join(" ")}`;
}

const GREETING = /^\s*(hi|hello|hey|hii+|namaste|good\s+(morning|afternoon|evening)|yo)\b[\s!.,?]*$/i;
const THANKS = /^\s*(thanks|thank you|thx|ok(ay)?|great|cool|got it)\b[\s!.,?a-z]*$/i;
const IDENTITY = /^\s*(who are you|what are you|what can you do|help)\b[\s!.,?]*$/i;

export function smallTalk(query: string): string | null {
  if (GREETING.test(query) || IDENTITY.test(query))
    return `Hello, I am **ASTRAAI**, your space research assistant. I answer from a trained archive of **${knowledgeStats.documents} documents** covering ISRO missions, INSAT and Oceansat satellites, MOSDAC data products and algorithm documents.\n\nTry asking:\n- What products are available through MOSDAC?\n- Compare INSAT-3D and INSAT-3DR\n- What is the objective of the NISAR mission?`;
  if (THANKS.test(query)) return "You are welcome. Ask me anything else about space missions, satellites or MOSDAC data.";
  return null;
}

// ---------------------------------------------------------------------------
// Composing detailed answers from the trained passages
// ---------------------------------------------------------------------------
const NOT_FOUND =
  "I could not find that in the ASTRAAI knowledge archive. You can ask about ISRO missions such as Chandrayaan-3, Aditya-L1 or NISAR, launch vehicles, MOSDAC data products, satellites such as INSAT-3D, or the history of the Indian space programme.";

/** What the question is asking for, mapped to section titles in the documents. */
const INTENTS: [RegExp, string[]][] = [
  [/\b(payloads?|instruments?|sensors?|experiments?|transponders?)\b/i, ["payload", "instrument", "sensor"]],
  [/\b(objectives?|aims?|goals?|purpose)\b/i, ["objective", "overview", "mission"]],
  [/\b(launch(ed|es)?|liftoff|rocket)\b/i, ["launch"]],
  [/\b(orbit(al)?|insertion|halo|deployment)\b/i, ["orbit", "insertion", "deployment", "payload"]],
  [/\b(history|timeline|development|delays?|milestones?|events?)\b/i, ["history", "development", "delay", "launch", "mission"]],
  [/\b(results?|findings?|science|observations?|discover\w*|status|achievements?)\b/i, ["science", "result", "observation", "service", "finding"]],
  // Career Hub roles
  [/\b(exams?|selection|gate|recruitment|eligib\w*)\b/i, ["exam", "selection"]],
  [/\b(education|qualifications?|degrees?|diploma|studies)\b/i, ["education"]],
  [/\b(books?|textbooks?|references?|subjects?|syllabus)\b/i, ["book", "subject"]],
  [/\b(roadmap|plan|preparation|prepare|timeline)\b/i, ["roadmap"]],
  [/\b(resources?|courses?|links?)\b/i, ["resource"]],
];

function intentWords(query: string): string[] {
  return [...new Set(INTENTS.filter(([re]) => re.test(query)).flatMap(([, words]) => words))];
}

export function tidy(text: string): string {
  return text
    .replace(/(\[\d+\])+/g, "")
    .replace(/\b([ap])\. ?m\./gi, "$1m") // "5:40 p. m." must not look like a sentence end
    .replace(/\b(e)\. ?(g)\.|\b(i)\. ?(e)\./gi, (_m, a, b, c, d) => `${a ?? c}${b ?? d}`)
    .replace(/\b(Fig|Figs|approx|vs|Dr|Mr|Mrs|No)\./g, "$1")
    .replace(/^\s*\d{1,3}\s+(?=[A-Z])/gm, "") // page numbers stuck to the start of a passage
    .replace(/[•¢●▪◦]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([.,;:)])/g, "$1")
    .replace(/\( +/g, "(")
    .replace(/(\d)\. (\d)/g, "$1.$2") // "1. 25 GHz" -> "1.25 GHz"
    .trim();
}

const ABBREVIATIONS = /\b(?:B\.E\.|B\.Tech|M\.Tech|M\.E\.|B\.Sc\.|M\.Sc\.|Ph\.D\.|etc\.(?=\s*[;,)])|vs\.)/g;

export function splitSentences(text: string): string[] {
  const protectedText = tidy(text).replace(ABBREVIATIONS, (m) => m.replace(/\./g, "\u2024")); // "B.E." is not a sentence end
  return (protectedText.replace(/\n+/g, " \n ").match(/(?:[^.!?\n]|\.(?=\d))+(?:[.!?]+(?=\s|$)|$)|\n/g) ?? [])
    .map((s) => s.trim().replace(/\u2024/g, "."))
    .filter(Boolean);
}

/** Sentences that read like prose (or short fact lines), not table debris. */
export function proseLike(sentence: string, bullet = false): boolean {
  if (sentence.length < (bullet ? 8 : 20) || sentence.length > 700) return false;
  if ((sentence.match(/\//g) ?? []).length >= 4) return false;
  const words = sentence.split(/\s+/);
  if (words.length < (bullet ? 2 : 3)) return false;
  const wordy = words.filter((w) => /^[A-Za-z0-9][A-Za-z0-9'’,;:()%.+°-]*$/.test(w)).length;
  const alpha = words.filter((w) => /[A-Za-z]{2,}/.test(w)).length;
  return wordy / words.length >= 0.7 && alpha / words.length >= 0.6;
}

/** Keeps the readable sentences of a passage, up to a size budget, on sentence boundaries. */
/**
 * In a long list (a launch register, a comparison table) keep only the rows that match the question,
 * so "Which launcher carried GSAT-9?" shows that row instead of its neighbours.
 */
function focusBullets(lines: string[], terms: string[]): string[] {
  const bullets = lines.filter((l) => l.trim().startsWith("- "));
  if (bullets.length < 4 || terms.length === 0) return lines;
  const score = (line: string) => {
    const words = new Set(tokenise(line));
    return terms.reduce((sum, t) => sum + (words.has(t) ? idf(t) : 0), 0);
  };
  const scored = bullets.map((line) => ({ line, score: score(line) }));
  const top = Math.max(...scored.map((x) => x.score));
  if (top === 0) return lines;
  const keep = new Set(scored.filter((x) => x.score >= top * 0.6).slice(0, 6).map((x) => x.line));
  return lines.filter((l) => !l.trim().startsWith("- ") || keep.has(l));
}

function cleanPassage(text: string, budget = 1000, focus: string[] = []): string {
  const kept: string[] = [];
  let length = 0;
  for (const raw of focusBullets(tidy(text).split("\n"), focus)) {
    const line = raw.trim();
    if (!line) continue;
    const isBullet = line.startsWith("- ");
    for (const sentence of isBullet ? [line] : splitSentences(line)) {
      if (!proseLike(sentence.replace(/^- /, ""), isBullet)) continue;
      if (length + sentence.length > budget && kept.length) break;
      kept.push(isBullet ? `\n${sentence}` : sentence);
      length += sentence.length + 1;
    }
  }
  return kept.join(" ").replace(/ ?\n- /g, "\n- ").replace(/([^\n])\n- /, "$1\n\n- ").trim();
}

function emphasise(text: string, terms: string[]): string {
  const distinctive = terms
    .filter((t) => t.length >= 4 && !/^\d+$/.test(t))
    .sort((a, b) => idf(b) - idf(a))
    .slice(0, 3);
  let out = text;
  for (const term of distinctive) {
    const pattern = new RegExp(`(?<![*\\w])(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*)(?![*\\w])`, "gi");
    out = out.replace(pattern, "**$1**");
  }
  return out.replace(/\*\*\*\*/g, "**");
}

const sourceLabel = (c: Chunk) => (c.page ? `${c.source} (p. ${c.page})` : c.source);
const niceHeading = (h?: string | null) => (h ? h.replace(/ > /g, ": ") : "");

// ---- documents that the question names (e.g. "Aditya-L1", "INSAT-3D and INSAT-3DR") ----
const sourceHasHeadings = new Map<string, boolean>();
for (const c of indexed) if (c.heading) sourceHasHeadings.set(c.source, true);
const namedSourceTokens = [...sourceHasHeadings.keys()].map((source) => ({ source, tokens: new Set(tokenise(source)) }));

function namedDocuments(query: string): string[] {
  const q = new Set(tokenise(query));
  return namedSourceTokens
    .filter(({ tokens }) => tokens.size > 0 && [...tokens].every((t) => q.has(t)))
    .map(({ source }) => source)
    .slice(0, 3);
}

function missionFor(source: string): SpaceMission | undefined {
  const tokens = new Set(tokenise(source));
  return SPACE_MISSIONS.find((m) => {
    const name = tokenise(m.name);
    return name.length > 0 && [...tokens].every((t) => name.includes(t));
  });
}

function quickFacts(missions: SpaceMission[]): string {
  if (missions.length === 0) return "";
  if (missions.length === 1) {
    const m = missions[0]!;
    return `**Quick facts**\n\n- **Launch vehicle:** ${m.vehicle}\n- **Launch date:** ${m.launchDate}\n- **Type:** ${m.type}\n- **Orbit:** ${m.orbit}\n- **Status:** ${m.status}`;
  }
  const rows = (label: string, pick: (m: SpaceMission) => string) =>
    `| ${label} | ${missions.map(pick).join(" | ")} |`;
  return [
    `| | ${missions.map((m) => `**${m.name}**`).join(" | ")} |`,
    `|---|${missions.map(() => "---").join("|")}|`,
    rows("Launch vehicle", (m) => m.vehicle),
    rows("Launch date", (m) => m.launchDate),
    rows("Type", (m) => m.type),
    rows("Orbit", (m) => m.orbit),
    rows("Status", (m) => m.status),
  ].join("\n");
}

type Section = { heading: string; body: string; source: string; chunk: Chunk };

/** Pulls the relevant sections of one document, in reading order, within a size budget. */
function documentSections(source: string, wanted: string[], budget: number): Section[] {
  const chunks = indexed.filter((c) => c.source === source).sort((a, b) => a.section - b.section);
  const matches = (c: Indexed) => wanted.some((w) => (c.heading ?? "").toLowerCase().includes(w));
  let chosen = wanted.length ? chunks.filter(matches) : [];
  if (chosen.length === 0) chosen = chunks; // overview-style answer: read the document from the top
  else if (!chosen.includes(chunks[0]!)) chosen = [chunks[0]!, ...chosen];
  const out: Section[] = [];
  let used = 0;
  const perChunk = Math.max(450, Math.min(1000, Math.floor(budget / Math.min(chosen.length, 5))));
  for (const chunk of chosen) {
    const body = cleanPassage(chunk.text, perChunk);
    if (!body) continue;
    // skip passages that repeat what is already shown
    if (out.some((o) => o.body.slice(0, 80) === body.slice(0, 80))) continue;
    if (used + body.length > budget && out.length >= 2) break;
    out.push({ heading: niceHeading(chunk.heading), body, source, chunk });
    used += body.length;
  }
  return out;
}

function renderSections(sections: Section[], terms: string[]): string {
  let lastHeading = "";
  return sections
    .map((s) => {
      const heading = s.heading && s.heading !== lastHeading ? `**${s.heading}**\n\n` : "";
      lastHeading = s.heading;
      return `${heading}${emphasise(s.body, terms)}`;
    })
    .join("\n\n");
}

export type LocalAnswer = {
  /** True when the archive can answer without the AI backup. */
  confident: boolean;
  confidence: number;
  text: string;
  sources: string[];
};

export const CONFIDENCE_THRESHOLD = Number(process.env["ASTRA_LOCAL_CONFIDENCE"] ?? 0.62);

export function answerLocally(
  query: string,
  options: { live?: string; personaName?: string; threshold?: number } = {},
): LocalAnswer {
  const talk = smallTalk(query);
  if (talk) return { confident: true, confidence: 1, text: talk, sources: [] };

  const found = search(query);
  const docs = namedDocuments(query);
  const live = options.live?.trim();
  const threshold = options.threshold ?? CONFIDENCE_THRESHOLD;
  const confident = found.confidence >= threshold || docs.length > 0 || Boolean(live);
  const confidence = docs.length > 0 ? Math.max(found.confidence, 0.9) : found.confidence;

  const parts: string[] = [];
  if (live) parts.push(`### Live data\n\n${live}`);
  const sources: string[] = [];

  if (docs.length > 0) {
    // The question names specific documents: answer from those, section by section.
    const wanted = intentWords(query);
    const budget = Math.floor(5200 / docs.length);
    const missions = docs.map(missionFor).filter((m): m is SpaceMission => Boolean(m));
    if (docs.length > 1 && missions.length > 1) parts.push(`### At a glance\n\n${quickFacts(missions)}`);
    for (const source of docs) {
      const sections = documentSections(source, wanted, budget);
      if (sections.length === 0) continue;
      const mission = missionFor(source);
      const facts = docs.length === 1 && !wanted.length && mission ? `${quickFacts([mission])}\n\n` : "";
      parts.push(`### ${mission?.name ?? source}\n\n${facts}${renderSections(sections, found.terms)}`);
      sources.push(source);
    }
  } else {
    // General question: the best passages, grouped by document.
    const best = found.chunks[0]?.score ?? 0;
    const top = found.chunks.filter((c) => c.score >= best * 0.45).slice(0, confident ? 7 : 3);
    const groups = new Map<string, RankedChunk[]>();
    for (const chunk of top) groups.set(chunk.source, [...(groups.get(chunk.source) ?? []), chunk]);
    const grouped = [...groups.entries()]
      .filter(([, list]) => Math.max(...list.map((c) => c.score)) >= best * 0.6)
      .slice(0, 3);
    const perGroup = Math.floor(4200 / Math.max(grouped.length, 1));
    const blocks: string[] = [];
    const shown: Set<string>[] = []; // wording already used, so the same passage is not repeated for several sources
    for (const [source, chunks] of grouped) {
      const seen = new Set<string>();
      const sections: Section[] = [];
      let used = 0;
      const [bestChunk, ...restChunks] = [...chunks].sort((a, b) => b.score - a.score);
      const ordered = bestChunk ? [bestChunk, ...restChunks.sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || a.section - b.section)] : [];
      for (const chunk of ordered) {
        const body = cleanPassage(chunk.text, Math.min(900, perGroup), found.terms);
        const key = body.slice(0, 80);
        if (!body || seen.has(key) || (used + body.length > perGroup && sections.length)) continue;
        const words = new Set(tokenise(body));
        const overlap = (other: Set<string>) => [...words].filter((w) => other.has(w)).length / Math.max(words.size, 1);
        if (shown.some((other) => overlap(other) > 0.6)) continue;
        shown.push(words);
        seen.add(key);
        sections.push({ heading: niceHeading(chunk.heading), body, source, chunk });
        used += body.length;
      }
      if (sections.length === 0) continue;
      blocks.push(`### ${source}\n\n${renderSections(sections, found.terms)}`);
      sources.push(...sections.map((s) => sourceLabel(s.chunk)));
    }
    if (blocks.length === 0 && !live) return { confident: false, confidence, text: NOT_FOUND, sources: [] };
    if (!confident && blocks.length)
      parts.push("I am not fully certain, but these are the closest passages in the archive.");
    // a one-line direct answer first, taken from the best-matching passage
    const lead = found.chunks[0] ? (cleanPassage(found.chunks[0].text, 260).split(/(?<=[.!?])\s/)[0] ?? "") : "";
    const leadKey = lead.replace(/\W+/g, "").slice(0, 60);
    const repeated = blocks.some((b) => b.replace(/\W+/g, "").includes(leadKey));
    if (confident && lead && blocks.length > 1 && !repeated) parts.push(`**In short:** ${emphasise(lead, found.terms)}`);
    parts.push(...blocks);
  }

  if (parts.length === 0) {
    return { confident: false, confidence, text: NOT_FOUND, sources: [] };
  }
  const unique = [...new Set(sources)].slice(0, 5);
  return { confident, confidence, text: parts.join("\n\n"), sources: unique };
}

// ---------------------------------------------------------------------------
// Diagnostics: why a question scores the way it does (used by `npm run ask`)
// ---------------------------------------------------------------------------
export function diagnose(query: string) {
  const found = search(query);
  const top = found.chunks.slice(0, 3);
  const lookup = (c: RankedChunk) => indexed.find((i) => sameChunk(i, c));
  const group = top.map(lookup);
  const has = (chunk: Indexed | undefined, term: string) =>
    !!chunk && ((chunk.frequencies.get(term) ?? 0) > 0 || (SYNONYMS.get(term) ?? []).some((a) => (chunk.frequencies.get(a) ?? 0) > 0));
  const terms = found.terms.map((term) => ({
    term,
    weight: idf(term),
    inBest: has(group[0], term),
    inTop: group.some((c) => has(c, term)),
    onTopic: DOMAIN.has(term),
  }));
  return {
    confidence: found.confidence,
    threshold: CONFIDENCE_THRESHOLD,
    onTopic: terms.some((t) => t.onTopic),
    terms,
    top: top.map((c) => ({ source: c.source, heading: c.heading ?? null, page: c.page, score: c.score, preview: c.text.replace(/\s+/g, " ").slice(0, 150) })),
  };
}

// ---------------------------------------------------------------------------
// Mission briefs (used by the Explorer page)
// ---------------------------------------------------------------------------
export function findMission(name: string): SpaceMission | undefined {
  const key = tokenise(name).join(" ");
  return (
    SPACE_MISSIONS.find((m) => tokenise(m.name).join(" ") === key) ??
    SPACE_MISSIONS.find((m) => m.name.toLowerCase().includes(name.toLowerCase().trim()))
  );
}

export function missionBrief(name: string, live?: string): string | null {
  const mission = findMission(name);
  if (!mission) return null;
  const doc = namedSourceTokens.find(({ source }) => missionFor(source)?.name === mission.name)?.source;
  const sections = doc ? documentSections(doc, [], 5200) : [];
  return [
    `## ${mission.name}`,
    `### Mission overview\n\n${mission.summary}`,
    `### Quick facts\n\n- **Launch vehicle:** ${mission.vehicle}\n- **Launch date:** ${mission.launchDate}\n- **Type:** ${mission.type}\n- **Orbit:** ${mission.orbit}\n- **Status:** ${mission.status}`,
    live ? `### Live data\n\n${live}` : "",
    sections.length ? `### Details from the archive\n\n${renderSections(sections, [])}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
