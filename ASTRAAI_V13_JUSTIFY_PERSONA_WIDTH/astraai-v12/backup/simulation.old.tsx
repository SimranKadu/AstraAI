import { createFileRoute } from "@tanstack/react-router";
import { Activity, ArrowUpToLine, Gauge, Navigation, Pause, Play, RefreshCw, Rocket, Ruler, ShieldAlert, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AiOutput } from "@/components/ai-output";
import { AppShell, Panel } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { LAUNCH_VEHICLES } from "@/data/space-dataset";
import { useStreamText } from "@/hooks/use-stream-text";
import { MISSION_PHASES, telemetryAt, vehicleProfile, type RiskLevel } from "@/lib/mission-simulation";
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
  const lastFrame = useRef<number | null>(null);
  const briefing = useStreamText();
  const result = useMemo(() => calculate(vehicle, mission, mass, altitude, inclination), [vehicle, mission, mass, altitude, inclination]);
  const telemetry = useMemo(() => telemetryAt(progress, result.targetAltitude, result.targetVelocity, result.margin), [progress, result]);
  const profile = vehicleProfile(result.vehicle);

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
        if (next >= 100) {
          setPlaying(false);
          return 100;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  const start = () => {
    if (progress >= 100) setProgress(0);
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
              <Field label="Payload mass (kg)"><Input type="number" min={1} max={30000} value={mass} onChange={(event) => setMass(Math.max(1, Number(event.target.value)))} /></Field>
              {mission !== "gto" && <Field label={`Target altitude: ${altitude} km`}><Slider min={200} max={2000} step={10} value={[altitude]} onValueChange={([value]) => setAltitude(value ?? altitude)} /></Field>}
              <Field label={`Inclination: ${inclination.toFixed(1)}°`}><Slider min={0} max={110} step={0.1} value={[inclination]} onValueChange={([value]) => setInclination(value ?? inclination)} /></Field>
              <div className="space-y-2 border-t border-border pt-4">
                <Label>Simulation speed</Label>
                <div className="grid grid-cols-3 gap-2">{[0.5, 1, 2].map((value) => <Button key={value} variant={speed === value ? "default" : "outline"} size="sm" onClick={() => setSpeed(value)}>{value}×</Button>)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={playing ? () => setPlaying(false) : start}>{playing ? <Pause /> : <Play />}{playing ? "Pause" : progress > 0 ? "Resume" : "Launch"}</Button>
                <Button variant="outline" onClick={restart}><RefreshCw /> Restart</Button>
              </div>
            </div>
            </Panel>
            <RiskPanel risk={telemetry.risk} reason={telemetry.riskReason} deviation={telemetry.trajectoryDeviation} />
          </div>

          <div className="min-w-0 space-y-5">
            <MissionScene telemetry={telemetry} criticalFailure={telemetry.risk === "CRITICAL" && progress > 64} />
            <section aria-labelledby="live-telemetry-heading">
              <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <div className="min-w-0">
                  <h2 id="live-telemetry-heading" className="font-mono text-xs uppercase text-foreground">Live telemetry</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Estimated flight parameters for the current mission phase</p>
                </div>
                <Badge variant="outline" className="shrink-0 font-mono text-[0.6rem]">T+ {telemetry.progress.toFixed(1)}s</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <TelemetryStat icon={ArrowUpToLine} label="Altitude" value={telemetry.altitudeKm.toFixed(1)} unit="km" level={telemetry.altitudeKm / Math.max(1, result.targetAltitude)} />
                <TelemetryStat icon={Navigation} label="Velocity" value={telemetry.velocityKmS.toFixed(2)} unit="km/s" level={telemetry.velocityKmS / Math.max(0.01, result.targetVelocity)} />
                <TelemetryStat icon={Activity} label="Acceleration" value={telemetry.accelerationG.toFixed(2)} unit="g" level={telemetry.accelerationG / 4} />
                <TelemetryStat icon={Ruler} label="Distance" value={telemetry.distanceKm.toFixed(1)} unit="km" level={telemetry.distanceKm / Math.max(1, result.targetAltitude * 1.48)} />
              </div>
            </section>
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Panel title="Telemetry provenance">
            <div className="grid gap-4 sm:grid-cols-2">
              <SourceBlock title={profile.sourceType} text={`${profile.source}: ${result.vehicle.name}. ${profile.note}. Target capacity ${result.capacity || 0} kg.`} />
              <SourceBlock title="SIMULATED / ESTIMATED TELEMETRY" text="No public live ascent telemetry is available for this configured mission. Altitude, velocity, acceleration and flight path are interpolated from orbital mechanics and the selected vehicle's published capability." />
            </div>
          </Panel>
          <Panel title="Mission timeline"><MissionTimeline active={telemetry.phaseIndex} /></Panel>
        </div>

        <Panel title="Mission analysis">
          <Button variant="outline" onClick={analyse} disabled={briefing.loading}><Gauge /> {briefing.loading ? "Analysing" : "Generate engineering briefing"}</Button>
          <div className="mt-4"><AiOutput {...briefing} empty="Generate a grounded assessment of payload margin, flight risk, and comparable missions." /></div>
        </Panel>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }

function MissionScene({ telemetry, criticalFailure }: { telemetry: ReturnType<typeof telemetryAt>; criticalFailure: boolean }) {
  const flightProgress = Math.max(0, Math.min(1, (telemetry.progress - 14) / 81));
  const inverse = 1 - flightProgress;
  const x = inverse ** 3 * 13 + 3 * inverse ** 2 * flightProgress * 18 + 3 * inverse * flightProgress ** 2 * 34 + flightProgress ** 3 * 83;
  const y = inverse ** 3 * 82 + 3 * inverse ** 2 * flightProgress * 58 + 3 * inverse * flightProgress ** 2 * 28 + flightProgress ** 3 * 18;
  const dx = 3 * inverse ** 2 * 5 + 6 * inverse * flightProgress * 16 + 3 * flightProgress ** 2 * 49;
  const dy = 3 * inverse ** 2 * -24 + 6 * inverse * flightProgress * -30 + 3 * flightProgress ** 2 * -10;
  const rotation = Math.atan2(dy, dx) * (180 / Math.PI) + 45;
  const orbitReached = telemetry.progress >= 95 && !criticalFailure;
  return (
    <section className={`mission-scene risk-${telemetry.risk.toLowerCase()}`} aria-label="Animated rocket mission visualization">
      <div className="scene-stars" aria-hidden="true" />
      <div className="atmosphere-band" aria-hidden="true" />
      <div className="orbit-line" aria-hidden="true" />
      <div className="earth-limb" aria-hidden="true" />
      <div className="launch-pad" aria-hidden="true"><span /></div>
      <svg viewBox="0 0 100 100" className="flight-path" aria-hidden="true"><path d="M13 82 C18 58, 34 28, 83 18" pathLength="100" style={{ strokeDasharray: `${flightProgress * 100} 100` }} /></svg>
      {!orbitReached && (
        <div className={`rocket-vehicle ${criticalFailure ? "is-failed" : ""}`} style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }} aria-hidden="true">
          {criticalFailure ? (
            <>
              <div className="failure-burst" />
              {[...Array(4)].map((_, i) => (
                <span key={i} className="debris-particle" style={{ "--tx": `${(i % 2 ? 1 : -1) * (20 + i * 5)}px`, "--ty": `${(i < 2 ? -1 : 1) * (15 + i * 5)}px`, "--r": `${i * 90}deg` } as any} />
              ))}
            </>
          ) : <><Rocket /><span className="engine-plume" /></>}
        </div>
      )}
      {orbitReached && <div className="deployed-satellite" style={{ left: `${x}%`, top: `${y}%` }} aria-label="Satellite deployed in orbit"><SatelliteIcon /></div>}
      <div className="scene-heading"><span>T+ {telemetry.progress.toFixed(1)}s</span><strong>{criticalFailure ? "MISSION LOST" : telemetry.phase.name}</strong></div>
      <div className="scene-footer"><span>{telemetry.phase.stage}</span><span>{telemetry.progress.toFixed(0)}% mission elapsed</span></div>
    </section>
  );
}

