/** Turns the AI's reply into plain Mermaid source: removes code fences, a stray "mermaid" label and any chatter before the diagram. */
const STARTS = /^(flowchart|graph|sequenceDiagram|mindmap|timeline|gantt|stateDiagram|classDiagram|erDiagram|journey|pie)\b/;

export function cleanMermaid(raw: string): string {
  let text = raw.replace(/\r/g, "").trim();
  const fenced = /```(?:mermaid)?\s*\n([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) text = fenced[1].trim();
  text = text.replace(/```(?:mermaid)?/gi, "").trim();
  const lines = text.split("\n");
  const start = lines.findIndex((line) => STARTS.test(line.trim()));
  if (start === -1) return "";
  return lines.slice(start).join("\n").replace(/—/g, "-").trim();
}
