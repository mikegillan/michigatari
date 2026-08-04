import type { CameraPose, LngLat, Project } from './types';
import { ease } from './easing';
import { segmentAt, type Timeline } from './timeline';

// Web-mercator world pixels (world is 512 * 2^zoom px wide).
function project(lngLat: LngLat, zoom: number): { x: number; y: number } {
  const worldSize = 512 * 2 ** zoom;
  const [lng, lat] = lngLat;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * worldSize,
    y: ((1 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / Math.PI) / 2) * worldSize,
  };
}

function unproject(x: number, y: number, zoom: number): LngLat {
  const worldSize = 512 * 2 ** zoom;
  const lng = (x / worldSize) * 360 - 180;
  const n = Math.PI * (1 - (2 * y) / worldSize);
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return [lng, lat];
}

function shortestBearingDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// Flight "curviness" — 1.42 is the van Wijk & Nuij recommended value and
// MapLibre's default.
const RHO = 1.42;

// Derived camera poses must not alias caller/project state (React editor
// mutation hazard) — always hand back a fresh object with a copied center.
const clonePose = (p: CameraPose): CameraPose => ({
  center: [p.center[0], p.center[1]],
  zoom: p.zoom,
  bearing: p.bearing,
  pitch: p.pitch,
});

/**
 * Camera pose at fraction t (0–1, ALREADY eased) along the van Wijk–Nuij
 * flight path. `viewport` is the nominal output size in px — pass
 * viewportForSettings(project.settings) so preview and export match.
 */
export function interpolateCamera(
  from: CameraPose,
  to: CameraPose,
  t: number,
  viewport: { width: number; height: number },
): CameraPose {
  if (t <= 0) return clonePose(from);
  if (t >= 1) return clonePose(to);

  const bearing = from.bearing + shortestBearingDelta(from.bearing, to.bearing) * t;
  const pitch = from.pitch + (to.pitch - from.pitch) * t;

  // Normalize destination longitude to prevent long-way-around antimeridian flights.
  let toLng = to.center[0];
  while (toLng - from.center[0] > 180) toLng -= 360;
  while (toLng - from.center[0] < -180) toLng += 360;

  const p0 = project(from.center, from.zoom);
  const p1 = project([toLng, to.center[1]], from.zoom);
  const u1 = Math.hypot(p1.x - p0.x, p1.y - p0.y); // ground distance, px at start zoom
  const w0 = Math.max(viewport.width, viewport.height); // visible span, px
  const w1 = w0 / 2 ** (to.zoom - from.zoom); // same span at end zoom
  const rho2 = RHO * RHO;

  let zoom: number;
  let un: number; // normalized ground progress 0–1

  if (u1 < 1e-6) {
    // No ground distance: pure zoom, center pinned.
    zoom = from.zoom + (to.zoom - from.zoom) * t;
    un = t;
  } else {
    // van Wijk & Nuij 2003, as implemented by mapbox/maplibre flyTo.
    const b = (i: 0 | 1) =>
      (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho2 * rho2 * u1 * u1) /
      (2 * (i ? w1 : w0) * rho2 * u1);
    const r = (i: 0 | 1) => {
      const bi = b(i);
      return Math.log(Math.sqrt(bi * bi + 1) - bi);
    };
    const r0 = r(0);
    const S = (r(1) - r0) / RHO; // total path length in flight-space
    if (!isFinite(S)) {
      // Near-degenerate ground distance: b(i) grows huge and
      // sqrt(b*b+1)-b cancels to 0, so r → -Infinity and S → NaN/Infinity.
      // Fall back to a pure zoom with the center pinned, same as u1 < 1e-6.
      zoom = from.zoom + (to.zoom - from.zoom) * t;
      un = t;
    } else {
      const s = t * S;
      const w = Math.cosh(r0) / Math.cosh(r0 + RHO * s); // width factor: >1 means zoomed out
      const u = (w0 * (Math.cosh(r0) * Math.tanh(r0 + RHO * s) - Math.sinh(r0))) / rho2;
      zoom = from.zoom + Math.log2(1 / w);
      un = Math.min(1, Math.max(0, u / u1));
    }
  }

  const cx = p0.x + (p1.x - p0.x) * un;
  const cy = p0.y + (p1.y - p0.y) * un;
  return { center: unproject(cx, cy, from.zoom), zoom, bearing, pitch };
}

export function cameraAt(
  proj: Project,
  timeline: Timeline,
  timeMs: number,
  viewport: { width: number; height: number },
): CameraPose {
  const seg = segmentAt(timeline, timeMs);
  if (!seg) throw new Error('Project has no keyframes.');
  if (seg.kind === 'hold') return clonePose(proj.keyframes[seg.keyframeIndex].camera);
  const t = (Math.min(timeMs, seg.endMs) - seg.startMs) / (seg.endMs - seg.startMs);
  return interpolateCamera(
    proj.keyframes[seg.fromIndex].camera,
    proj.keyframes[seg.toIndex].camera,
    ease(seg.easing, t),
    viewport,
  );
}
