import { z } from "zod";
import { unauthorized, verifyRequestUser } from "./auth-check.server";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(30000),
  persona: z.enum(["vikram", "kalam", "rakesh", "satish", "kalpana", "sunita"]),
});

const voices = {
  vikram: { name: "Fenrir", direction: "Visionary, composed Indian English. Speak with scientific curiosity and quiet conviction." },
  kalam: { name: "Charon", direction: "Warm, inspirational Indian English. Speak as an encouraging aerospace mentor with measured energy." },
  kalpana: { name: "Kore", direction: "Warm, thoughtful Indian English. Speak with calm precision and a gently encouraging tone." },
  rakesh: { name: "Orus", direction: "Grounded, confident Indian English. Speak clearly with the measured warmth of an experienced mission mentor." },
  satish: { name: "Puck", direction: "Calm, analytical Indian English. Speak like a precise engineering leader who values learning and teamwork." },
  sunita: { name: "Aoede", direction: "Clear, energetic American English. Speak with operational confidence, warmth, and enthusiasm for human spaceflight." },
} as const;

const safeGatewayMessage = async (response: Response) => {
  const fallback = `Natural voice generation failed (${response.status}).`;
  try {
    const body = await response.json() as { message?: unknown; error?: { message?: unknown } };
    const message = typeof body.message === "string" ? body.message : body.error?.message;
    return typeof message === "string" && message.length <= 300 ? message : fallback;
  } catch {
    return fallback;
  }
};

import { toSpokenText } from "./spoken-text";
export { toSpokenText };

/** Gemini returns raw 16-bit PCM; browsers need a WAV header to play it. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, text: string) => [...text].forEach((c, k) => view.setUint8(offset + k, c.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

/** Newest first. A model Google has retired for new accounts answers 404, so we try the next one. */
const TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];

async function geminiSpeech(apiKey: string, persona: keyof typeof voices, text: string) {
  const voice = voices[persona];
  const base = process.env["GEMINI_BASE_URL"] ?? "https://generativelanguage.googleapis.com/v1beta";
  const configured = process.env["GEMINI_TTS_MODEL"]?.trim();
  const models = [...new Set([configured, ...TTS_MODELS].filter((m): m is string => Boolean(m)))];
  const body = JSON.stringify({
    contents: [{ parts: [{ text: `${voice.direction} Do not imitate any real person. Say only this:\n\n${text}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.name } } },
    },
  });
  let upstream!: Response;
  for (const model of models) {
    upstream = await fetch(`${base}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
    });
    if (upstream.status !== 404) break;
  }
  if (!upstream.ok) {
    const failure = (await upstream.json().catch(() => ({}))) as { error?: { message?: string } };
    const detail = failure.error?.message?.slice(0, 400);
    const message =
      upstream.status === 400 || upstream.status === 403
        ? `Gemini rejected the request. Check GEMINI_API_KEY in .env. ${detail ?? ""}`.trim()
        : upstream.status === 429
          ? "Gemini voice limit reached. Wait a minute and try again."
          : (detail ?? `Natural voice generation failed (${upstream.status}).`);
    return Response.json({ message }, { status: upstream.status === 429 ? 429 : 502 });
  }
  const data = (await upstream.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!inline?.data) return Response.json({ message: "Gemini returned no audio. Try again." }, { status: 502 });
  const rate = Number(inline.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
  const wav = pcmToWav(Uint8Array.from(Buffer.from(inline.data, "base64")), rate);
  return new Response(wav.buffer as ArrayBuffer, { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, no-store" } });
}

export async function handlePersonaSpeech(request: Request) {
  const userId = await verifyRequestUser(request);
  if (!userId) return unauthorized();

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await request.json());
  } catch {
    return Response.json({ message: "Enter a shorter response to play aloud." }, { status: 400 });
  }

  // Your own Gemini key (recommended for local use) comes first; Lovable's gateway is used only inside Lovable.
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (geminiKey) return geminiSpeech(geminiKey, parsed.persona, toSpokenText(parsed.text));

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey)
    return Response.json(
      { message: "Natural voice is not configured. Add GEMINI_API_KEY to the .env file and restart the server." },
      { status: 503 },
    );
  parsed.text = toSpokenText(parsed.text);
  const voice = voices[parsed.persona];
  const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-tts-preview",
      contents: [{ role: "user", parts: [{ text: `${voice.direction} Do not imitate any real person. Say only this response:\n\n${parsed.text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.name } } },
      },
      stream_format: "audio",
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const message = await safeGatewayMessage(upstream);
    return Response.json({ message }, { status: upstream.status });
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "audio/wav",
    "Cache-Control": "private, no-store",
  });
  upstream.headers.forEach((value, name) => {
    if (name.toLowerCase().startsWith("x-lovable-aig-")) headers.set(name, value);
  });
  return new Response(upstream.body, { status: upstream.status, headers });
}