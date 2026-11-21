import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Bot, Compass, FileText, Network, Orbit, Satellite, UserRound, BriefcaseBusiness } from "lucide-react";
import { AppShell, Panel } from "@/components/app-shell";
import { getUpcomingLaunches } from "@/lib/space-live.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageHead("Dashboard", "Your ASTRAAI space intelligence dashboard."),
  component: Dashboard,
});

const TOOLS = [
  { to: "/chat", icon: Bot, title: "AI Assistant", text: "Ask grounded questions" },
  { to: "/explorer", icon: Compass, title: "Mission Explorer", text: "Browse ISRO missions" },
  { to: "/simulation", icon: Orbit, title: "Mission Simulation", text: "Check a launch plan" },
  { to: "/documents", icon: FileText, title: "PDF Summary", text: "Summarise a document" },
  { to: "/diagrams", icon: Network, title: "Diagram Generator", text: "Draw mission architecture" },
  { to: "/satellites", icon: Satellite, title: "Satellite Finder", text: "Get a recommendation" },
  { to: "/personas", icon: UserRound, title: "AI Personas", text: "Talk with a mentor" },
  { to: "/careers", icon: BriefcaseBusiness, title: "Career Hub", text: "Plan an aerospace path" },
] as const;

function Dashboard() {
  const fetchLaunches = useServerFn(getUpcomingLaunches);
  const launches = useQuery({ queryKey: ["launches"], queryFn: () => fetchLaunches() });

  return (
    <AppShell title="Space Intelligence Dashboard" subtitle="Explore, understand and simulate missions">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          {TOOLS.map(({ to, icon: Icon, title, text }) => (
            <Link key={to} to={to} className="group rounded-lg border border-border bg-card p-5 hover:border-primary">
              <Icon className="size-5 text-primary" />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                {text} <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100" />
              </p>
            </Link>
          ))}
        </div>
        <div className="space-y-6">
          <Panel title="Upcoming launches (live, UTC)">
            {launches.isLoading && <p className="text-sm text-muted-foreground">Loading launch schedule</p>}
            {launches.data?.error && <p className="text-sm text-muted-foreground">{launches.data.error}</p>}
            <ul className="space-y-3">
              {launches.data?.launches.slice(0, 5).map((l) => (
                <li key={l.name + l.net} className="border-l-2 border-primary pl-3">
                  <p className="text-sm font-medium">{l.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {new Date(l.net).toUTCString().slice(5, 22)} . {l.status}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">Source: The Space Devs Launch Library</p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
