import { streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { liveContextFor, retrieve } from "./astra-chat.server";
import { missionBrief } from "./local-knowledge.server";
import { extractPdfText, type PdfText } from "./pdf-text.server";
import { localSummary } from "./local-summary.server";
import { unauthorized, verifyRequestUser } from "./auth-check.server";
import { resolveAi } from "./ai-provider.server";

const schema = z.discriminatedUnion("task", [
  z.object({
    task: z.literal("summary"),
    fileName: z.string().max(200),
    fileBase64: z.string().max(14_000_000),
    focus: z.string().max(500).optional(),
    detail: z.enum(["short", "detailed"]).default("short"),
  }),
  z.object({ task: z.literal("diagram"), kind: z.string().max(60), prompt: z.string().min(3).max(3000) }),
  z.object({ task: z.literal("satellite"), params: z.record(z.string().max(200)) }),
  z.object({ task: z.literal("simulation"), params: z.record(z.string().max(200)) }),
  z.object({ task: z.literal("mission"), name: z.string().max(120) }),
]);

const NO_DASH = "Do not use em dashes. Do not include citation tags or source labels.";

function grounding(query: string, live: string) {
  const passages = retrieve(query)
    .map((c) => `<<< ${c.source} >>>\n${c.text}`)
    .join("\n\n");
  return `REFERENCE MATERIAL\n${passages || "None retrieved."}${live ? `\n\nLIVE DATA\n${live}` : ""}`;
}

const MAX_DOCUMENT_CHARS = 90_000;
const textHeaders = { "Content-Type": "text/plain; charset=utf-8" };
const reasonOf = (error: unknown) =>
  (error instanceof Error ? error.message : String(error ?? "")).replace(/\s+/g, " ").slice(0, 300);

/**
 * Streams the AI answer, but looks at the first chunk before committing. If the AI service
 * fails or returns nothing, `onFail` supplies the response instead, so the page never shows
 * a blank "empty answer".
 */
async function streamOrFallback(
  result: { textStream: AsyncIterable<string> },
  failure: () => string,
  onFail: (reason: string) => Response,
): Promise<Response> {
  const iterator = result.textStream[Symbol.asyncIterator]();
  let first: IteratorResult<string>;
  try {
    do first = await iterator.next();
    while (!first.done && !first.value);
  } catch (error) {
    return onFail(reasonOf(error));
  }
  if (first.done) return onFail(failure() || "The AI service returned no text.");
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(first.value));
    },
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch {
        controller.close();
      }
    },
    cancel() {
      void iterator.return?.();
    },
  });
  return new Response(body, { headers: textHeaders });
}

