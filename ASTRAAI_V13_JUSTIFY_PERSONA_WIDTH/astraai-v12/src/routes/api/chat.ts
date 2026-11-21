import { createFileRoute } from "@tanstack/react-router";
import { handleAstraChat } from "@/lib/astra-chat.server";

export const Route = createFileRoute("/api/chat")({
  server: { handlers: { POST: ({ request }) => handleAstraChat(request) } },
});
