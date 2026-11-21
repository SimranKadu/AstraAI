import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The page chrome (sidebar, links) needs the full router; only the simulation itself is under test.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Panel: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <section aria-label={title}>{children}</section>
  ),
}));

vi.setConfig({ testTimeout: 30000 }); // the animation test steps ~1000 frames

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let frames: ((time: number) => void)[] = [];
let container: HTMLDivElement;

beforeEach(() => {
  frames = [];
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); // sliders measure themselves
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(() => {
  container.remove();
  vi.unstubAllGlobals();
});

async function mount() {
  const { Route } = await import("@/routes/_authenticated/simulation");
  const Page = Route.options.component as () => React.ReactNode;
  const root = createRoot(container);
  await act(async () => root.render(<Page />));
  return root;
}

const button = (label: RegExp) =>
  [...container.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""));

/** Plays the animation to the end by feeding fake animation frames (1 frame = 100 ms of flight). */
async function playToEnd() {
  let time = 0;
  for (let i = 0; i < 1400 && frames.length; i++) {
    const next = frames.shift()!;
    time += 100;
    await act(async () => next(time));
  }
}

describe("Mission simulation page", () => {
  it("renders the scene, telemetry and controls", async () => {
    const root = await mount();
    expect(container.querySelector("svg.mission-cosmos")).not.toBeNull();
    expect(container.textContent).toContain("Live telemetry");
    expect(button(/^Launch$/)).toBeDefined();
    await act(async () => root.unmount());
  });

  it("flies a within-capacity payload into orbit with a deployed satellite", async () => {
    const root = await mount();
    await act(async () => button(/^Launch$/)!.click());
    await playToEnd();
    expect(container.querySelector(".orbiting-satellite")).not.toBeNull();
    expect(container.querySelector("svg.mission-cosmos")?.getAttribute("aria-label")).toBe("Satellite revolving around Earth");
    expect(container.querySelector(".mission-lost")).toBeNull();
    await act(async () => root.unmount());
  });

  it("loses the mission with an explosion and no satellite when the payload is too heavy", async () => {
    const root = await mount();
    const mass = container.querySelector<HTMLInputElement>('input[type="number"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(mass, "29000");
      mass.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button(/^Launch$/)!.click());
    await playToEnd();
    expect(container.querySelector(".mission-lost")).not.toBeNull();
    expect(container.querySelector(".failure-burst")).not.toBeNull();
    expect(container.querySelector(".orbiting-satellite")).toBeNull();
    expect(container.querySelector("svg.mission-cosmos")?.getAttribute("aria-label")).toBe("Mission lost during ascent");
    await act(async () => root.unmount());
  });
});
