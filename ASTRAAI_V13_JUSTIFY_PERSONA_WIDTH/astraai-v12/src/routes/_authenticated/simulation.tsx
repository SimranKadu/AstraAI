import { createFileRoute } from "@tanstack/react-router";
import { Activity, ArrowUpToLine, Gauge, Navigation, Pause, Play, RefreshCw, Ruler, ShieldAlert, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AiOutput } from "@/components/ai-output";
import { AppShell, Panel } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { LAUNCH_VEHICLES } from "@/data/space-dataset";
import { useStreamText } from "@/hooks/use-stream-text";
import { canDeploySatellite, MISSION_FAILURE_PROGRESS, MISSION_PHASES, riskEffectsAt, telemetryAt, type RiskLevel } from "@/lib/mission-simulation";
import { EARTH, ORBIT, flightPositionAt, satellitePositionAt } from "@/lib/mission-flight";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/simulation")({
  head: () => pageHead("Mission Simulation", "Run an animated launch simulation with mission telemetry, risk and stage tracking."),
  component: Simulation,
});

const MU = 398600.4418;
const R = 6378.137;
const SITE_LAT = 13.72;
const DURATION_SECONDS = 100;

const MISSIONS = [
  { id: "leo", label: "Earth Observation (LEO)" },
  { id: "sso", label: "Sun-synchronous (SSO)" },
  { id: "gto", label: "Geosynchronous Transfer (GTO)" },
] as const;

function calculate(vehicleId: string, mission: string, mass: number, alt: number, inc: number) {
  const selected = LAUNCH_VEHICLES.find((item) => item.id === vehicleId) ?? LAUNCH_VEHICLES[0];
  if (!selected) throw new Error("No launch vehicle data is available.");
  const targetAltitude = mission === "gto" ? 35786 : alt;
  const radius = R + Math.max(200, mission === "gto" ? 200 : alt);
  const circularVelocity = Math.sqrt(MU / radius);
  const period = (2 * Math.PI * Math.sqrt(radius ** 3 / MU)) / 60;
  const rotationBoost = 0.4651 * Math.cos((SITE_LAT * Math.PI) / 180) * Math.cos((inc * Math.PI) / 180);
  let deltaV = circularVelocity + 1.6 - Math.max(rotationBoost, -0.3);
  let capacity = mission === "sso" ? selected.ssoKg : selected.leoKg;
  let targetVelocity = circularVelocity;
  if (mission === "gto") {
    const perigeeRadius = R + 200;
    const apogeeRadius = R + 35786;
    const semiMajor = (perigeeRadius + apogeeRadius) / 2;
    targetVelocity = Math.sqrt(MU * (2 / perigeeRadius - 1 / semiMajor));
    deltaV = targetVelocity + 1.6 - rotationBoost;
    capacity = selected.gtoKg;
  }
  const planeChange = inc < SITE_LAT ? 2 * circularVelocity * Math.sin(((SITE_LAT - inc) * Math.PI) / 360) : 0;
  const margin = capacity > 0 ? ((capacity - mass) / capacity) * 100 : -100;
  return { vehicle: selected, targetAltitude, circularVelocity, targetVelocity, period, deltaV: deltaV + planeChange, capacity, margin };
}

