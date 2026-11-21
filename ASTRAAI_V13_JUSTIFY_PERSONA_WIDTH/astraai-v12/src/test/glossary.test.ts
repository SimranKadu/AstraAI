import path from "node:path";
import { describe, expect, it } from "vitest";
import { findTerms, GLOSSARY, scanGlossary } from "@/lib/glossary";

const found = (text: string) => findTerms(text).map((m) => [text.slice(m.start, m.end), m.entry.term]);

describe("glossary data comes from the Hard Words Glossary document", () => {
  it("has every term and meaning of the document, word for word", async () => {
    const mammoth = (await import("mammoth")).default;
    const { value: html } = await mammoth.convertToHtml({ path: path.resolve(process.cwd(), "reference/glossary/AstraAI_Hard_Words_Glossary.docx") });
    const plain = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const rows = (html.match(/<tr[\s\S]*?<\/tr>/g) ?? []).map((r) => (r.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map(plain)).filter((r) => r.length === 2 && !/^word/i.test(r[0]!));
    expect(rows).toHaveLength(73);
    expect(GLOSSARY).toHaveLength(73);
    for (const [term, meaning] of rows) {
      const entry = GLOSSARY.find((e) => e.term === term);
      expect(entry, term).toBeDefined();
      expect(entry!.meaning, term).toBe(meaning);
    }
  });
});

describe("finding terms in text", () => {
  it("matches plurals and ignores partial words", () => {
    expect(found("The satellites carry a payload into orbit, not the Orbiter.")).toEqual([["satellites", "Satellite"], ["payload", "Payload"], ["orbit", "Orbit"]]);
    expect(found("Entities and relationships")).toEqual([["Entities", "Entity"], ["relationships", "Relationship"]]);
  });
  it("prefers the longest term and keeps similar names apart", () => {
    expect(found("Spatial Resolution beats Resolution")).toEqual([["Spatial Resolution", "Spatial Resolution"], ["Resolution", "Resolution"]]);
    expect(found("INSAT-3DR and INSAT-3D")).toEqual([["INSAT-3DR", "INSAT-3DR"], ["INSAT-3D", "INSAT-3D"]]);
  });
  it("knows short forms, and keeps acronyms case-sensitive", () => {
    expect(found("Use SST and the API.").map((m) => m[1])).toEqual(["Sea Surface Temperature (SST)", "API"]);
    expect(found("sst api rag")).toEqual([]);
    expect(found("a rag and an api")).toEqual([]);
    expect(found("EPSG:4326 and WGS 84").map((m) => m[1])).toEqual(["EPSG:4326 / WGS 84", "EPSG:4326 / WGS 84"]);
  });
  it("matches across line breaks", () => {
    expect(found("the ground\n   station")[0]?.[1]).toBe("Ground Station");
  });
});

describe("scanning a page", () => {
  it("annotates body text but not headings, links, buttons-as-nav, code or marked areas", () => {
    document.body.innerHTML = `<div id="r">
      <p>The payload goes to orbit.</p>
      <h2>Payload heading</h2>
      <a href="#">satellite link</a>
      <pre>telemetry code</pre>
      <div data-no-glossary>sensor area</div>
      <label>imager label text</label><input value="atmosphere">
      <ul><li>Each ground station</li></ul>
    </div>`;
    const matches = scanGlossary(document.getElementById("r")!);
    expect(matches.map((m) => m.node.data.slice(m.start, m.end).toLowerCase())).toEqual(["payload", "orbit", "imager", "ground station"]);
  });
});
