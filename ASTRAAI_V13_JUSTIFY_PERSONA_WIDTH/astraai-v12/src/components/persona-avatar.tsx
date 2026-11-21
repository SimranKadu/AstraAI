import { Radio } from "lucide-react";
import { useEffect, useState } from "react";
import type { Persona } from "@/data/personas";

type PersonaState = "idle" | "thinking" | "speaking";

/** "Dr. A. P. J. Abdul Kalam" -> "AK" (title and initials dropped, first and last name kept). */
function initialsOf(name: string) {
  const words = name.replace(/\b(Dr|Prof)\.?/g, "").split(/\s+/).filter((w) => w.length > 2);
  return `${words[0]?.[0] ?? "A"}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export function PersonaAvatar({ persona, state }: { persona: Persona; state: PersonaState }) {
  // Photos are tried in order: a file you add at public/personas/<id>.jpg, then the hosted portrait.
  // If neither loads (for example when running outside Lovable), initials are shown instead.
  const sources = [`/personas/${persona.id}.jpg`, persona.portrait].filter((src): src is string => Boolean(src));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setAttempt(0);
  }, [persona.id]);
  const src = sources[attempt];
  return (
    <div className={`persona-visual is-${state}`} aria-label={`${persona.name} is ${state}`}>
      <div className="persona-orbit" aria-hidden="true"><i /><i /></div>
      <div className="persona-portrait" aria-hidden="true">
        {src ? (
          <img src={src} alt={persona.portraitAlt ?? persona.name} onError={() => setAttempt((n) => n + 1)} />
        ) : (
          <span className="grid size-full place-items-center text-4xl font-semibold text-primary" aria-hidden="true">{initialsOf(persona.name)}</span>
        )}
        {state === "speaking" && <span className="persona-voice-wave"><i /><i /><i /><i /><i /></span>}
      </div>
      <div className="persona-state">
        <Radio />
        <span>{state === "speaking" ? "Speaking..." : state === "thinking" ? "Analysing..." : "Ready"}</span>
      </div>
      <div>
        <h2>{persona.name}</h2>
        <p>{persona.role}</p>
        {persona.portraitSource && <a className="persona-credit" href={persona.portraitSource} target="_blank" rel="noreferrer">Photo: {persona.portraitCredit}</a>}
      </div>
    </div>
  );
}