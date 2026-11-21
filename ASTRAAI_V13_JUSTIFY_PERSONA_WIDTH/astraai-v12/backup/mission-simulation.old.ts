import type { LaunchVehicle } from "@/data/space-dataset";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type MissionPhase = {
  name: string;
  start: number;
  end: number;
  stage: string;
  altitudeRatio: number;
  velocityRatio: number;
};

export const MISSION_PHASES: MissionPhase[] = [
  { name: "Mission Preparation", start: 0, end: 5, stage: "Ground", altitudeRatio: 0, velocityRatio: 0 },
  { name: "Countdown", start: 5, end: 10, stage: "Ground", altitudeRatio: 0, velocityRatio: 0 },
  { name: "Engine Ignition", start: 10, end: 14, stage: "Stage 1", altitudeRatio: 0.002, velocityRatio: 0.01 },
  { name: "Liftoff", start: 14, end: 22, stage: "Stage 1", altitudeRatio: 0.025, velocityRatio: 0.045 },
  { name: "Atmospheric Ascent", start: 22, end: 38, stage: "Stage 1", altitudeRatio: 0.16, velocityRatio: 0.28 },
  { name: "Max-Q", start: 38, end: 46, stage: "Stage 1", altitudeRatio: 0.28, velocityRatio: 0.4 },
  { name: "Stage Separation", start: 46, end: 53, stage: "Stage 2", altitudeRatio: 0.4, velocityRatio: 0.5 },
  { name: "Upper Stage Burn", start: 53, end: 72, stage: "Upper stage", altitudeRatio: 0.74, velocityRatio: 0.82 },
  { name: "Fairing Separation", start: 72, end: 78, stage: "Upper stage", altitudeRatio: 0.83, velocityRatio: 0.9 },
  { name: "Payload Deployment", start: 78, end: 86, stage: "Payload", altitudeRatio: 0.94, velocityRatio: 0.97 },
  { name: "Orbit Insertion", start: 86, end: 95, stage: "Payload", altitudeRatio: 1, velocityRatio: 1 },
  { name: "Mission Success", start: 95, end: 100, stage: "Orbital", altitudeRatio: 1, velocityRatio: 1 },
];

const FALLBACK_PHASE: MissionPhase = {
  name: "Mission Preparation",
  start: 0,
  end: 5,
  stage: "Ground",
  altitudeRatio: 0,
  velocityRatio: 0,
};

export type Telemetry = {
  phaseIndex: number;
  phase: MissionPhase;
  altitudeKm: number;
  velocityKmS: number;
  accelerationG: number;
  distanceKm: number;
  progress: number;
  risk: RiskLevel;
  riskReason: string;
  trajectoryDeviation: number;
};

const smoothstep = (value: number) => value * value * (3 - 2 * value);

export function telemetryAt(progress: number, targetAltitudeKm: number, orbitalVelocityKmS: number, margin: number): Telemetry {
  const bounded = Math.max(0, Math.min(100, progress));
  const phaseIndex = Math.max(0, MISSION_PHASES.findIndex((item) => bounded >= item.start && bounded < item.end));
  const phase = MISSION_PHASES[phaseIndex] ?? MISSION_PHASES[MISSION_PHASES.length - 1] ?? FALLBACK_PHASE;
  const local = smoothstep(Math.max(0, Math.min(1, (bounded - phase.start) / Math.max(1, phase.end - phase.start))));
  const previous = MISSION_PHASES[Math.max(0, phaseIndex - 1)] ?? FALLBACK_PHASE;
  const altitudeRatio = previous.altitudeRatio + (phase.altitudeRatio - previous.altitudeRatio) * local;
  const velocityRatio = previous.velocityRatio + (phase.velocityRatio - previous.velocityRatio) * local;
  const dynamicPressure = Math.sin(Math.PI * Math.min(1, bounded / 55));
  const accelerationG = bounded < 10 ? 0 : Math.max(0.2, 1.05 + 2.7 * velocityRatio - 1.1 * dynamicPressure);
  const trajectoryDeviation = margin < 0 ? Math.min(9, Math.abs(margin) * 0.18 + bounded * 0.025) : margin < 8 ? 1.8 + bounded * 0.006 : 0.25 + dynamicPressure * 0.55;
  let risk: RiskLevel = "LOW";
  let riskReason = "All flight parameters are within the expected envelope.";
  if (margin < 0) {
    risk = "CRITICAL";
    riskReason = "Vehicle capacity exceeded; commanded trajectory cannot meet the target orbit.";
  } else if (margin < 10) {
    risk = "HIGH";
    riskReason = "Less than 10% spare payload capacity remains, increasing ascent sensitivity.";
  } else if (phase.name === "Max-Q" && margin < 20) {
    risk = "MEDIUM";
    riskReason = "Peak aerodynamic load with limited performance margin.";
  }
  return {
    phaseIndex,
    phase,
    altitudeKm: targetAltitudeKm * altitudeRatio,
    velocityKmS: orbitalVelocityKmS * velocityRatio,
    accelerationG,
    distanceKm: targetAltitudeKm * altitudeRatio * 1.48,
    progress: bounded,
    risk,
    riskReason,
    trajectoryDeviation,
  };
}

export const vehicleProfile = (vehicle: LaunchVehicle) => ({
  source: "Published vehicle capability",
  sourceType: "REAL REFERENCE DATA" as const,
  note: vehicle.note,
});