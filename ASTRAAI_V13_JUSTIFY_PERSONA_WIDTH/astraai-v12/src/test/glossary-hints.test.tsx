import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlossaryHints } from "@/components/glossary-hints";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RECT = { left: 100, right: 160, top: 200, bottom: 216, width: 60, height: 16 };
let container: HTMLDivElement;
let root: Root;
let caret: { node: Node; offset: number } | null = null;
let rect = RECT;

const pointer = (type: string, x: number, y: number, pointerType = "mouse") => {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
};
const fire = (event: Event) => act(async () => void document.dispatchEvent(event));
const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const textOf = (selector: string) => container.querySelector(selector)!.firstChild as Text;
const tooltip = () => document.querySelector(".glossary-tooltip");

async function mount(enabled = true) {
  await act(async () => root.render(
    <>
      <main data-glossary-root>
        <p id="a">Each satellite carries a payload.</p>
        <p id="b">Nothing special in this line.</p>
        <h2 id="h">Payload heading</h2>
      </main>
      <GlossaryHints enabled={enabled} />
    </>,
  ));
}
const overPayload = () => {
  const text = textOf("#a");
  caret = { node: text, offset: text.data.indexOf("payload") + 2 };
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  caret = null;
  rect = RECT;
  (document as unknown as Record<string, unknown>)["caretPositionFromPoint"] = () => (caret ? { offsetNode: caret.node, offset: caret.offset } : null);
  Range.prototype.getClientRects = (() => [rect]) as unknown as typeof Range.prototype.getClientRects;
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  delete (document as unknown as Record<string, unknown>)["caretPositionFromPoint"];
  vi.unstubAllGlobals();
});

describe("word hints", () => {
  it("shows an i icon after the word and its meaning on hover", async () => {
    await mount();
    overPayload();
    await fire(pointer("pointermove", 130, 208));
    expect(tooltip()?.textContent).toContain("Payload");
    expect(tooltip()?.textContent).toContain("Equipment carried by a satellite to perform its main job.");
    const icon = document.querySelector<HTMLElement>(".glossary-i")!;
    expect(icon).not.toBeNull();
    expect(Number.parseFloat(icon.style.left)).toBe(RECT.right + 3); // right after the word
    expect(tooltip()?.getAttribute("role")).toBe("tooltip");
  });

  it("keeps the card open while the pointer stays on the word (showing it must not trigger a rescan)", async () => {
    await mount();
    overPayload();
    await fire(pointer("pointermove", 130, 208));
    expect(tooltip()).not.toBeNull();
    await wait(400); // longer than the rescan delay
    expect(tooltip()).not.toBeNull();
  });

  it("explains plural forms with the same meaning", async () => {
    await mount();
    const text = textOf("#a");
    caret = { node: text, offset: text.data.indexOf("satellite") + 1 };
    await fire(pointer("pointermove", 130, 208));
    expect(tooltip()?.textContent).toContain("An object that orbits a planet; it can be natural or human-made.");
  });

  it("hides when the pointer leaves the word", async () => {
    await mount();
    overPayload();
    await fire(pointer("pointermove", 130, 208));
    expect(tooltip()).not.toBeNull();
    caret = { node: textOf("#b"), offset: 3 };
    await fire(pointer("pointermove", 400, 500));
    await wait(160);
    expect(tooltip()).toBeNull();
  });

  it("ignores a pointer that is near the word but not on it", async () => {
    await mount();
    overPayload();
    await fire(pointer("pointermove", 600, 700)); // the nearest text is the word, but the pointer is far away
    expect(tooltip()).toBeNull();
  });

  it("works with a tap on touch screens and closes with a second tap or Escape", async () => {
    await mount();
    overPayload();
    await fire(pointer("pointerdown", 130, 208, "touch"));
    expect(tooltip()).not.toBeNull();
    caret = { node: textOf("#b"), offset: 3 };
    await fire(pointer("pointerdown", 400, 500, "touch"));
    expect(tooltip()).toBeNull();
    overPayload();
    await fire(pointer("pointerdown", 130, 208, "touch"));
    expect(tooltip()).not.toBeNull();
    await fire(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(tooltip()).toBeNull();
  });

  it("closes an open card when switched off", async () => {
    await mount();
    overPayload();
    await fire(pointer("pointermove", 130, 208));
    expect(tooltip()).not.toBeNull();
    await mount(false);
    expect(tooltip()).toBeNull();
  });

  it("lets the user click elsewhere while the card is open", async () => {
    let clicked = 0;
    await act(async () => root.render(
      <>
        <aside><button id="x" onClick={() => { clicked += 1; }}>Word hints: On</button></aside>
        <main data-glossary-root><p id="a">Each satellite carries a payload.</p></main>
        <GlossaryHints enabled />
      </>,
    ));
    overPayload();
    await fire(pointer("pointermove", 130, 208));
    expect(tooltip()).not.toBeNull();
    await act(async () => void document.getElementById("x")!.click());
    expect(clicked).toBe(1);
  });

  it("does nothing inside headings and when switched off", async () => {
    await mount();
    caret = { node: textOf("#h"), offset: 2 };
    await fire(pointer("pointermove", 130, 208));
    expect(tooltip()).toBeNull();
    await mount(false);
    overPayload();
    await fire(pointer("pointermove", 130, 208));
    expect(tooltip()).toBeNull();
  });

  it("picks up text that appears later, such as a streamed answer", async () => {
    await mount();
    const p = document.createElement("p");
    p.id = "late";
    p.textContent = "The ground station reads telemetry.";
    document.querySelector("main")!.append(p);
    await wait(300);
    const text = textOf("#late");
    caret = { node: text, offset: text.data.indexOf("telemetry") + 2 };
    await fire(pointer("pointermove", 130, 208));
    expect(tooltip()?.textContent).toContain("Information sent from a spacecraft or satellite about its condition and performance.");
  });

  it("underlines terms with the CSS Custom Highlight API when the browser has it, and cleans up", async () => {
    const registry = new Map<string, { ranges: Range[] }>();
    vi.stubGlobal("CSS", { highlights: registry });
    vi.stubGlobal("Highlight", class { ranges: Range[] = []; add(r: Range) { this.ranges.push(r); } });
    await mount();
    expect(registry.get("glossary-term")?.ranges).toHaveLength(2); // "satellite" and "payload"; the heading is skipped
    await act(async () => root.unmount());
    expect(registry.has("glossary-term")).toBe(false);
    root = createRoot(container);
  });
});
