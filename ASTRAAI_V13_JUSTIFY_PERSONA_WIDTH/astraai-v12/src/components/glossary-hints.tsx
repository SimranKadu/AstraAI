import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { caretFromPoint, getMatcher, pointInRects, scanGlossary, type DomMatch, type GlossaryEntry } from "@/lib/glossary";

type Box = { left: number; right: number; top: number; bottom: number };
type Active = { entry: GlossaryEntry; box: Box };

const CARD_WIDTH = 288;
const HIGHLIGHT = "glossary-term";

/**
 * Word hints. Glossary terms inside `[data-glossary-root]` get a dotted underline; hovering one (or tapping it on a
 * touch screen) shows an "i" icon after the word and a card with its meaning.
 *
 * It only reads the page (text positions) and draws the underline with the CSS Custom Highlight API,
 * so it never edits the text React is managing.
 */
export function GlossaryHints({ enabled = true, rootSelector = "[data-glossary-root]" }: { enabled?: boolean; rootSelector?: string }) {
  const [active, setActive] = useState<Active | null>(null);

  useEffect(() => {
    if (!enabled) return () => undefined;
    const matcher = getMatcher();
    const canHighlight = typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
    let byNode = new Map<Node, DomMatch[]>();
    let ranges = new Map<DomMatch, Range>();
    let current: DomMatch | null = null;
    let currentText = "";
    let scanTimer = 0;
    let hideTimer = 0;

    const hide = () => {
      window.clearTimeout(hideTimer);
      current = null;
      setActive(null);
    };

    const scan = () => {
      const root = document.querySelector(rootSelector);
      const matches = root ? scanGlossary(root, matcher) : [];
      byNode = new Map();
      ranges = new Map();
      const highlight = canHighlight ? new Highlight() : null;
      for (const match of matches) {
        byNode.set(match.node, [...(byNode.get(match.node) ?? []), match]);
        const range = document.createRange();
        range.setStart(match.node, match.start);
        range.setEnd(match.node, match.end);
        ranges.set(match, range);
        highlight?.add(range);
      }
      if (highlight) CSS.highlights.set(HIGHLIGHT, highlight);
      // keep the card open unless the word it explains has changed or gone
      if (current && !(current.node.isConnected && current.node.data.slice(current.start, current.end) === currentText)) hide();
    };
    const scheduleScan = () => {
      window.clearTimeout(scanTimer);
      scanTimer = window.setTimeout(scan, 150);
    };

    /** The glossary term under the pointer, or null. The caret lookup snaps to the nearest text, so confirm with the box. */
    const matchAt = (x: number, y: number): DomMatch | null => {
      const caret = caretFromPoint(x, y);
      const list = caret && byNode.get(caret.node);
      if (!caret || !list) return null;
      for (const match of list) {
        if (caret.offset < match.start || caret.offset > match.end) continue;
        const rects = ranges.get(match)?.getClientRects?.();
        if (!rects || pointInRects(rects, x, y)) return match;
      }
      return null;
    };

    const show = (match: DomMatch) => {
      window.clearTimeout(hideTimer);
      if (current === match) return;
      const rects = ranges.get(match)?.getClientRects?.();
      if (!rects || rects.length === 0) return;
      const first = rects[0]!;
      const last = rects[rects.length - 1]!;
      current = match;
      currentText = match.node.data.slice(match.start, match.end);
      setActive({
        entry: match.entry,
        box: { left: first.left, right: last.right, top: Math.min(first.top, last.top), bottom: Math.max(first.bottom, last.bottom) },
      });
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const match = matchAt(event.clientX, event.clientY);
      if (match) show(match);
      else if (current) {
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(hide, 90);
      }
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return; // mouse users hover; touch and pen users tap
      const match = matchAt(event.clientX, event.clientY);
      if (match && match !== current) show(match);
      else hide();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    // Showing the card adds elements to the page; those changes must not trigger a rescan.
    const isOwn = (node: Node) => node instanceof Element && (node.classList.contains("glossary-tooltip") || node.classList.contains("glossary-i"));
    const observer = new MutationObserver((records) => {
      if (records.every((r) => [...r.addedNodes, ...r.removedNodes].length > 0 && [...r.addedNodes, ...r.removedNodes].every(isOwn))) return;
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    scan();

    return () => {
      window.clearTimeout(scanTimer);
      window.clearTimeout(hideTimer);
      observer.disconnect();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      if (canHighlight) CSS.highlights.delete(HIGHLIGHT);
      setActive(null); // a card from this run must not outlive it
    };
  }, [enabled, rootSelector]);

  if (!enabled || !active || typeof document === "undefined") return null;
  const { box, entry } = active;
  const left = Math.max(8, Math.min(box.left, window.innerWidth - CARD_WIDTH - 8));
  const below = box.bottom + 140 < window.innerHeight;
  // Rendered in place (not in a portal): the card is position: fixed, so it still floats above the page.
  return (
    <>
      <span
        className="glossary-i"
        aria-hidden="true"
        style={{ left: box.right + 3, top: (box.top + box.bottom) / 2 - 8 }}
      >
        <Info className="size-4" />
      </span>
      <div
        role="tooltip"
        className="glossary-tooltip"
        style={below ? { left, top: box.bottom + 8, width: CARD_WIDTH } : { left, top: box.top - 8, width: CARD_WIDTH, transform: "translateY(-100%)" }}
      >
        <div className="glossary-tooltip-term">
          <Info className="size-3.5" aria-hidden="true" />
          {entry.term}
        </div>
        <p>{entry.meaning}</p>
      </div>
    </>
  );
}
