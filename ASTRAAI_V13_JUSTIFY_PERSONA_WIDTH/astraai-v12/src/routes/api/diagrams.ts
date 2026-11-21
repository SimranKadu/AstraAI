import { createFileRoute } from "@tanstack/react-router";
import { getMissionCatalog, getMissionDiagram, type DiagramType } from "@/lib/mission-diagrams.server";

const TYPES: DiagramType[] = ["flowchart", "sequence", "mindmap", "mission-architecture", "orbital-timeline", "system-dependency", "telemetry-flow", "satellite-recommendation", "coverage-constellation"];

export const Route = createFileRoute("/api/diagrams")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const missionId = url.searchParams.get("mission");
        const requestedType = url.searchParams.get("type") ?? "flowchart";
        const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
        if (!missionId) {
          return new Response(JSON.stringify({ missions: getMissionCatalog(), types: TYPES }), { status: 200, headers });
        }
        if (!TYPES.includes(requestedType as DiagramType)) {
          return new Response(JSON.stringify({ error: "Unsupported diagram type." }), { status: 400, headers });
        }
        const result = getMissionDiagram(missionId, requestedType as DiagramType);
        if (!result) return new Response(JSON.stringify({ error: "Mission not found." }), { status: 404, headers });
        return new Response(JSON.stringify(result), { status: 200, headers });
      },
    },
  },
});