export async function handleGenerate(request: Request) {
  if (!(await verifyRequestUser(request))) return unauthorized();

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await request.json());
  } catch {
    return Response.json({ message: "That request is invalid." }, { status: 400 });
  }

  // Mission briefs come from the trained archive first; the API is only the backup.
  if (input.task === "mission") {
    const brief = missionBrief(input.name, await liveContextFor(input.name));
    if (brief) return new Response(brief, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Astra-Source": "archive" } });
  }

  // PDF summaries read the text on the server, so any AI model works and the built-in summary can step in.
  let document: PdfText | undefined;
  if (input.task === "summary") {
    try {
      document = await extractPdfText(input.fileBase64);
    } catch {
      return Response.json({ message: "That file could not be read as a PDF. Try another one." }, { status: 422 });
    }
    if (document.text.length < 200)
      return Response.json(
        { message: "This PDF has no readable text (it is probably a scan of images). Try a PDF with selectable text." },
        { status: 422 },
      );
  }
  const builtIn = (reason: string) => {
    // The reason goes to the terminal, not into the summary the user reads.
    if (reason) console.warn(`[astra] AI summary failed (${reason.slice(0, 200)}); used the built-in summary. Check GEMINI_API_KEY and GEMINI_MODEL in .env.`);
    return new Response(
      localSummary(input.task === "summary" ? input.fileName : "", document!, {
        detail: input.task === "summary" ? input.detail : "short",
        ...(input.task === "summary" && input.focus ? { focus: input.focus } : {}),
      }),
      { headers: { ...textHeaders, "X-Astra-Source": "archive" } },
    );
  };

  const ai = resolveAi(request, "low");
  if (!ai) {
    if (input.task === "summary") return builtIn("");
    return Response.json(
      { message: "This tool needs a Gemini API key. Set GEMINI_API_KEY in the .env file and restart the server." },
      { status: 503 },
    );
  }

  let system = "";
  let messages: ModelMessage[] = [];

  if (input.task === "summary") {
    system = input.detail === "detailed"
      ? `You are ASTRAAI Document Intelligence. Produce a detailed but well-organised aerospace document analysis in Markdown. Use the sections Overview, Key Findings, Technical Parameters, Section Insights, and Conclusion. Preserve important facts, dates, numbers, and technical terms. Use only the document's content. ${NO_DASH}`
      : `You are ASTRAAI Document Intelligence. Produce a SHORT, easy-to-scan summary in Markdown using exactly these sections: Short Summary, Key Points, and Conclusion. Use 5 to 10 concise bullets total or a few short paragraphs. Include only the most important findings, dates, numbers, concepts, and conclusions. Do not reproduce the document or provide a chapter-by-chapter explanation, even when it is long. Keep the conclusion to one or two sentences. Use only the document's content. ${NO_DASH}`;
    messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Summarise "${input.fileName}" (${document!.pages.length} pages).${input.focus ? ` Focus on: ${input.focus}` : ""}\n\nDOCUMENT TEXT\n${document!.text.slice(0, MAX_DOCUMENT_CHARS)}${document!.text.length > MAX_DOCUMENT_CHARS ? "\n\n[The document continues; the rest was cut for length.]" : ""}`,
          },
        ],
      },
    ];
  } else if (input.task === "diagram") {
    system = `You generate Mermaid diagrams for space mission engineering. Output only valid Mermaid source code with no code fences and no commentary; the first line must be the diagram keyword (flowchart TD, sequenceDiagram, mindmap, timeline). Use short node labels in double quotes (under 8 words), and avoid parentheses, colons, semicolons, quotes and special characters inside labels. Give every node a unique simple id such as A, B, C. Keep the diagram to 12 nodes or fewer. Prefer flowchart TD for architectures and dependencies, sequenceDiagram for sequences, and timeline or gantt for orbital timelines. Ground facts in the reference material when relevant.\n\n${grounding(input.prompt, "")}`;
    messages = [{ role: "user", content: `Diagram type: ${input.kind}. ${input.prompt}` }];
  } else if (input.task === "satellite") {
    const q = Object.values(input.params).join(" ");
    system = `You are ASTRAAI Satellite Recommender. Given mission parameters, recommend a satellite architecture in markdown: Recommended Configuration (orbit, altitude, inclination, constellation size, payload class, mass class), Suitable Launch Vehicle, Comparable Existing Missions (only from the reference material), Trade-offs, and Risks. Base numbers on standard orbital mechanics and state they are estimates. ${NO_DASH}\n\n${grounding(q, "")}`;
    messages = [{ role: "user", content: JSON.stringify(input.params) }];
  } else if (input.task === "simulation") {
    system = `You are ASTRAAI Mission Analyst. You receive a launch configuration and computed physics estimates. Write a concise markdown briefing: Assessment, Key Risks (bullets with Low, Moderate or High), Recommendations, and Reference Missions (only from the reference material). Do not change the computed numbers. ${NO_DASH}\n\n${grounding(Object.values(input.params).join(" "), "")}`;
    messages = [{ role: "user", content: JSON.stringify(input.params) }];
  } else {
    const live = await liveContextFor(input.name);
    system = `You are ASTRAAI Mission Explorer. Write a short markdown mission brief for the named mission: Overview, Objectives, Key Milestones, Payloads, and Significance. Use only the reference material and live data. If something is not covered, omit it. ${NO_DASH}\n\n${grounding(input.name, live)}`;
    messages = [{ role: "user", content: `Mission: ${input.name}` }];
  }

  let failure = "";
  const result = streamText({
    model: ai.model,
    abortSignal: request.signal,
    maxRetries: 1,
    system,
    messages,
    onError: ({ error }) => {
      failure = reasonOf(error);
    },
    ...(ai.providerOptions ? { providerOptions: ai.providerOptions } : {}),
  });
  const streamed = await streamOrFallback(result, () => failure, (reason) =>
    input.task === "summary"
      ? builtIn(reason)
      : Response.json(
          { message: `The AI service could not answer (${reason.slice(0, 200)}). Check GEMINI_API_KEY and GEMINI_MODEL in .env.` },
          { status: 502 },
        ),
  );
  return streamed;
}
