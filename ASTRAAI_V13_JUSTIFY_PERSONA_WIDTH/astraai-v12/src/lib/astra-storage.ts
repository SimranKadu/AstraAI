import type { UIMessage } from "ai";

export type AstraThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: UIMessage[];
};

const STORAGE_KEY = "astraai-conversations-v1";

/**
 * New conversation id. crypto.randomUUID only exists on secure pages (https or localhost), so when the app is opened
 * by a network address such as http://192.168.x.x it is missing. This falls back to an equivalent random id.
 */
export const makeId = (): string => {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
};

export function readThreads(): AstraThread[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeThreads(threads: AstraThread[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

export function createThread(): AstraThread {
  return { id: makeId(), title: "New mission query", updatedAt: Date.now(), messages: [] };
}

export function ensureThreads(): AstraThread[] {
  const current = readThreads();
  if (current.length > 0) return current;
  const initial = [createThread()];
  writeThreads(initial);
  return initial;
}

export function saveThreadMessages(threadId: string, messages: UIMessage[]) {
  const firstUserText = messages
    .find((message) => message.role === "user")
    ?.parts.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
  const next = ensureThreads().map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          title: firstUserText ? firstUserText.slice(0, 42) : thread.title,
          updatedAt: Date.now(),
          messages,
        }
      : thread,
  );
  writeThreads(next);
}
