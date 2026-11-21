import { useCallback, useRef, useState } from "react";
import { authHeaders } from "@/lib/auth-client";

// Streams plain text from /api/generate.
export function useStreamText() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(async (body: Record<string, unknown>) => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setText("");
    setError("");
    setLoading(true);
    let full = "";
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.message ?? "ASTRAAI could not complete that request.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setText(full);
      }
      if (!full.trim()) throw new Error("ASTRAAI could not produce an answer this time. Please try again in a moment.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    return full;
  }, []);

  const stop = useCallback(() => controller.current?.abort(), []);
  return { text, loading, error, run, stop, setText };
}
