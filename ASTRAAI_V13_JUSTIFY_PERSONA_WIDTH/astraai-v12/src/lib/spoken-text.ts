/** Turns a Markdown answer into text that sounds right when read aloud, and keeps it short. */
export function toSpokenText(markdown: string, maxChars = 1800): string {
  const plain = markdown
    .replace(/^\s*\|.*\|\s*$/gm, " ") // tables
    .replace(/^\s*\*?Sources?:.*$/gim, " ")
    .replace(/\*\*?|__?|`+|#{1,6}\s?|^>\s?/gm, " ")
    .replace(/^\s*[-*]\s+/gm, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;
  const cut = plain.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (end > maxChars * 0.5 ? cut.slice(0, end + 1) : cut).trim();
}
