import { createFileRoute } from "@tanstack/react-router";
import { Download, FileImage, FileText, Network } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell, Panel } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { authHeaders } from "@/lib/auth-client";
import { cleanMermaid } from "@/lib/mermaid-clean";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/diagrams")({
  head: () => pageHead("Mission Diagram Generator", "Generate ISRO mission diagrams from curated mission knowledge and AI."),
  component: Diagrams,
});

type MissionOption = { id: string; name: string; year: string; summary: string };
type DiagramType = "flowchart" | "sequence" | "mindmap" | "mission-architecture" | "orbital-timeline" | "system-dependency" | "telemetry-flow" | "satellite-recommendation" | "coverage-constellation";
type ApiResult = { missions?: MissionOption[]; types?: DiagramType[]; mission?: { name: string; year: string; summary: string; objective: string; launch: string; vehicle: string }; mermaidText?: string; error?: string };
const TYPE_LABELS: Record<DiagramType, string> = { flowchart: "Mission flowchart", sequence: "Sequence", mindmap: "Mission mind map", "mission-architecture": "Mission Architecture", "orbital-timeline": "Orbital Timeline", "system-dependency": "System Dependency Graph", "telemetry-flow": "Telemetry Data Flow", "satellite-recommendation": "Satellite Recommendation Logic", "coverage-constellation": "Coverage and Constellation Flow" };

/** Which Mermaid style the AI should draw for each diagram type. */
const AI_STYLE: Record<DiagramType, string> = {
  flowchart: "a top-down flowchart (flowchart TD) of the mission phases",
  sequence: "a sequenceDiagram between ground control and the spacecraft",
  mindmap: "a mindmap of the objective, mission elements and phases",
  "mission-architecture": "a flowchart TB of the spacecraft architecture and its subsystems",
  "orbital-timeline": "a timeline of the orbital and mission events",
  "system-dependency": "a flowchart LR showing how the systems depend on each other",
  "telemetry-flow": "a flowchart LR of the telemetry and command data flow",
  "satellite-recommendation": "a flowchart TD of the satellite and orbit recommendation logic",
  "coverage-constellation": "a flowchart TB of coverage and constellation design",
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function svgElement(markup: string) {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = parsed.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg" || parsed.querySelector("parsererror")) throw new Error("The diagram SVG is invalid.");
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!svg.getAttribute("width")) svg.setAttribute("width", "1200");
  if (!svg.getAttribute("height")) svg.setAttribute("height", "800");
  return svg;
}

function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mission"; }

