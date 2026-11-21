import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Compass, FileText, Network, Orbit, Satellite } from "lucide-react";
import { GlossaryHints } from "@/components/glossary-hints";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Space Intelligence Platform",
      "Explore ISRO missions, simulate launches, summarise documents and ask grounded questions about satellites and live launches.",
    ),
  component: Landing,
});

const FEATURES = [
  { icon: Bot, title: "AI Assistant", text: "Grounded answers from the MOSDAC archive, an ISRO mission dataset and live launch and orbit data." },
  { icon: Compass, title: "Mission Explorer", text: "Browse Indian missions from Chandrayaan-1 to NISAR, with live orbital elements for active satellites." },
  { icon: Orbit, title: "Mission Simulation", text: "Follow a smooth launch-to-orbit sequence with telemetry, stage tracking and dynamic flight risk." },
  { icon: FileText, title: "PDF Summary", text: "Upload a mission document for a concise summary, or request a detailed analysis." },
  { icon: Network, title: "Diagram Generator", text: "Turn a prompt into a mission architecture, timeline or dependency diagram." },
  { icon: Satellite, title: "Satellite Finder", text: "Describe your application and coverage needs to get a recommended satellite architecture." },
];

function Landing() {
  return (
    <div data-glossary-root className="h-dvh overflow-y-auto bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-5">
        <div className="grid size-8 place-items-center rounded-md border border-border bg-accent text-primary">
          <Satellite className="size-4" />
        </div>
        <span className="text-lg font-semibold text-primary">ASTRAAI</span>
        <nav className="ml-auto flex items-center gap-2">
          <Link to="/about" className="px-3 text-sm text-muted-foreground hover:text-primary">About</Link>
          <Button asChild variant="ghost"><Link to="/auth">Log in</Link></Button>
          <Button asChild><Link to="/auth" search={{ mode: "signup" }}>Sign up</Link></Button>
        </nav>
      </header>
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-16 lg:pt-24">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Space intelligence platform</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight lg:text-6xl">
          Understand India's space missions with grounded AI.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          ASTRAAI combines the MOSDAC document archive, a curated ISRO mission dataset and live public launch and orbit feeds, so answers come from real data.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg"><Link to="/auth" search={{ mode: "signup" }}>Create an account</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/auth">I already have one</Link></Button>
        </div>
      </section>
      <section className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="bg-background p-8">
              <Icon className="size-5 text-primary" />
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-6 px-6 py-8 text-sm text-muted-foreground">
        <span>Data: MOSDAC, ISRO public records, The Space Devs, CelesTrak</span>
        <Link to="/privacy" className="ml-auto hover:text-primary">Privacy</Link>
        <Link to="/terms" className="hover:text-primary">Terms</Link>
      </footer>
      <GlossaryHints />
    </div>
  );
}
