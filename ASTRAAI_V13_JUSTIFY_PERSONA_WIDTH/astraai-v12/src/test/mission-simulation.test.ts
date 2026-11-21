import { describe, expect, it } from "vitest";
import { canDeploySatellite, riskEffectsAt, telemetryAt } from "@/lib/mission-simulation";
import { flightPositionAt, satellitePositionAt } from "@/lib/mission-flight";
import { PERSONAS } from "@/data/personas";

describe("Payload risk effects", () => {
  it("orbits after successful insertion, never after an over-capacity failure", () => {
    expect(canDeploySatellite(94.99, 10)).toBe(false);
    expect(canDeploySatellite(95, 0)).toBe(true);
    expect(canDeploySatellite(100, -1)).toBe(false);
  });
  it("joins the ascent to a continuous orbit around Earth", () => {
    const flight = flightPositionAt(95);
    const orbit = satellitePositionAt(0);
    expect(flight.x).toBeCloseTo(orbit.x);
    expect(flight.y).toBeCloseTo(orbit.y);
    expect(satellitePositionAt(6).x).toBeCloseTo(800);
    expect(satellitePositionAt(12).y).toBeCloseTo(570);
    expect(satellitePositionAt(24).x).toBeCloseTo(orbit.x);
    expect(satellitePositionAt(24).y).toBeCloseTo(orbit.y);
  });
  it("shakes slightly below 10% spare capacity, but not at 10%", () => {
    expect(riskEffectsAt(30, 9.99, false).shake).toBe("slight");
    expect(riskEffectsAt(30, 10, false).shake).toBe("none");
    expect(telemetryAt(30, 600, 7.5, 9.99).risk).toBe("HIGH");
  });
  it("shakes hard only when payload is over capacity", () => {
    expect(riskEffectsAt(30, -0.01, false).shake).toBe("hard");
    expect(riskEffectsAt(30, 0, false).shake).toBe("slight");
  });
  it("explodes partway up and terminates without successful orbit", () => {
    expect(riskEffectsAt(63, -1, false).failed).toBe(false);
    expect(riskEffectsAt(64, -1, false).explode).toBe(true);
    const end = telemetryAt(100, 600, 7.5, -1);
    expect(end.progress).toBe(64);
    expect(end.phase.name).toBe("Mission lost");
    expect(end.altitudeKm).toBeLessThan(600);
  });
  it("disables shaking and explosion with reduced motion, preserving failure", () => {
    expect(riskEffectsAt(30, 5, true).shake).toBe("none");
    expect(riskEffectsAt(30, -1, true).shake).toBe("none");
    expect(riskEffectsAt(64, -1, true)).toEqual({ failed: true, shake: "none", explode: false });
  });
  it("does not shake on the ground and succeeds with spare capacity", () => {
    expect(riskEffectsAt(0, -1, false).shake).toBe("none");
    expect(telemetryAt(100, 600, 7.5, 10).phase.name).toBe("Mission Success");
  });
});

it("provides the six requested portrait personas without a MOSDAC analyst", () => {
  expect(PERSONAS.map(({ name }) => name).sort()).toEqual([
    "Dr. Vikram Sarabhai", "Dr. A. P. J. Abdul Kalam", "Dr. Rakesh Sharma",
    "Prof. Satish Dhawan", "Dr. Kalpana Chawla", "Sunita Williams",
  ].sort());
  expect(PERSONAS.every(({ portrait }) => Boolean(portrait))).toBe(true);
});