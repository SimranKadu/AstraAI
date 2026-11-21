import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-check.server", () => ({ verifyRequestUser: async () => "u", unauthorized: () => new Response("no", { status: 401 }) }));
vi.mock("../lib/auth-check.server", () => ({ verifyRequestUser: async () => "u", unauthorized: () => new Response("no", { status: 401 }) }));

const pdf = (name: string) => readFileSync(path.resolve(process.cwd(), "src/test/fixtures", name)).toString("base64");
let mode: "ok" | "fail" = "ok";
let lastBody = "";
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    lastBody = body;
    if (mode === "fail") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: 404, message: "This model is no longer available to new users.", status: "NOT_FOUND" } }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (text: string, finish?: string) =>
      `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, ...(finish ? { finishReason: finish } : {}), index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } })}\n\n`;
    res.write(chunk("API SUMMARY TEXT"));
    res.write(chunk("", "STOP"));
    res.end();
  });
});

async function generate(payload: object) {
  const { handleGenerate } = await import("@/lib/astra-generate.server");
  return handleGenerate(
    new Request("http://x/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify(payload),
    }),
  );
}
const summary = (file = "sample.pdf", detail: "short" | "detailed" = "short", focus?: string) => ({
  task: "summary", fileName: file, fileBase64: pdf(file), detail, ...(focus ? { focus } : {}),
});

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, r));
});
afterAll(() => void server.close());
beforeEach(() => {
  mode = "ok";
  process.env["GEMINI_API_KEY"] = "test";
  process.env["GEMINI_BASE_URL"] = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1beta`;
});

describe("PDF summary and generated tools", () => {
  it("summarises from the PDF text with the built-in summariser when there is no AI key", async () => {
    delete process.env["GEMINI_API_KEY"];
    const res = await generate(summary());
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("### Short Summary");
    expect(text).toContain("chlorophyll");
    for (const line of ["AI_API_KEY", "GEMINI_API_KEY", "Add an AI key", "more fluent"]) expect(text, line).not.toContain(line);
    expect(text).not.toContain("Demo Satellite ATBD Ver 1.0"); // running header removed
  });

  it("builds a detailed built-in summary with sections", async () => {
    delete process.env["GEMINI_API_KEY"];
    const text = await (await generate(summary("sample.pdf", "detailed", "chlorophyll accuracy"))).text();
    for (const heading of ["### Overview", "### Key Findings", "### Section Insights", "### Conclusion"]) expect(text).toContain(heading);
  });

  it("sends the AI plain document text instead of a PDF file", async () => {
    const res = await generate(summary());
    expect(await res.text()).toContain("API SUMMARY TEXT");
    expect(lastBody).toContain("DOCUMENT TEXT");
    expect(lastBody).toContain("chlorophyll");
    expect(lastBody).not.toContain("application/pdf");
  });

  it("falls back to the built-in summary, with the reason, when the AI fails", async () => {
    mode = "fail";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const text = await (await generate(summary())).text();
    expect(text).toContain("### Short Summary");
    // the reason is written to the terminal, not into the summary
    expect(text).not.toContain("no longer available");
    for (const line of ["AI_API_KEY", "GEMINI_API_KEY", "AI service", "Add an AI key", "more fluent"]) expect(text, line).not.toContain(line);
    expect(warn.mock.calls.flat().join(" ")).toContain("no longer available");
    warn.mockRestore();
  }, 20000);

  it("writes a mission brief from the archive with no AI key (Mission Explorer)", async () => {
    delete process.env["GEMINI_API_KEY"];
    const res = await generate({ task: "mission", name: "Mars Orbiter Mission (Mangalyaan)" });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Astra-Source")).toBe("archive");
    const text = await res.text();
    expect(text).toContain("### Mission overview");
    expect(text).toContain("PSLV-C25");
  });

  it("explains a scanned PDF instead of returning an empty answer", async () => {
    const res = await generate(summary("scanned.pdf"));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("no readable text");
  });

  it("reports the real reason when other AI tools fail", async () => {
    mode = "fail";
    const res = await generate({ task: "diagram", kind: "flowchart", prompt: "Launch sequence of a PSLV" });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { message: string }).message).toContain("no longer available");
  }, 20000);
});
