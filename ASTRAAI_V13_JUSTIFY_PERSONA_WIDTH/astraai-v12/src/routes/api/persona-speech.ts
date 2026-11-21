import { createFileRoute } from "@tanstack/react-router";
import { handlePersonaSpeech } from "@/lib/persona-speech.server";

export const Route = createFileRoute("/api/persona-speech")({
  server: { handlers: { POST: ({ request }) => handlePersonaSpeech(request) } },
});