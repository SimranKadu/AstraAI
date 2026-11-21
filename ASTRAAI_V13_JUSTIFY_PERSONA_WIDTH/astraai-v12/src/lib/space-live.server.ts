// Live public space data: Launch Library 2 (upcoming launches) and CelesTrak (orbital elements).
const MU = 398600.4418; // km^3/s^2
const EARTH_R = 6378.137;

export type LiveLaunch = {
  name: string;
  net: string;
  status: string;
  provider: string;
  pad: string;
  mission: string;
};

export type LiveOrbit = {
  name: string;
  noradId: number;
  epoch: string;
  inclination: number;
  eccentricity: number;
  periodMin: number;
  apogeeKm: number;
  perigeeKm: number;
};

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function fetchUpcomingLaunches(limit = 8): Promise<LiveLaunch[]> {
  return cached(`launches:${limit}`, 10 * 60_000, async () => {
    const res = await fetch(
      `https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=${limit}&mode=normal`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`Launch data unavailable (${res.status})`);
    const body = (await res.json()) as {
      results: Array<{
        name: string;
        net: string;
        status?: { name?: string };
        launch_service_provider?: { name?: string };
        pad?: { name?: string; location?: { name?: string } };
        mission?: { description?: string } | null;
      }>;
    };
    return body.results.map((l) => ({
      name: l.name,
      net: l.net,
      status: l.status?.name ?? "Unknown",
      provider: l.launch_service_provider?.name ?? "Unknown",
      pad: [l.pad?.name, l.pad?.location?.name].filter(Boolean).join(", "),
      mission: (l.mission?.description ?? "").slice(0, 300),
    }));
  });
}

export async function fetchSatelliteOrbit(name: string): Promise<LiveOrbit | null> {
  const clean = name.trim().toUpperCase().slice(0, 40);
  if (!clean) return null;
  return cached(`gp:${clean}`, 60 * 60_000, async () => {
    const res = await fetch(
      `https://celestrak.org/NORAD/elements/gp.php?NAME=${encodeURIComponent(clean)}&FORMAT=json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const text = await res.text();
    let rows: Array<Record<string, unknown>>;
    try {
      rows = JSON.parse(text);
    } catch {
      return null;
    }
    const row = rows.find((r) => String(r['OBJECT_NAME']).toUpperCase() === clean) ?? rows[0];
    if (!row) return null;
    const meanMotion = Number(row['MEAN_MOTION']); // rev/day
    const e = Number(row['ECCENTRICITY']);
    const n = (meanMotion * 2 * Math.PI) / 86400;
    const a = Math.cbrt(MU / (n * n));
    return {
      name: String(row['OBJECT_NAME']),
      noradId: Number(row['NORAD_CAT_ID']),
      epoch: String(row['EPOCH']),
      inclination: Number(row['INCLINATION']),
      eccentricity: e,
      periodMin: 1440 / meanMotion,
      apogeeKm: a * (1 + e) - EARTH_R,
      perigeeKm: a * (1 - e) - EARTH_R,
    };
  });
}

export function launchesToText(launches: LiveLaunch[]) {
  return launches
    .map(
      (l) =>
        `${l.name}. Scheduled (NET, UTC): ${l.net}. Status: ${l.status}. Provider: ${l.provider}. Pad: ${l.pad}. ${l.mission}`,
    )
    .join("\n");
}

export function orbitToText(o: LiveOrbit) {
  return `${o.name} (NORAD ${o.noradId}) latest orbital elements at epoch ${o.epoch} UTC: inclination ${o.inclination.toFixed(2)} degrees, eccentricity ${o.eccentricity.toFixed(5)}, period ${o.periodMin.toFixed(1)} minutes, apogee ${Math.round(o.apogeeKm)} km, perigee ${Math.round(o.perigeeKm)} km.`;
}
