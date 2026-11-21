import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { SPACE_MISSIONS } from "@/data/space-dataset";
import { verifyRequestUser, unauthorized } from "./auth-check.server";
import { PERSONAS } from "@/data/personas";
import {
  fetchSatelliteOrbit,
  fetchUpcomingLaunches,
  launchesToText,
  orbitToText,
} from "./space-live.server";
import { resolveAi } from "./ai-provider.server";
import { answerLocally, buildQuery, retrieve, search } from "./local-knowledge.server";

export { retrieve };

const bodySchema = z.object({
  id: z.string().min(1).max(128),
  persona: z.string().max(40).optional(),
  messages: z.array(z.custom<UIMessage>()).max(100),
});

/** Live data (launch schedules, orbits) is a bonus: never let a slow or offline network delay the answer. */
export async function liveContextFor(query: string, waitMs = 3500) {
  return Promise.race([fetchLiveContext(query), new Promise<string>((resolve) => setTimeout(() => resolve(""), waitMs))]);
}

async function fetchLiveContext(query: string) {
  const lower = query.toLowerCase();
  const parts: string[] = [];
  const jobs: Promise<void>[] = [];
  if (/\b(launch|launches|upcoming|next|scheduled|liftoff|rocket)\b/.test(lower)) {
    jobs.push(
      fetchUpcomingLaunches(8)
        .then((l) => void parts.push(`UPCOMING LAUNCHES (live, worldwide)\n${launchesToText(l)}`))
        .catch(() => undefined),
    );
  }
  const sats = SPACE_MISSIONS.filter(
    (m) => m.celestrakName && lower.includes(m.celestrakName.toLowerCase()),
  )
    .sort((a, b) => (b.celestrakName?.length ?? 0) - (a.celestrakName?.length ?? 0))
    .slice(0, 2);
  for (const s of sats) {
    jobs.push(
      fetchSatelliteOrbit(s.celestrakName!)
        .then((o) => void (o && parts.push(`LIVE ORBIT\n${orbitToText(o)}`)))
        .catch(() => undefined),
    );
  }
  await Promise.all(jobs);
  return parts.join("\n\n");
}

const CITATION_TAG = /\[Source:[^\]\n]*\]/gi;

function createCitationCleaner() {
  const pending = new Map<string, string>();
  return (id: string, delta: string): string => {
    let text = (pending.get(id) ?? "") + delta;
    const lastOpen = text.lastIndexOf("[");
    if (lastOpen !== -1 && text.indexOf("]", lastOpen) === -1) {
      pending.set(id, text.slice(lastOpen));
      text = text.slice(0, lastOpen);
    } else {
      pending.delete(id);
    }
    return text
      .replace(CITATION_TAG, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n");
  };
}

function cleanStreamLine(line: string, clean: (id: string, delta: string) => string): string {
  const match = line.match(/^(\s*data:\s*)(.*)$/s);
  const prefix = match?.[1] ?? "";
  const payload = match?.[2] ?? line;
  if (!payload.trim()) return line;
  let event: { type?: string; id?: string; delta?: string };
  try {
    event = JSON.parse(payload) as { type?: string; id?: string; delta?: string };
  } catch {
    return line;
  }
  if (!event || typeof event !== "object") return line;
  if (event.type === "text-delta" && typeof event.delta === "string") {
    event.delta = clean(event.id ?? "text", event.delta);
    return prefix + JSON.stringify(event);
  }
  return line;
}

function stripCitationTags(response: Response): Response {
  if (!response.body) return response;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const clean = createCitationCleaner();
  const transformed = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines)
          controller.enqueue(encoder.encode(cleanStreamLine(line, clean) + "\n"));
      },
      flush(controller) {
        if (buffer) controller.enqueue(encoder.encode(cleanStreamLine(buffer, clean) + "\n"));
      },
    }),
  );
  return new Response(transformed, { status: response.status, headers: response.headers });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Streams a finished Markdown answer to the chat UI with a light typing effect. */
function textStream(text: string, messages: UIMessage[], source: string) {
  const stream = createUIMessageStream<UIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      writer.write({ type: "text-start", id: "astra" });
      for (let i = 0; i < text.length; i += 32) {
        writer.write({ type: "text-delta", id: "astra", delta: text.slice(i, i + 32) });
        await sleep(8);
      }
      writer.write({ type: "text-end", id: "astra" });
    },
  });
  return createUIMessageStreamResponse({ stream, headers: { "X-Astra-Source": source } });
}

const log = (message: string) => console.log(`[astra] ${message}`);

/**
 * Answer order:
 *   1. The trained archive (local, no API call), when it is confident.
 *   2. The AI API, grounded with the best archive passages, when it is not.
 *   3. The closest archive passages, if the API is missing or fails.
 */
