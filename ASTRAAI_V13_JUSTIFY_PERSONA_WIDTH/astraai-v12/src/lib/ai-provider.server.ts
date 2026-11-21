import { createGoogleGenerativeAI } from "@ai-sdk/google";

type ProviderOptions = Record<string, Record<string, string | number | boolean | string[] | Record<string, number | boolean>>>;

export type ResolvedAi = {
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;
  providerOptions?: ProviderOptions;
};

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/**
 * Picks the AI backend from environment variables. ASTRAAI uses Google Gemini only.
 *
 *   GEMINI_API_KEY   your key from https://aistudio.google.com (Get API key)
 *   GEMINI_MODEL     optional, defaults to gemini-3.8-flash
 *   GEMINI_BASE_URL  optional, defaults to https://generativelanguage.googleapis.com/v1beta
 *
 * GOOGLE_GENERATIVE_AI_API_KEY is also accepted (the Google AI SDK's default name).
 * Returns null when no key is set, and callers then fall back to offline retrieval.
 */
export function resolveAi(_request?: Request, _effort?: "low" | "medium"): ResolvedAi | null {
  const apiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
  if (!apiKey) return null;
  const baseURL = process.env["GEMINI_BASE_URL"];
  const provider = createGoogleGenerativeAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  return { model: provider(process.env["GEMINI_MODEL"]?.trim() || DEFAULT_GEMINI_MODEL) };
}