function Diagrams() {
  const [missions, setMissions] = useState<MissionOption[]>([]);
  const [missionId, setMissionId] = useState("");
  const [type, setType] = useState<DiagramType>("flowchart");
  const [missionInfo, setMissionInfo] = useState<ApiResult["mission"]>();
  const [svg, setSvg] = useState("");
  const [loadingMissions, setLoadingMissions] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const renderCount = useRef(0);

  async function loadDiagram(nextMission: string, nextType: DiagramType): Promise<ApiResult | null> {
    if (!nextMission) return null;
    setRendering(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/diagrams?mission=${encodeURIComponent(nextMission)}&type=${encodeURIComponent(nextType)}`);
      const data = await response.json() as ApiResult;
      if (!response.ok) throw new Error(data.error || "Could not load this mission.");
      if (!data.mermaidText || !data.mission) throw new Error("The server returned incomplete diagram data.");
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark", flowchart: { htmlLabels: false } });
      const rendered = await mermaid.render(`astra-mission-diagram-${++renderCount.current}`, data.mermaidText);
      setMissionInfo(data.mission);
      setSvg(rendered.svg);
      return data;
    } catch (err) {
      setSvg(""); setMissionInfo(undefined);
      setError(err instanceof Error ? err.message : "Unable to render this mission diagram.");
      return null;
    } finally { setRendering(false); }
  }

  /** One button: the built-in mission knowledge is drawn first, then Gemini improves it using that knowledge and the mission archive. */
  async function generateDiagram() {
    if (!missionId || aiBusy) return;
    setAiBusy(true);
    try {
      const curated = await loadDiagram(missionId, type); // built-in knowledge, shown straight away
      if (!curated?.mission || !curated.mermaidText) return;
      const { mission, mermaidText } = curated;
      setNotice(""); setError("");
      const facts = `Mission: ${mission.name} (${mission.year}). Launch vehicle: ${mission.vehicle}. Objective: ${mission.objective}. Summary: ${mission.summary}.`;
      const extra = aiPrompt.trim() ? ` Extra instructions: ${aiPrompt.trim()}` : "";
      const task = ` Draw ${AI_STYLE[type]}. Use this reference diagram from the ASTRAAI knowledge base as the factual base, then improve and extend it with accurate detail.${extra}`;
      const reference = `\n\nREFERENCE DIAGRAM\n${mermaidText}`.slice(0, 2900 - facts.length - task.length);
      const renderId = `astra-ai-diagram-${++renderCount.current}`;
      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ task: "diagram", kind: TYPE_LABELS[type], prompt: `${facts}${task}${reference}` }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { message?: string } | null;
          throw new Error(body?.message ?? "The AI service could not generate a diagram.");
        }
        const source = cleanMermaid(await response.text());
        if (!source) throw new Error("The AI did not return a usable diagram.");
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark", flowchart: { htmlLabels: false } });
        const rendered = await mermaid.render(renderId, source);
        setSvg(rendered.svg);
        setNotice("Diagram generated from ASTRAAI's mission knowledge and the AI. Check facts against official ISRO sources before using it in a report.");
      } catch (err) {
        document.getElementById(`d${renderId}`)?.remove();
        const reason = err instanceof Error ? err.message : "The AI diagram could not be drawn.";
        setError(`${reason} The built-in mission diagram is shown instead.`);
      }
    } finally { setAiBusy(false); }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingMissions(true); setError("");
      try {
        const response = await fetch("/api/diagrams");
        const data = await response.json() as ApiResult;
        if (!response.ok) throw new Error(data.error || "Could not load the mission catalogue.");
        if (!data.missions?.length) throw new Error("No missions are available in the local catalogue.");
        if (!active) return;
        setMissions(data.missions);
        setMissionId(data.missions[0]!.id);
        await loadDiagram(data.missions[0]!.id, "flowchart");
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Could not load missions."); }
      finally { if (active) setLoadingMissions(false); }
    })();
    return () => { active = false; };
    // Initial load only. The selection handlers explicitly request the selected diagram.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exportSvg() {
    if (!svg || !missionInfo) return;
    try {
      const serialized = new XMLSerializer().serializeToString(svgElement(svg));
      downloadBlob(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }), `astra-${slug(missionInfo.name)}-${type}.svg`);
      setNotice("SVG downloaded.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not export SVG."); }
  }

  async function exportPng() {
    if (!svg || !missionInfo) return;
    try {
      const element = svgElement(svg);
      const bounds = element.getAttribute("viewBox")?.split(/[ ,]+/).map(Number);
      const width = Math.max(1, Math.ceil(Number(element.getAttribute("width")) || bounds?.[2] || 1200));
      const height = Math.max(1, Math.ceil(Number(element.getAttribute("height")) || bounds?.[3] || 800));
      element.setAttribute("width", String(width)); element.setAttribute("height", String(height));
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(element)], { type: "image/svg+xml;charset=utf-8" }));
      try {
        const image = new Image(); image.decoding = "async";
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Could not load diagram for PNG export.")); image.src = url; });
        const canvas = document.createElement("canvas"); canvas.width = Math.min(width * 2, 6000); canvas.height = Math.min(height * 2, 6000);
        const context = canvas.getContext("2d"); if (!context) throw new Error("Your browser could not create an image canvas.");
        context.fillStyle = "#101827"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png"));
        downloadBlob(png, `astra-${slug(missionInfo.name)}-${type}.png`); setNotice("PNG downloaded.");
      } finally { URL.revokeObjectURL(url); }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not export PNG."); }
  }

  function exportPdf() {
    if (!svg || !missionInfo) return;
    try {
      const serialized = new XMLSerializer().serializeToString(svgElement(svg));
      const printWindow = window.open("", "_blank", "width=1000,height=800");
      if (!printWindow) { setError("The browser blocked the print window. Allow pop-ups for this local site and try again."); return; }
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><title>${missionInfo.name} diagram</title><style>html,body{margin:0;padding:16px;background:#fff;color:#111;font-family:Arial,sans-serif}main{width:100%;display:flex;justify-content:center;align-items:flex-start}svg{width:100%;height:auto;max-height:95vh}@page{size:auto;margin:10mm}@media print{body{padding:0}svg{max-height:none;max-width:100%}}</style></head><body><main>${serialized}</main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`);
      printWindow.document.close(); setNotice("In the print dialog, choose Save as PDF.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not prepare the PDF print view."); }
  }

  return (
    <AppShell title="Mission Diagram Generator">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.6fr)]">
        <Panel title="Choose mission">
          <label htmlFor="mission-select" className="mt-5 block text-sm font-medium">ISRO mission</label>
          <select id="mission-select" value={missionId} disabled={loadingMissions || !missions.length} onChange={(event) => { setMissionId(event.target.value); void loadDiagram(event.target.value, type); }} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {missions.map((mission) => <option key={mission.id} value={mission.id}>{mission.name} ({mission.year})</option>)}
          </select>
          <label htmlFor="diagram-type" className="mt-4 block text-sm font-medium">Diagram type</label>
          <select id="diagram-type" value={type} onChange={(event) => { const next = event.target.value as DiagramType; setType(next); void loadDiagram(missionId, next); }} disabled={!missionId} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {(Object.keys(TYPE_LABELS) as DiagramType[]).map((item) => <option key={item} value={item}>{TYPE_LABELS[item]}</option>)}
          </select>
          <label htmlFor="ai-diagram-prompt" className="mt-4 block text-sm font-medium">Extra instructions (optional)</label>
          <textarea id="ai-diagram-prompt" value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} maxLength={300} rows={3} placeholder="e.g. Focus on the landing phase and show the key decisions" className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <Button className="mt-4 w-full" disabled={aiBusy || rendering || loadingMissions || !missionId} onClick={() => void generateDiagram()}><Network className="mr-2 h-4 w-4" />{aiBusy || rendering ? "Generating diagram…" : "Generate diagram"}</Button>
          {missionInfo && <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4"><p className="text-sm font-semibold">{missionInfo.name}</p><p className="mt-1 text-xs text-muted-foreground">{missionInfo.year} · Launch vehicle: {missionInfo.vehicle}</p><p className="mt-3 text-sm">{missionInfo.summary}</p><p className="mt-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">Objective:</span> {missionInfo.objective}</p></div>}
          <p className="mt-4 text-xs text-muted-foreground">Generate diagram starts from curated mission knowledge and asks the AI to improve it. If the AI is unavailable, the curated diagram is shown. For missions still in development, schedules and configurations may change; check official ISRO releases for the latest status.</p>
        </Panel>
        <Panel title="Mission diagram">
          <div className="mb-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void exportPng()} disabled={!svg || rendering}><FileImage className="mr-2 h-4 w-4" />Export PNG</Button><Button variant="secondary" onClick={exportSvg} disabled={!svg || rendering}><Download className="mr-2 h-4 w-4" />Export SVG</Button><Button variant="secondary" onClick={exportPdf} disabled={!svg || rendering}><FileText className="mr-2 h-4 w-4" />Export PDF</Button></div>
          {error && <p role="alert" className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="mb-3 rounded-md border border-border bg-muted p-3 text-sm">{notice}</p>}
          <div className="min-h-96 overflow-auto rounded-lg border border-border bg-[#101827] p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" aria-label="Rendered mission diagram">
            {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">{loadingMissions ? "Loading mission catalogue…" : "Select a mission to display its diagram."}</div>}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