export async function handleAstraChat(request: Request) {
  if (!(await verifyRequestUser(request))) return unauthorized();

  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ message: "The conversation request is invalid." }, { status: 400 });
  }

  const userTexts = payload.messages
    .filter((m) => m.role === "user")
    .map((m) => m.parts.filter((p) => p.type === "text").map((p) => p.text).join(" "));
  const latest = userTexts.at(-1) ?? "";
  const query = buildQuery(latest, userTexts.slice(0, -1));
  const persona = payload.persona ? PERSONAS.find((p) => p.id === payload.persona) : undefined;

  const live = await liveContextFor(query);
  const local = answerLocally(query, { live, ...(persona ? { personaName: persona.name } : {}) });

  // 1. Gemini API (when GEMINI_API_KEY is set), grounded with the best archive passages.
  const ai = resolveAi(request, "medium");
  if (!ai) {
    // 2. No key: answer offline from the trained archive.
    if (local.confident && !persona) {
      log(`local answer (confidence ${local.confidence.toFixed(2)}): ${latest.slice(0, 80)}`);
      return textStream(local.text, payload.messages, "archive");
    }
    log(`no API key, closest archive passages (confidence ${local.confidence.toFixed(2)}): ${latest.slice(0, 80)}`);
    return textStream(local.text, payload.messages, "archive-low-confidence");
  }
  log(`using Gemini API (archive confidence ${local.confidence.toFixed(2)}): ${latest.slice(0, 80)}`);

  // Retrieve the user's mission question and the selected persona's public-career notes.
  // The new Persona Field Guide is indexed by `npm run train` alongside all existing mission/MOSDAC files.
  const missionContext = search(query, 12).chunks;
  const personaContext = persona
    ? search(`${persona.name} ${persona.role} ${persona.focus} career missions challenges experience`, 10).chunks
    : [];
  const context = [...missionContext, ...personaContext].filter(
    (item, index, all) => all.findIndex((other) => other.source === item.source && other.page === item.page && other.section === item.section && other.text === item.text) === index,
  ).slice(0, 18);
  const sources = context.length
    ? context
        .map((item) => `<<< ${item.source}${item.page ? ` (page ${item.page})` : ""}${item.heading ? ` | ${item.heading}` : ""} >>>\n${item.text}`)
        .join("\n\n")
    : "No matching source passage was retrieved.";
  const personaIntro = persona
    ? `You are an educational persona inspired by the public career of ${persona.name}, whose professional role was ${persona.role}. Teaching focus: ${persona.focus}. Use a suitable mentor-like explanation. Never include any disclaimer, note or sentence saying that this is a simulation, an educational persona, or not the real person; the app already shows that elsewhere, so go straight to the answer. Do not claim personal memories, first-person eyewitness experience, private opinions, invented quotations, or undocumented emotions. Use the Persona Field Guide and mission archive passages as grounding; explain documented challenges accurately and respectfully. If the archive does not support a biographical detail, say that it is not established in the available sources. Do not claim that this person personally worked on or flew a mission unless the sources confirm it. Answer directly, with moderate detail and clear definitions.\n\n`
    : "";
  const modelMessages = await convertToModelMessages(payload.messages);
  const result = streamText({
    model: ai.model,
    abortSignal: request.signal,
    maxRetries: 1, // fail over to the archive quickly instead of waiting on long retries
    system: `${personaIntro}You are ASTRAAI, a professional space-research assistant. You answer questions about space, ISRO, Indian space missions, satellites, launch vehicles, Earth observation and MOSDAC data. Use the reference passages (from the ASTRAAI trained archive) first when they are relevant. If they do not cover the question, answer from your general knowledge of these topics. Never invent specific facts, dates or numbers; if you are unsure, say so. If the question is not related to space, ISRO, satellites, Earth observation or related science, politely say it is outside ASTRAAI's scope and invite a space or ISRO question instead. For dates of upcoming launches and current orbits, prefer live data and note that times are UTC. Never include citation tags, source labels, or lines such as [Source: ...]. Use clean Markdown and moderate detail. Start with a direct explanation, then use short headings and bullets where they improve scanning. Bold important facts, dates, numbers, mission names, and technical terms. Avoid repetition and unnecessary length. Do not use em dashes.\n\nREFERENCE PASSAGES\n${sources}${live ? `\n\nLIVE DATA (fetched ${new Date().toISOString()})\n${live}` : ""}`,
    messages: modelMessages,
    ...(ai.providerOptions ? { providerOptions: ai.providerOptions } : {}),
  });

  // Stream the API answer, but if it fails before producing any text, fall back to the archive.
  const stream = createUIMessageStream<UIMessage>({
    originalMessages: payload.messages,
    execute: async ({ writer }) => {
      const reader = result
        .toUIMessageStream({ originalMessages: payload.messages, sendReasoning: false })
        .getReader();
      const held: Parameters<typeof writer.write>[0][] = [];
      let started = false;
      let failureReason = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (started) {
            writer.write(value);
            continue;
          }
          if (value.type === "error") {
            failureReason = String((value as { errorText?: string }).errorText ?? "").slice(0, 200);
            break;
          }
          held.push(value);
          if (value.type === "text-delta" || value.type === "reasoning-delta") {
            started = true;
            held.splice(0).forEach((chunk) => writer.write(chunk));
          }
        }
      } catch (error) {
        failureReason = error instanceof Error ? error.message.slice(0, 200) : "";
      }
      if (!started) {
        // The reason goes to the terminal, not into the answer.
        log(`API backup failed${failureReason ? ` (${failureReason})` : ""}, answering from the closest archive passages`);
        writer.write({ type: "text-start", id: "astra-fallback" });
        const text = local.text;
        for (let i = 0; i < text.length; i += 32)
          writer.write({ type: "text-delta", id: "astra-fallback", delta: text.slice(i, i + 32) });
        writer.write({ type: "text-end", id: "astra-fallback" });
      }
    },
  });
  const streamed = stripCitationTags(
    createUIMessageStreamResponse({ stream, headers: { "X-Astra-Source": "api" } }),
  );
  return streamed;
}
