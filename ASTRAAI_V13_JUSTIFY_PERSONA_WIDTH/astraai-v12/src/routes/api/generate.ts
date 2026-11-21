import { createFileRoute } from "@tanstack/react-router";
import { handleGenerate } from "@/lib/astra-generate.server";

export const Route = createFileRoute("/api/generate")({
  server: { handlers: { POST: ({ request }) => handleGenerate(request) } },
});