function Simulation() {
  const [vehicle, setVehicle] = useState("pslv");
  const [mission, setMission] = useState<string>("sso");
  const [mass, setMass] = useState(1200);
  const [altitude, setAltitude] = useState(600);
  const [inclination, setInclination] = useState(97.8);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const lastFrame = useRef<number | null>(null);
  const briefing = useStreamText();
  const result = useMemo(() => calculate(vehicle, mission, mass, altitude, inclination), [vehicle, mission, mass, altitude, inclination]);
  const telemetry = useMemo(() => telemetryAt(progress, result.targetAltitude, result.targetVelocity, result.margin), [progress, result]);
  const effects = riskEffectsAt(progress, result.margin, reducedMotion);
  const endProgress = result.margin < 0 ? MISSION_FAILURE_PROGRESS : 100;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing) {
      lastFrame.current = null;
      return;
    }
    let frame = 0;
    const tick = (time: number) => {
      if (lastFrame.current === null) lastFrame.current = time;
      const elapsed = Math.min(100, time - lastFrame.current);
      lastFrame.current = time;
      setProgress((current) => {
        const next = current + (elapsed / 1000 / DURATION_SECONDS) * 100 * speed;
        if (next >= endProgress) {
          setPlaying(false);
          return endProgress;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, endProgress]);

  const start = () => {
    if (progress >= endProgress) setProgress(0);
    setPlaying(true);
  };
  const restart = () => {
    setPlaying(false);
    setProgress(0);
  };
  const analyse = () => briefing.run({
    task: "simulation",
    params: {
      vehicle: result.vehicle.name,
      missionType: MISSIONS.find((item) => item.id === mission)?.label ?? mission,
      payloadKg: String(mass), targetAltitudeKm: String(result.targetAltitude), inclinationDeg: String(inclination),
      estimatedDeltaVKmS: result.deltaV.toFixed(2), vehicleCapacityKg: String(result.capacity), payloadMarginPercent: result.margin.toFixed(1),
      currentRisk: telemetry.risk, riskReason: telemetry.riskReason,
    },
  });

  return (
    <AppShell title="Mission Simulation" subtitle="Animated flight dynamics and telemetry">
      <div className="mx-auto max-w-[88rem] space-y-5">
        <div className="grid items-start gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
          <div className="space-y-5">
            <Panel title="Mission configuration">
            <div className="space-y-4">
              <Field label="Launch vehicle"><select value={vehicle} onChange={(event) => { setVehicle(event.target.value); restart(); }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{LAUNCH_VEHICLES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Mission profile"><select value={mission} onChange={(event) => { setMission(event.target.value); restart(); }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{MISSIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
              <Field label="Payload mass (kg)"><Input type="number" min={1} max={30000} value={mass} onChange={(event) => { setMass(Math.max(1, Number(event.target.value))); restart(); }} /></Field>
              {mission !== "gto" && <Field label={`Target altitude: ${altitude} km`}><Slider min={200} max={2000} step={10} value={[altitude]} onValueChange={([value]) => setAltitude(value ?? altitude)} /></Field>}
              <Field label={`Inclination: ${inclination.toFixed(1)}°`}><Slider min={0} max={110} step={0.1} value={[inclination]} onValueChange={([value]) => setInclination(value ?? inclination)} /></Field>
              <div className="space-y-2 border-t border-border pt-4">
                <Label>Simulation speed</Label>
                <div className="grid grid-cols-3 gap-2">{[0.5, 1, 2].map((value) => <Button key={value} variant={speed === value ? "default" : "outline"} size="sm" onClick={() => setSpeed(value)}>{value}×</Button>)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={playing ? () => setPlaying(false) : start}>{playing ? <Pause /> : <Play />}{playing ? "Pause" : progress >= endProgress ? "Launch again" : progress > 0 ? "Resume" : "Launch"}</Button>
                <Button variant="outline" onClick={restart}><RefreshCw /> Restart</Button>
              </div>
            </div>
            </Panel>
            <RiskPanel risk={telemetry.risk} reason={telemetry.riskReason} deviation={telemetry.trajectoryDeviation} />
          </div>

          <div className="min-w-0 space-y-5">
            <MissionScene telemetry={telemetry} effects={effects} playing={playing} margin={result.margin} reducedMotion={reducedMotion} speed={speed}>
              <div className="scene-sidebar">
              <section aria-labelledby="live-telemetry-heading" className="scene-overlay scene-telemetry">
                <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <h2 id="live-telemetry-heading" className="font-mono text-[0.65rem] uppercase text-foreground">Live telemetry</h2>
                  <Badge variant="outline" className="shrink-0 font-mono text-[0.55rem]">T+ {telemetry.progress.toFixed(1)}s</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <TelemetryStat icon={ArrowUpToLine} label="Altitude" value={telemetry.altitudeKm.toFixed(1)} unit="km" level={telemetry.altitudeKm / Math.max(1, result.targetAltitude)} />
                  <TelemetryStat icon={Navigation} label="Velocity" value={telemetry.velocityKmS.toFixed(2)} unit="km/s" level={telemetry.velocityKmS / Math.max(0.01, result.targetVelocity)} />
                  <TelemetryStat icon={Activity} label="Acceleration" value={telemetry.accelerationG.toFixed(2)} unit="g" level={telemetry.accelerationG / 4} />
                  <TelemetryStat icon={Ruler} label="Distance" value={telemetry.distanceKm.toFixed(1)} unit="km" level={telemetry.distanceKm / Math.max(1, result.targetAltitude * 1.48)} />
                </div>
              </section>
              <section aria-label="Mission timeline" className="scene-overlay scene-timeline">
                <h2 className="mb-2 font-mono text-[0.65rem] uppercase text-foreground">Live mission timeline</h2>
                <MissionTimeline active={telemetry.phaseIndex} />
              </section>
              </div>
            </MissionScene>
          </div>
        </div>


        <Panel title="Mission analysis">
          <Button variant="outline" onClick={analyse} disabled={briefing.loading}><Gauge /> {briefing.loading ? "Analysing" : "Generate engineering briefing"}</Button>
          <div className="mt-4"><AiOutput {...briefing} justify empty="Generate a grounded assessment of payload margin, flight risk, and comparable missions." /></div>
        </Panel>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }

function MissionScene({ telemetry, effects, playing, margin, reducedMotion, speed, children }: { telemetry: ReturnType<typeof telemetryAt>; effects: ReturnType<typeof riskEffectsAt>; playing: boolean; margin: number; reducedMotion: boolean; speed: number; children?: ReactNode }) {
  const criticalFailure = effects.failed;
  const position = flightPositionAt(telemetry.progress);
  const separated = telemetry.progress >= 46;
  const orbitReached = canDeploySatellite(telemetry.progress, margin);
  const [orbitSeconds, setOrbitSeconds] = useState(0);
  useEffect(() => {
    if (!orbitReached) { setOrbitSeconds(0); return; }
    if (reducedMotion || (!playing && telemetry.progress < 100)) return;
    let frame = 0;
    let previous: number | null = null;
    const tick = (time: number) => {
      const elapsed = previous === null ? 0 : Math.min(100, time - previous) / 1000 * speed;
      setOrbitSeconds((current) => current + elapsed);
      previous = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [orbitReached, playing, reducedMotion, speed, telemetry.progress >= 100]);
  const satellite = satellitePositionAt(reducedMotion ? 0 : orbitSeconds);
  return (
    <section className={`mission-scene risk-${telemetry.risk.toLowerCase()} ${playing ? "is-playing" : ""} ${criticalFailure ? "mission-lost" : ""}`} aria-label="Animated rocket mission visualization">
      <div className="scene-stars" aria-hidden="true" />
      <svg viewBox="140 0 720 650" className="mission-cosmos" role="img" aria-label={orbitReached ? "Satellite revolving around Earth" : criticalFailure ? "Mission lost during ascent" : "Rocket ascending from Earth along its flight path"}>
        <defs>
          <radialGradient id="mission-ocean" cx="30%" cy="24%" r="80%"><stop offset="0" className="earth-light" /><stop offset=".65" className="earth-water" /><stop offset="1" className="earth-night" /></radialGradient>
          <radialGradient id="mission-shade" cx="24%" cy="25%" r="80%"><stop offset=".35" stopOpacity="0" /><stop offset="1" className="earth-shadow" stopOpacity=".85" /></radialGradient>
          <linearGradient id="mission-exhaust" x1="0" y1="0" x2="0" y2="1"><stop className="exhaust-core" /><stop offset=".4" className="exhaust-fire" /><stop offset="1" className="exhaust-fire" stopOpacity="0" /></linearGradient>
          <clipPath id="mission-earth-clip"><circle cx={EARTH.x} cy={EARTH.y} r={EARTH.radius} /></clipPath>
        </defs>
        <ellipse className="orbital-guide" cx={EARTH.x} cy={EARTH.y} rx={ORBIT.rx} ry={ORBIT.ry} />
        <circle className="earth-atmosphere" cx={EARTH.x} cy={EARTH.y} r={EARTH.radius + 5} />
        <circle cx={EARTH.x} cy={EARTH.y} r={EARTH.radius} fill="url(#mission-ocean)" />
        <g clipPath="url(#mission-earth-clip)">
          <g className="earth-land">
            <path d="M375 260l42-24 37 7 15 21-17 23-29 9-4 31-17 3-12-24-24-16zM418 338l32-5 29 23 5 34-19 41-15 31-13-13-5-40-18-33zM481 252l31-19 39 7 18 20 36-9 30 26 18 39-26 20-31-15-25 8-17-21-22-1-9-25-28 2zM495 312l35-4 31 27-6 39-25 36-20-10-11-36-19-30zM574 398l31-11 24 24-7 22-39 4-19-20z" />
          </g>
          <g className="earth-clouds"><path d="M378 286q45-32 86-7m34-20q48-17 89 13M391 364q36-11 61 7m76 38q43-21 89-8M464 468q39 12 69-2" /></g>
          <circle cx={EARTH.x} cy={EARTH.y} r={EARTH.radius} fill="url(#mission-shade)" />
        </g>
        <path className="ascent-guide" d="M380 280 C325 110 345 160 500 160" />
        <path className="ascent-trace" d={position.trace} />
        {telemetry.progress < 22 && <g className="launch-structure" transform="translate(380 280) rotate(-18)"><path d="M-27-38V25H18M-35 25H25M-27-30H-14M-27-12H-14M-27 6H-14" /></g>}
        {telemetry.progress >= 46 && telemetry.progress < 58 && !criticalFailure && <g className="separated-booster" transform={`translate(${position.x - (telemetry.progress - 46) * 2} ${position.y + (telemetry.progress - 46) * 6 + 30}) rotate(-25)`}><path d="M-7-16H7V16H-7Z" /></g>}
        {!orbitReached && <g transform={`translate(${position.x} ${position.y}) rotate(${position.rotation})`}>
          <g className={`rocket-art shake-${effects.shake}`}>
            {effects.explode ? <foreignObject x="-65" y="-65" width="130" height="130"><div className="svg-explosion"><div className="failure-burst" />{Array.from({ length: 8 }, (_, i) => <span key={i} className="debris-particle" style={{ "--tx": `${Math.cos(i * Math.PI / 4) * (35 + i * 3)}px`, "--ty": `${Math.sin(i * Math.PI / 4) * (35 + i * 3)}px`, "--r": `${i * 90}deg` } as CSSProperties} />)}</div></foreignObject> : <>
              {!criticalFailure && telemetry.progress >= 10 && <path className={`rocket-exhaust ${playing ? "burning" : ""}`} fill="url(#mission-exhaust)" d={separated ? "M-5 12Q-12 30 0 62Q12 30 5 12Z" : "M-6 18Q-16 38 0 79Q16 38 6 18Z"} />}
              {separated ? <>
                <path className="rocket-body" d="M0-19Q-7-12-7 0L-7 12 7 12 7 0Q7-12 0-19Z" />
                <path className="rocket-nose" d="M0-19Q-5-13-6-8H6Q5-13 0-19Z" />
                <path className="rocket-band" d="M-7 6H7" />
                <circle className="rocket-window" cy="-2" r="2.5" />
              </> : <>
                <path className="rocket-body" d="M0-29Q-10-18-10 0L-10 17 10 17 10 0Q10-18 0-29Z" />
                <path className="rocket-nose" d="M0-29Q-7-22-9-12H9Q7-22 0-29Z" />
                <path className="rocket-fins" d="M-10 3l-9 19 9-4zM10 3l9 19-9-4z" />
                <path className="rocket-band" d="M-10 8H10M-6 20H6" />
                <circle className="rocket-window" cy="-4" r="3" />
              </>}
            </>}
          </g>
        </g>}
        {orbitReached && <g className="orbiting-satellite" transform={`translate(${satellite.x} ${satellite.y}) rotate(${satellite.rotation})`} aria-label="Satellite deployed in orbit">
          <g className="satellite-panels"><path d="M-38-9h25v18h-25zM13-9h25v18H13z" /><path className="panel-grid" d="M-30-9V9m9-18V9M21-9V9m9-18V9M-38 0h25M13 0h25" /></g>
          <path className="satellite-body" d="M-9-10H9V10H-9Z" /><path className="satellite-antenna" d="M0-10v-10m-5 0h10M-13 0h4M9 0h4" />
        </g>}
        <text className="earth-label" x="500" y="540" textAnchor="middle">EARTH</text>
      </svg>
      <div className="scene-heading"><span>T+ {telemetry.progress.toFixed(1)}s</span><strong role="status">{telemetry.phase.name}</strong></div>
      <div className="scene-footer"><span>{telemetry.phase.stage}</span><span>{telemetry.progress.toFixed(0)}% mission elapsed</span></div>
      {children}
    </section>
  );
}

function TelemetryStat({ icon: Icon, label, value, unit, level }: { icon: LucideIcon; label: string; value: string; unit: string; level: number }) {
  const boundedLevel = Math.max(0, Math.min(1, level));
  return (
    <div className="telemetry-stat">
      <div className="telemetry-stat-heading"><Icon /><span>{label}</span></div>
      <div className="telemetry-value"><strong>{value}</strong><span>{unit}</span></div>
      <div className="telemetry-meter" aria-hidden="true"><i style={{ width: `${boundedLevel * 100}%` }} /></div>
      <small>SIMULATED</small>
    </div>
  );
}


const riskClasses: Record<RiskLevel, string> = { LOW: "risk-low", MEDIUM: "risk-medium", HIGH: "risk-high", CRITICAL: "risk-critical" };
function RiskPanel({ risk, reason, deviation }: { risk: RiskLevel; reason: string; deviation: number }) {
  return <Panel title="Dynamic flight risk"><div className={`risk-readout ${riskClasses[risk]}`}><ShieldAlert /><div><span>RISK LEVEL</span><strong>{risk}</strong></div></div><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{reason}</p><div className="mt-4 flex justify-between border-t border-border pt-3 font-mono text-xs"><span>Trajectory deviation</span><strong>{deviation.toFixed(2)}°</strong></div></Panel>;
}

function MissionTimeline({ active }: { active: number }) {
  const list = useRef<HTMLOListElement>(null);
  // Scrolls on its own: as each phase finishes the list glides to the next one, and it ends on "Mission Success".
  useEffect(() => {
    const box = list.current;
    const current = box?.children[active] as HTMLElement | undefined;
    if (!box || !current) return;
    const top = Math.max(0, current.offsetTop - box.clientHeight / 2 + current.clientHeight / 2);
    const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (typeof box.scrollTo === "function") box.scrollTo({ top, behavior: calm ? "auto" : "smooth" });
    else box.scrollTop = top;
  }, [active]);
  return <ol ref={list} className="mission-timeline">{MISSION_PHASES.map((phase, index) => <li key={phase.name} className={index < active ? "complete" : index === active ? "active" : "pending"}><span>{index < active ? "✓" : index === active ? "→" : "○"}</span><div><strong>{phase.name}</strong><small>{phase.stage}</small></div></li>)}</ol>;
}
