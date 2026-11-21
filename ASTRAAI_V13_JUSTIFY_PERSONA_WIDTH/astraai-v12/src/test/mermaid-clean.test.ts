import { describe, expect, it } from "vitest";
import { cleanMermaid } from "@/lib/mermaid-clean";

describe("cleanMermaid", () => {
  it("removes code fences and chatter before the diagram", () => {
    const reply = "Here is your diagram:\n```mermaid\nflowchart TD\n  A[\"Launch\"] --> B[\"Orbit\"]\n```\nHope this helps!";
    expect(cleanMermaid(reply)).toBe('flowchart TD\n  A["Launch"] --> B["Orbit"]');
  });
  it("accepts plain Mermaid and other diagram kinds", () => {
    expect(cleanMermaid("sequenceDiagram\n  G->>S: command")).toBe("sequenceDiagram\n  G->>S: command");
    expect(cleanMermaid("timeline\n  title X\n  1. Launch")).toContain("timeline");
  });
  it("returns nothing when the reply holds no diagram", () => {
    expect(cleanMermaid("Sorry, I cannot help with that.")).toBe("");
  });
});
