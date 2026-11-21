// One coordinate system for the flight trace, vehicle and orbital motion.
export const EARTH = { x: 500, y: 365, radius: 145 };
export const ORBIT = { rx: 300, ry: 205 };

export function flightPositionAt(progress: number) {
  const linear = Math.max(0, Math.min(1, (progress - 14) / 81));
  const t = linear * linear * (2 - linear);
  const u = 1 - t;
  const a = { x: 380, y: 280 };
  const b = { x: 325, y: 110 };
  const c = { x: 345, y: 160 };
  const d = { x: 500, y: 160 };
  const lerp = (p: typeof a, q: typeof a) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const ab = lerp(a, b), bc = lerp(b, c), cd = lerp(c, d);
  const abc = lerp(ab, bc), bcd = lerp(bc, cd), point = lerp(abc, bcd);
  const dx = 3 * u * u * (b.x - a.x) + 6 * u * t * (c.x - b.x) + 3 * t * t * (d.x - c.x);
  const dy = 3 * u * u * (b.y - a.y) + 6 * u * t * (c.y - b.y) + 3 * t * t * (d.y - c.y);
  return { ...point, rotation: Math.atan2(dy, dx) * 180 / Math.PI + 90, trace: `M${a.x} ${a.y} C${ab.x} ${ab.y} ${abc.x} ${abc.y} ${point.x} ${point.y}` };
}

export function satellitePositionAt(seconds: number) {
  const angle = -Math.PI / 2 + seconds * Math.PI * 2 / 24;
  return { x: EARTH.x + ORBIT.rx * Math.cos(angle), y: EARTH.y + ORBIT.ry * Math.sin(angle), rotation: angle * 180 / Math.PI + 90 };
}