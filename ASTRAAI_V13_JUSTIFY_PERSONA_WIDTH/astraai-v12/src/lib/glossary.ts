/**
 * Word hints: finds glossary terms in text and in the page, so the app can show their meaning on hover.
 * The terms and meanings come from the AstraAI Hard Words Glossary (reference/glossary).
 */
import data from "@/data/glossary.json";

export type GlossaryEntry = { id: string; term: string; meaning: string; aliases: string[] };
export type GlossaryMatch = { start: number; end: number; entry: GlossaryEntry };
export type DomMatch = GlossaryMatch & { node: Text };

export const GLOSSARY = data as GlossaryEntry[];

type Matcher = { ci: RegExp | null; cs: RegExp | null; lookup: Map<string, GlossaryEntry> };

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Acronyms (API, SST, HDF5) match only in capitals, so ordinary words such as "rag" are left alone. */
const isAcronym = (alias: string) => !/[a-z]/.test(alias) && /[A-Z]{2,}/.test(alias);

function variants(alias: string): string[] {
  const out = [alias, `${alias}s`];
  if (/[^aeiou]y$/i.test(alias)) out.push(`${alias.slice(0, -1)}ies`);
  if (/(s|x|ch|sh)$/i.test(alias)) out.push(`${alias}es`);
  return out;
}

export function buildMatcher(entries: GlossaryEntry[] = GLOSSARY): Matcher {
  const lookup = new Map<string, GlossaryEntry>();
  const ci: string[] = [];
  const cs: string[] = [];
  for (const entry of entries)
    for (const alias of entry.aliases) {
      const acronym = isAcronym(alias);
      for (const form of variants(alias)) {
        const key = acronym ? `cs:${form.replace(/\s+/g, " ")}` : `ci:${normalise(form)}`;
        if (!lookup.has(key)) lookup.set(key, entry);
        (acronym ? cs : ci).push(escape(form).replace(/ /g, "\\s+"));
      }
    }
  const build = (list: string[], flags: string) =>
    list.length
      ? new RegExp(`(?<![A-Za-z0-9])(?:${[...new Set(list)].sort((a, b) => b.length - a.length).join("|")})(?![A-Za-z0-9])`, flags)
      : null;
  return { ci: build(ci, "gi"), cs: build(cs, "g"), lookup };
}

let shared: Matcher | undefined;
export const getMatcher = () => (shared ??= buildMatcher());

/** Glossary terms in a piece of text, longest match first and never overlapping. */
export function findTerms(text: string, matcher: Matcher = getMatcher()): GlossaryMatch[] {
  const found: GlossaryMatch[] = [];
  const run = (re: RegExp | null, caseSensitive: boolean) => {
    if (!re) return;
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const raw = m[0].replace(/\s+/g, " ");
      const entry = matcher.lookup.get(caseSensitive ? `cs:${raw}` : `ci:${normalise(raw)}`);
      if (entry) found.push({ start: m.index, end: m.index + m[0].length, entry });
    }
  };
  run(matcher.ci, false);
  run(matcher.cs, true);
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const result: GlossaryMatch[] = [];
  let end = -1;
  for (const match of found)
    if (match.start >= end) {
      result.push(match);
      end = match.end;
    }
  return result;
}

/** Parts of a page that never get word hints: headings, links, forms, code and anything marked data-no-glossary. */
const SKIPPED =
  "script,style,noscript,textarea,input,select,option,svg,code,pre,kbd,h1,h2,h3,h4,h5,h6,a,[data-no-glossary],[contenteditable='true'],[role='tooltip']";

/** Finds every glossary term in the text of `root`. Reads the page only; it never changes it. */
export function scanGlossary(root: Element, matcher: Matcher = getMatcher()): DomMatch[] {
  const out: DomMatch[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIPPED)) return NodeFilter.FILTER_REJECT;
      return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    for (const match of findTerms(text.data, matcher)) out.push({ ...match, node: text });
  }
  return out;
}

/** The text position under the pointer, in browsers that support either lookup method. */
export function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y);
    return position ? { node: position.offsetNode, offset: position.offset } : null;
  }
  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  }
  return null;
}

export function pointInRects(rects: ArrayLike<{ left: number; right: number; top: number; bottom: number }>, x: number, y: number, pad = 2) {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return true;
  }
  return false;
}
