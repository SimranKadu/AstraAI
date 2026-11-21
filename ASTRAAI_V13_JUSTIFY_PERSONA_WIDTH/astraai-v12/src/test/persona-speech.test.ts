import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pcmToWav, toSpokenText } from "@/lib/persona-speech.server";

vi.mock("@/lib/auth-check.server", () => ({ verifyRequestUser: async () => "u", unauthorized: () => new Response("no", { status: 401 }) }));
vi.mock("../lib/auth-check.server", () => ({ verifyRequestUser: async () => "u", unauthorized: () => new Response("no", { status: 401 }) }));

let seenKey = "";
const paths: string[] = [];
let seenBody: { generationConfig?: { speechConfig?: { voiceConfig?: { prebuiltVoiceConfig?: { voiceName?: string } } } } } = {};
const server = http.createServer((req, res) => {
  seenKey = String(req.headers["x-goog-api-key"]);
  paths.push(req.url ?? "");
  if ((req.url ?? "").includes("gemini-3.1-flash-tts-preview") && process.env["TEST_RETIRE_NEWEST"]) {
    req.resume();
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "retired" } }));
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seenBody = JSON.parse(body);
    const pcm = Buffer.alloc(4800, 1).toString("base64");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm } }] } }] }));
  });
});
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  process.env["GEMINI_API_KEY"] = "test-key";
  process.env["GEMINI_BASE_URL"] = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1beta`;
});
afterAll(() => void server.close());

describe("persona voice", () => {
  it("makes markdown speakable and short", () => {
    const spoken = toSpokenText("### Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n**Bold** text. " + "More words here. ".repeat(300) + "\n\n*Sources: X*");
    expect(spoken).not.toMatch(/[|#*]/);
    expect(spoken).not.toContain("Sources");
    expect(spoken.length).toBeLessThanOrEqual(1800);
    expect(spoken.endsWith(".")).toBe(true);
  });

  it("wraps PCM in a WAV header", () => {
    const wav = pcmToWav(new Uint8Array(100), 24000);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(wav.length).toBe(144);
  });

  it("calls Gemini with the persona voice and returns playable audio", async () => {
    const { handlePersonaSpeech } = await import("@/lib/persona-speech.server");
    const res = await handlePersonaSpeech(
      new Request("http://x/api/persona-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
        body: JSON.stringify({ text: "Hello ".repeat(2000), persona: "kalam" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/wav");
    expect(seenKey).toBe("test-key");
    expect(seenBody.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe("Charon");
    expect((await res.arrayBuffer()).byteLength).toBe(4844);
    expect(paths.at(-1)).toContain("gemini-3.1-flash-tts-preview");
  });

  it("tries the next model when one is retired (404)", async () => {
    const { handlePersonaSpeech } = await import("@/lib/persona-speech.server");
    paths.length = 0;
    process.env["TEST_RETIRE_NEWEST"] = "1";
    const res = await handlePersonaSpeech(
      new Request("http://x/api/persona-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
        body: JSON.stringify({ text: "Hello there", persona: "sunita" }),
      }),
    );
    delete process.env["TEST_RETIRE_NEWEST"];
    expect(res.status).toBe(200);
    expect(paths).toHaveLength(2);
    expect(paths[1]).toContain("gemini-2.5-flash-preview-tts");
  });
});
