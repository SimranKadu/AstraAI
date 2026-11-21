import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const user = { id: "u1", email: "test@example.com" };
  return {
    supabase: {
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { access_token: "t", user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({}),
      },
    },
  };
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 60000 });

let el: HTMLDivElement;
let root: Root;
let caret: { node: Node; offset: number } | null = null;

const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const pointer = (type: string, x: number, y: number) => {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
};
const button = (re: RegExp) => [...el.querySelectorAll("button")].find((b) => re.test(b.textContent ?? ""));
const tooltip = () => document.querySelector(".glossary-tooltip");

async function open(path: string) {
  const { routeTree } = await import("@/routeTree.gen");
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() }, history: createMemoryHistory({ initialEntries: [path] }) });
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root.render(<RouterProvider router={router} />));
  await wait(600);
}
function textNodeWith(phrase: string) {
  const walker = document.createTreeWalker(document.querySelector("[data-glossary-root]")!, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes(phrase)) return n as Text;
  throw new Error(`no text containing "${phrase}"`);
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (document as unknown as Record<string, unknown>)["caretPositionFromPoint"] = () => (caret ? { offsetNode: caret.node, offset: caret.offset } : null);
  Range.prototype.getClientRects = (() => [{ left: 100, right: 180, top: 300, bottom: 316 }]) as unknown as typeof Range.prototype.getClientRects;
  localStorage.clear();
  caret = null;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
  delete (document as unknown as Record<string, unknown>)["caretPositionFromPoint"];
});

describe("word hints across the app", () => {
  it("shows the glossary meaning when hovering a term on the Career Hub, and can be switched off", async () => {
    await open("/careers");
    const text = textNodeWith("launch vehicles");
    caret = { node: text, offset: text.data.indexOf("launch vehicles") + 4 };
    await act(async () => void document.dispatchEvent(pointer("pointermove", 140, 308)));
    expect(tooltip()?.textContent).toContain("A rocket used to carry a satellite or spacecraft into space.");
    expect(document.querySelector(".glossary-i")).not.toBeNull();

    await act(async () => void button(/Word hints: On/)!.click());
    expect(button(/Word hints: Off/)).toBeDefined();
    expect(localStorage.getItem("astraai.wordHints")).toBe("off");
    expect(tooltip()).toBeNull();
    await act(async () => void document.dispatchEvent(pointer("pointermove", 141, 308)));
    expect(tooltip()).toBeNull();
  });

  it("remembers that hints were switched off", async () => {
    localStorage.setItem("astraai.wordHints", "off");
    await open("/careers");
    expect(button(/Word hints: Off/)).toBeDefined();
  });

});
