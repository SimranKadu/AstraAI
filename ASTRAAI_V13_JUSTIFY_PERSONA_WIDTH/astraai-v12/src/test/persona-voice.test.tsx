import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/lib/auth-client", () => ({ authHeaders: async () => ({ Authorization: "Bearer t" }) }));
vi.mock("@/components/ai-elements/message", () => ({ MessageResponse: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [{ id: "1", role: "assistant", parts: [{ type: "text", text: "## Answer\n\nSLV-3 taught **many** lessons. It flew four times." }] }],
    sendMessage: vi.fn(),
    status: "ready",
    error: undefined,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const spoken: string[] = [];
let container: HTMLDivElement;

beforeEach(() => {
  spoken.length = 0;
  container = document.createElement("div");
  document.body.append(container);
  class Utterance { text: string; lang = ""; rate = 1; voice: unknown = null; onstart?: () => void; onend?: () => void; onerror?: () => void; constructor(text: string) { this.text = text; } }
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speak: (u: Utterance) => { spoken.push(u.text); u.onstart?.(); },
      cancel: () => undefined, pause: () => undefined, resume: () => undefined,
      getVoices: () => [{ lang: "en-IN", name: "India" }],
    },
  });
});
afterEach(() => {
  container.remove();
  vi.unstubAllGlobals();
});

describe("Persona voice without an AI voice key", () => {
  it("speaks with the device voice and shows no red error", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "Natural voice is not configured." }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { Route } = await import("@/routes/_authenticated/personas");
    const Page = Route.options.component as () => React.ReactNode;
    const root = createRoot(container);
    await act(async () => root.render(<Page />));
    const meet = [...container.querySelectorAll("button")].find((b) => /Meet this expert/.test(b.textContent ?? ""))!;
    await act(async () => meet.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).not.toMatch(/[#*]/); // markdown is not read aloud
    expect(spoken[0]).toContain("SLV-3 taught many lessons");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    // no message about the voice, and no request to add a key
    for (const line of ["device's voice", "GEMINI_API_KEY", "Natural voice is not configured", ".env"]) expect(container.textContent, line).not.toContain(line);
    await act(async () => root.unmount());
  });

  it("plays the AI voice once even when Play and Replay are clicked repeatedly", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.fn(async () => { await gate; return new Response(new Blob(["wav"]), { status: 200 }); });
    vi.stubGlobal("fetch", fetchMock);
    const players: { src: string }[] = [];
    class FakeAudio {
      src: string; ended = false; onplay?: () => void; onpause?: () => void; onended?: () => void; onerror?: () => void;
      constructor(src: string) { this.src = src; players.push(this); }
      play() { this.onplay?.(); return Promise.resolve(); }
      pause() { this.onpause?.(); }
    }
    vi.stubGlobal("Audio", FakeAudio);
    URL.createObjectURL = () => "blob:voice";
    URL.revokeObjectURL = () => undefined;
    const { Route } = await import("@/routes/_authenticated/personas");
    const Page = Route.options.component as () => React.ReactNode;
    const root = createRoot(container);
    await act(async () => root.render(<Page />));
    const find = (label: RegExp) => [...container.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""))!;
    await act(async () => find(/Meet this expert/).click());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); // the answer starts loading its voice
    const buttons = [...container.querySelectorAll("button")].filter((b) => /Starting|Replay|Play/.test(b.textContent ?? ""));
    await act(async () => { buttons.forEach((b) => { b.click(); b.click(); b.click(); }); });
    release();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(players).toHaveLength(1);
    await act(async () => root.unmount());
  });

  it("shows initials instead of broken-image text when no portrait loads", async () => {
    const { PersonaAvatar } = await import("@/components/persona-avatar");
    const { PERSONAS } = await import("@/data/personas");
    const root = createRoot(container);
    await act(async () => root.render(<PersonaAvatar persona={PERSONAS.find((p) => p.id === "kalam")!} state="idle" />));
    for (let i = 0; i < 2; i++) {
      const img = container.querySelector("img");
      if (!img) break;
      await act(async () => img.dispatchEvent(new Event("error")));
    }
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("AK");
    await act(async () => root.unmount());
  });
});
