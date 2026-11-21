import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ExternalLink, Milestone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell, Panel } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CAREER_GUIDE, CAREER_ROLES, roleDetail, type CareerRole } from "@/data/careers";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/careers")({
  head: () =>
    pageHead("Career Hub", "Explore ISRO job roles with the education, exams, books and roadmap each one needs."),
  component: Careers,
});

function Careers() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const role = CAREER_ROLES.find((r) => r.id === activeId);
  return (
    <AppShell title="Career Hub" subtitle="Roles, studies and exams for a career in space">
      {role ? <RoleDetail role={role} onBack={() => setActiveId(null)} /> : <RoleList onOpen={setActiveId} />}
    </AppShell>
  );
}

function ExternalAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden="true" />
    </a>
  );
}

/** List page: only a short description and the related studies for each role. */
function RoleList({ onOpen }: { onOpen: (id: string) => void }) {
  const [group, setGroup] = useState("All");
  const roles = group === "All" ? CAREER_ROLES : CAREER_ROLES.filter((r) => r.group === group);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div role="group" aria-label="Filter roles by area" className="flex flex-wrap gap-2">
        {["All", ...CAREER_GUIDE.groups].map((name) => (
          <Button
            key={name}
            size="sm"
            variant={group === name ? "default" : "outline"}
            aria-pressed={group === name}
            onClick={() => setGroup(name)}
          >
            {name}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen(r.id)}
            className="group flex flex-col rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Badge variant="outline" className="self-start">{r.group}</Badge>
            <h2 className="mt-3 font-semibold">{r.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{r.short}</p>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Related studies</p>
            <p className="mt-1 text-sm">{r.studies}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-primary">
              View details <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Always confirm details in the latest official notice:{" "}
        {CAREER_GUIDE.officialLinks.map((link, i) => (
          <span key={link.url}>
            {i > 0 && " · "}
            <ExternalAnchor href={link.url}>{link.name}</ExternalAnchor>
          </span>
        ))}
      </p>
    </div>
  );
}

/** Detail page: everything about one role. The roadmap appears only when asked for. */
function RoleDetail({ role, onBack }: { role: CareerRole; onBack: () => void }) {
  const { examRoutes, subjects, resources } = roleDetail(role);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.scrollIntoView?.({ block: "start" }); // effects must not return a value
  }, [role.id]);
  const steps = role.path ? role.path.split(" → ") : [];

  return (
    <div ref={top} className="mx-auto max-w-4xl space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft className="size-4" aria-hidden="true" /> All roles
      </Button>

      <header>
        <Badge variant="outline">{role.group}</Badge>
        <h1 className="mt-2 text-2xl font-semibold">{role.title}</h1>
        <p className="mt-1 text-muted-foreground">{role.short}</p>
      </header>

      <Panel title="About this role">
        <p>{role.work}</p>
        {role.goal && (
          <p className="mt-3 text-sm text-muted-foreground">
            Related career goal: <span className="text-foreground">{role.goal}</span>
          </p>
        )}
      </Panel>

      <Panel title="Education needed">
        <p>{role.study}</p>
        {steps.length > 0 && (
          <ol className="mt-4 flex flex-wrap items-center gap-2" aria-label="Education path">
            {steps.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">{step}</span>
                {i < steps.length - 1 && <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Accepted degrees, minimum marks and age limits are set by each recruitment notice.
        </p>
      </Panel>

      <Panel title="Exams and selection">
        <p className="text-sm text-muted-foreground">{CAREER_GUIDE.noSingleExam}</p>
        {role.examNote && <p className="mt-3 text-sm">{role.examNote}</p>}
        <div className="mt-4 space-y-5">
          {examRoutes.map((route) => (
            <div key={route.title}>
              <h3 className="font-medium">{route.title}</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                {route.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              {route.link && (
                <p className="mt-2 text-sm">
                  <ExternalAnchor href={route.link.url}>{route.link.name}</ExternalAnchor>
                </p>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Subjects and books">
        {subjects.length > 0 && (
          <dl className="space-y-3 text-sm">
            {subjects.map((subject) => (
              <div key={subject.area}>
                <dt className="font-medium">{subject.area}</dt>
                <dd className="mt-0.5 text-muted-foreground">{subject.topics}</dd>
              </div>
            ))}
          </dl>
        )}
        {role.subjectNote && <p className="mt-3 text-sm">{role.subjectNote}</p>}
        {role.books.length > 0 && (
          <>
            <h3 className="mt-5 font-medium">Suggested books</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {role.books.map((book) => (
                <li key={book.title}>
                  <span className="font-medium">{book.title}</span>
                  <span className="text-muted-foreground"> by {book.author}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">{CAREER_GUIDE.bookDisclaimer}</p>
          </>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{CAREER_GUIDE.bookNote}</p>
      </Panel>

      <Panel title="Study resources">
        <ul className="space-y-3 text-sm">
          {resources.map((resource) => (
            <li key={resource.name}>
              <ExternalAnchor href={resource.url}>{resource.name}</ExternalAnchor>
              <p className="mt-0.5 text-muted-foreground">{resource.use}</p>
            </li>
          ))}
        </ul>
      </Panel>

      {showRoadmap ? (
        <Roadmap role={role} onHide={() => setShowRoadmap(false)} />
      ) : (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Want a step-by-step plan?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Get a roadmap with the education stage, a six-month foundation plan and how to prepare for selection.
              </p>
            </div>
            <Button onClick={() => setShowRoadmap(true)}>
              <Milestone className="size-4" aria-hidden="true" /> Show roadmap
            </Button>
          </div>
        </Panel>
      )}

      <p className="pb-4 text-xs text-muted-foreground">{CAREER_GUIDE.disclaimer}</p>
    </div>
  );
}

function Roadmap({ role, onHide }: { role: CareerRole; onHide: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, []);
  const education = role.path ? role.path.replace(/ → /g, ", then ") : role.study;
  return (
    <section ref={ref} aria-label={`Roadmap for ${role.title}`} className="rounded-lg border border-primary/40 bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-primary">Roadmap: {role.title}</h2>
        <Button variant="ghost" size="sm" onClick={onHide}>Hide</Button>
      </div>

      <ol className="mt-4 space-y-4">
        <li>
          <h3 className="font-medium">Step 1. Education</h3>
          <p className="mt-1 text-sm text-muted-foreground">{education}</p>
        </li>
        <li>
          <h3 className="font-medium">Step 2. Choose one target post</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Read its latest official advertisement from beginning to end and confirm your degree, branch, marks and age
            match the eligibility.
          </p>
        </li>
        <li>
          <h3 className="font-medium">Step 3. Six-month foundation plan</h3>
          <ol className="mt-2 space-y-2 text-sm">
            {CAREER_GUIDE.plan.map((item) => (
              <li key={item.month} className="flex gap-3">
                <span className="w-16 shrink-0 font-mono text-xs uppercase text-primary">Month {item.month}</span>
                <span className="text-muted-foreground">{item.focus}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">{CAREER_GUIDE.dailyRoutine}</p>
        </li>
        <li>
          <h3 className="font-medium">Step 4. Prepare for selection</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {CAREER_GUIDE.prepSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </li>
      </ol>
    </section>
  );
}
