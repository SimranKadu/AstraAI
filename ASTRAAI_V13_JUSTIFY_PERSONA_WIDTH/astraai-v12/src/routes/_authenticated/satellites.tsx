import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AiOutput } from "@/components/ai-output";
import { AppShell, Panel } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useStreamText } from "@/hooks/use-stream-text";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/satellites")({
  head: () => pageHead("Satellite Finder", "Get an AI recommended satellite architecture for your mission."),
  component: Satellites,
});

const FIELDS = {
  application: ["Communications", "Earth Observation (Optical)", "Synthetic Aperture Radar", "Navigation", "Meteorological"],
  coverage: ["Global", "Regional", "National (India)", "Polar regions"],
  orbit: ["LEO", "MEO", "GEO", "Sun-synchronous", "Let ASTRAAI decide"],
  revisit: ["Continuous", "Hourly", "Daily", "Weekly"],
} as const;

function Satellites() {
  const [params, setParams] = useState<Record<string, string>>({
    application: FIELDS.application[0], coverage: FIELDS.coverage[2], orbit: FIELDS.orbit[4], revisit: FIELDS.revisit[2],
  });
  const rec = useStreamText();
  return (
    <AppShell title="Satellite Finder" subtitle="AI satellite architecture recommendation">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[22rem_1fr]">
        <Panel title="Mission parameters">
          <div className="space-y-4">
            {(Object.keys(FIELDS) as (keyof typeof FIELDS)[]).map((k) => (
              <div key={k} className="space-y-2">
                <label htmlFor={k} className="text-sm capitalize">{k}</label>
                <select id={k} value={params[k]} onChange={(e) => setParams({ ...params, [k]: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {FIELDS[k].map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <Button className="w-full" disabled={rec.loading} onClick={() => rec.run({ task: "satellite", params })}>Recommend architecture</Button>
          </div>
        </Panel>
        <Panel title="Recommendation">
          <AiOutput {...rec} justify empty="Choose parameters to get a recommended configuration." />
        </Panel>
      </div>
    </AppShell>
  );
}
