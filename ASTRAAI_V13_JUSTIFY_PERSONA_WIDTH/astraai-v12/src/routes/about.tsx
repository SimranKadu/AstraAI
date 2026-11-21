import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () => pageHead("About", "How ASTRAAI grounds answers in MOSDAC, ISRO mission data and live space feeds."),
  component: About,
});

const TEAM = [
  { name: "Neha Tandel", photo: "/team/neha-tandel.jpg" },
  { name: "Simran Kadu", photo: "/team/simran-kadu.jpg" },
  { name: "Shravan Khandagale", photo: "/team/shravan-khandagale.jpg" },
  { name: "Labh Sawant", photo: "/team/labh-sawant.jpg" },
];

function About() {
  return (
    <div className="h-dvh overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-primary">ASTRAAI</Link>
        <h1 className="mt-6 text-4xl font-semibold">Pioneering space intelligence</h1>
        <p className="mt-6 text-muted-foreground">ASTRAAI helps students, researchers and analysts understand space missions. It uses retrieval-augmented generation: every answer is built from passages found in its sources rather than from general model memory.</p>
        <h2 className="mt-10 text-xl font-semibold">Data sources</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
          <li>MOSDAC documents on INSAT, Oceansat, SCATSAT and data access</li>
          <li>A curated dataset of ISRO missions and launch vehicles</li>
          <li>Live upcoming launches from The Space Devs Launch Library</li>
          <li>Live orbital elements from CelesTrak</li>
        </ul>
        <h2 className="mt-10 text-xl font-semibold">Project Developed by</h2>
        <ul className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
          {TEAM.map((member, index) => (
            <li key={member.name} className="text-center">
              <img src={member.photo} alt={member.name} width={480} height={480} loading="lazy" className="aspect-square w-full rounded-lg border border-border object-cover object-top" />
              <p className="mt-3 text-sm font-medium">{index + 1}. {member.name}</p>
            </li>
          ))}
        </ul>
        <footer className="mt-12 border-t border-border pt-6 text-center">
          <p className="text-sm font-medium">Under the Guidance of Prof. Snehal Gavale</p>
          <p className="mt-1 text-sm text-muted-foreground">Students of Saraswati College Of Engineering</p>
        <div className="mt-5 flex justify-center gap-4 text-sm">
          <Link to="/auth" className="text-primary">Get started</Link>
          <Link to="/privacy" className="text-muted-foreground">Privacy</Link>
          <Link to="/terms" className="text-muted-foreground">Terms</Link>
        </div>
        </footer>
      </div>
    </div>
  );
}
