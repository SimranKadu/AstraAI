import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-check.server", () => ({
  verifyRequestUser: async () => "test-user",
  unauthorized: () => new Response("no", { status: 401 }),
}));
vi.mock("../lib/auth-check.server", () => ({
  verifyRequestUser: async () => "test-user",
  unauthorized: () => new Response("no", { status: 401 }),
}));

let apiCalls = 0;
let mode: "ok" | "fail" = "ok";
const server = http.createServer((req, res) => {
  apiCalls += 1;
  if (mode === "fail") {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: 500, message: "boom", status: "INTERNAL" } }));
    return;
  }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (text: string, finish?: string) =>
      `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, ...(finish ? { finishReason: finish } : {}), index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } })}\n\n`;
    res.write(chunk("API BACKUP ANSWER"));
    res.write(chunk("", "STOP"));
    res.end();
});

async function ask(text: string, persona?: string) {
  const { handleAstraChat } = await import("@/lib/astra-chat.server");
  const response = await handleAstraChat(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify({
        id: "t1",
        ...(persona ? { persona } : {}),
        messages: [{ id: "m1", role: "user", parts: [{ type: "text", text }] }],
      }),
    }),
  );
  const raw = await response.text();
  // Rebuild the streamed text from its delta events.
  const body = raw
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice(6)) as { type: string; delta?: string })
    .map((event) => (event.type === "text-delta" ? (event.delta ?? "") : event.type === "error" ? "[[ERROR]]" : ""))
    .join("");
  return { body, source: response.headers.get("X-Astra-Source") };
}

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  process.env["GEMINI_API_KEY"] = "test";
  process.env["GEMINI_BASE_URL"] = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1beta`;
});
afterAll(() => void server.close());

describe("archive first, API backup", () => {
  it("answers space and ISRO questions through the Gemini API", async () => {
    mode = "ok";
    apiCalls = 0;
    const r = await ask("What is XPoSat?");
    expect(r.source).toBe("api");
    expect(apiCalls).toBe(1);
    expect(r.body).toContain("API BACKUP ANSWER");
  });

  it("answers from the archive without calling the API when no key is set", async () => {
    const key = process.env["GEMINI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    apiCalls = 0;
    try {
      const r = await ask("What is XPoSat?");
      expect(r.source).toBe("archive");
      expect(r.body.length).toBeGreaterThan(60);
      expect(apiCalls).toBe(0);
    } finally {
      process.env["GEMINI_API_KEY"] = key;
    }
  });

  it("uses the API for questions the archive cannot answer", async () => {
    mode = "ok";
    apiCalls = 0;
    const r = await ask("Who is the president of France?");
    expect(r.source).toBe("api");
    expect(apiCalls).toBe(1);
    expect(r.body).toContain("API BACKUP ANSWER");
  });

  it("falls back to the archive when the API fails", async () => {
    mode = "fail";
    const r = await ask("Explain quantum chromodynamics gluon confinement");
    expect(r.body.length).toBeGreaterThan(40); // the closest archive passages are shown
    expect(r.body).not.toContain("[[ERROR]]");
    for (const line of ["AI_API_KEY", "GEMINI_API_KEY", "no AI backup", "AI backup", "connect the API", "Add an AI key", "AI mentor", "inspired by"]) expect(r.body, line).not.toContain(line);
  }, 20000);

  it("adds no 'connect the API' line when there is no AI key", async () => {
    const key = process.env["GEMINI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    try {
      const r = await ask("Explain quantum chromodynamics gluon confinement");
      expect(r.source).toBe("archive-low-confidence");
      for (const line of ["AI_API_KEY", "GEMINI_API_KEY", "no AI backup", "AI backup", "connect the API", "Add an AI key", "AI mentor", "inspired by"]) expect(r.body, line).not.toContain(line);
    } finally {
      process.env["GEMINI_API_KEY"] = key;
    }
  }, 20000);

  it("does not announce 'AI mentor' in a persona's archive answer", async () => {
    const key = process.env["GEMINI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    let r: Awaited<ReturnType<typeof ask>>;
    try {
      r = await ask("What engineering lessons came from the early SLV-3 programme?", "kalam");
    } finally {
      process.env["GEMINI_API_KEY"] = key;
    }
    expect(r.source).toBe("archive-low-confidence");
    expect(r.body).toContain("SLV-3");
    for (const line of ["AI_API_KEY", "GEMINI_API_KEY", "no AI backup", "AI backup", "connect the API", "Add an AI key", "AI mentor", "inspired by"]) expect(r.body, line).not.toContain(line);
  });
});