function SatelliteIcon() { return <span className="satellite-icon"><i /><b /><i /></span>; }

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

function SourceBlock({ title, text }: { title: string; text: string }) { return <div className="source-block"><Badge variant="outline">{title}</Badge><p>{text}</p></div>; }

const riskClasses: Record<RiskLevel, string> = { LOW: "risk-low", MEDIUM: "risk-medium", HIGH: "risk-high", CRITICAL: "risk-critical" };
function RiskPanel({ risk, reason, deviation }: { risk: RiskLevel; reason: string; deviation: number }) {
  return <Panel title="Dynamic flight risk"><div className={`risk-readout ${riskClasses[risk]}`}><ShieldAlert /><div><span>RISK LEVEL</span><strong>{risk}</strong></div></div><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{reason}</p><div className="mt-4 flex justify-between border-t border-border pt-3 font-mono text-xs"><span>Trajectory deviation</span><strong>{deviation.toFixed(2)}°</strong></div></Panel>;
}

function MissionTimeline({ active }: { active: number }) {
  return <ol className="mission-timeline">{MISSION_PHASES.map((phase, index) => <li key={phase.name} className={index < active ? "complete" : index === active ? "active" : "pending"}><span>{index < active ? "✓" : index === active ? "→" : "○"}</span><div><strong>{phase.name}</strong><small>{phase.stage}</small></div></li>)}</ol>;
}