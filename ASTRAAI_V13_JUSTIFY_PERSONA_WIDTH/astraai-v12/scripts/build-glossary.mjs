#!/usr/bin/env node
/**
 * Builds src/data/glossary.json from reference/glossary/AstraAI_Hard_Words_Glossary.docx.
 *   node scripts/build-glossary.mjs
 * Each row of the document's table is one term and its short meaning. Terms such as
 * "Sea Surface Temperature (SST)" also match their short form, and "EPSG:4326 / WGS 84" matches both names.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mammoth from "mammoth";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "reference", "glossary", "AstraAI_Hard_Words_Glossary.docx");
const OUT = path.join(ROOT, "src", "data", "glossary.json");

const decode = (t) => t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const plain = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const { value: html } = await mammoth.convertToHtml({ path: SOURCE });
const rows = (html.match(/<tr[\s\S]*?<\/tr>/g) ?? []).map((row) => (row.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map(plain));
const entries = [];
for (const [term, meaning] of rows) {
  if (!term || !meaning || /^word\s*\/\s*term$/i.test(term)) continue;
  const names = new Set();
  const paren = term.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (paren) {
    names.add(paren[1].trim());
    names.add(paren[2].trim());
  } else term.split(/\s+\/\s+/).forEach((part) => names.add(part.trim()));
  names.add(term);
  entries.push({
    id: term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    term,
    meaning,
    aliases: [...names].filter(Boolean),
  });
}
entries.sort((a, b) => a.term.localeCompare(b.term));
await writeFile(OUT, `${JSON.stringify(entries, null, 1)}\n`);
console.log(`Glossary: ${entries.length} terms -> src/data/glossary.json`);
