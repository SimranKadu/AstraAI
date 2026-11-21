/** Reads the text of an uploaded PDF on the server, so any AI model can be given plain text. */
export type PdfText = { pages: { page: number; text: string }[]; text: string };

export async function extractPdfText(base64: string): Promise<PdfText> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const raw = (Array.isArray(text) ? text : [text]).map((value, index) => ({
    page: index + 1,
    text: value.replace(/\s+/g, " ").trim(),
  }));
  const header = repeatedHeader(raw.map((p) => p.text));
  const pages = raw
    .map((p) => ({ page: p.page, text: header ? p.text.replace(header, " ").replace(/\s+/g, " ").trim() : p.text }))
    .filter((page) => page.text.length > 0);
  return { pages, text: pages.map((p) => p.text).join("\n\n") };
}

/** Running page header such as "Megha-Tropiques ATBD Ver 3.0 16", found as text most pages start with. */
function repeatedHeader(pages: string[]): RegExp | null {
  if (pages.length < 4) return null;
  const starts = pages.map((p) => p.split(" ").slice(0, 10));
  for (let words = 8; words >= 2; words--) {
    const counts = new Map<string, number>();
    for (const start of starts) {
      if (start.length < words) continue;
      const prefix = start.slice(0, words).join(" ");
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    const [prefix, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    if (prefix && count >= pages.length * 0.4) {
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`${escaped}(?:\\s+\\d{1,3})?`, "g"); // header plus the page number after it
    }
  }
  return null;
}
