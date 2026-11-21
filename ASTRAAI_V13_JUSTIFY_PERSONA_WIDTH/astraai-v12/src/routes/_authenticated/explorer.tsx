import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AiOutput } from "@/components/ai-output";
import { AppShell, Panel } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SPACE_MISSIONS, type SpaceMission } from "@/data/space-dataset";
import { useStreamText } from "@/hooks/use-stream-text";
import { getSatelliteOrbit } from "@/lib/space-live.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/explorer")({
  head: () => pageHead("Mission Explorer", "Browse ISRO missions with AI briefs and live orbital data."),
  component: Explorer,
});

const STATUSES = ["All", "Active", "Success", "Completed", "Partial", "Planned"] as const;

function Explorer() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("All");
  const [selected, setSelected] = useState<SpaceMission>(SPACE_MISSIONS[0]!);
  const brief = useStreamText();
  const fetchOrbit = useServerFn(getSatelliteOrbit);
  const orbit = useQuery({
    queryKey: ["orbit", selected.celestrakName],
    queryFn: () => fetchOrbit({ data: { name: selected.celestrakName! } }),
    enabled: Boolean(selected.celestrakName),
  });

  const list = useMemo(
    () =>
      SPACE_MISSIONS.filter(
        (m) =>
          (status === "All" || m.status === status) &&
          `${m.name} ${m.vehicle} ${m.type}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, status],
  );

  const choose = (m: SpaceMission) => {
    setSelected(m);
    brief.stop();
    brief.setText("");
  };

  return (
    <AppShell title="Mission Explorer" subtitle="ISRO missions with AI insight">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search missions, vehicles or types" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s}</Button>
            ))}
          </div>
          <ul className="space-y-2">
            {list.map((m) => (
              <li key={m.name}>
                <button
                  onClick={() => choose(m)}
                  className={`w-full rounded-lg border p-4 text-left hover:border-primary ${selected.name === m.name ? "border-primary bg-accent" : "border-border bg-card"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.name}</span>
                    <Badge variant="outline">{m.status}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{m.vehicle} . {m.launchDate}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{m.type}</p>
                </button>
              </li>
            ))}
            {list.length === 0 && <p className="text-sm text-muted-foreground">No missions match.</p>}
          </ul>
        </div>
        <div className="space-y-4 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-8.5rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <Panel title="Mission summary">
            <h2 className="text-xl font-semibold">{selected.name}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Vehicle</dt><dd>{selected.vehicle}</dd></div>
              <div><dt className="text-muted-foreground">Launch</dt><dd>{selected.launchDate}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Orbit</dt><dd>{selected.orbit}</dd></div>
            </dl>
            <p className="mt-4 text-sm leading-relaxed">{selected.summary}</p>
          </Panel>
          {selected.celestrakName && (
            <Panel title="Live orbital elements (CelesTrak)">
              {orbit.isLoading && <p className="text-sm text-muted-foreground">Fetching current orbit</p>}
              {orbit.data?.orbit ? (
                <dl className="grid grid-cols-2 gap-3 font-mono text-sm">
                  <div><dt className="text-xs text-muted-foreground">Perigee</dt><dd>{Math.round(orbit.data.orbit.perigeeKm)} km</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Apogee</dt><dd>{Math.round(orbit.data.orbit.apogeeKm)} km</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Inclination</dt><dd>{orbit.data.orbit.inclination.toFixed(2)} deg</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Period</dt><dd>{orbit.data.orbit.periodMin.toFixed(1)} min</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-muted-foreground">Epoch (UTC)</dt><dd>{orbit.data.orbit.epoch.slice(0, 19)}</dd></div>
                </dl>
              ) : (
                !orbit.isLoading && <p className="text-sm text-muted-foreground">{orbit.data?.error ?? "No current elements found."}</p>
              )}
            </Panel>
          )}
          <Panel title="AI mission brief">
            <Button size="sm" onClick={() => brief.run({ task: "mission", name: selected.name })} disabled={brief.loading}>
              Generate brief
            </Button>
            <div className="mt-4">
              <AiOutput {...brief} justify empty="Generate a structured brief grounded in the archive." />
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
