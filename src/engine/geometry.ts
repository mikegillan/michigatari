import { area, greatCircle, length, lineSliceAlong, polygon } from '@turf/turf';
import type { Feature, LineString, MultiPolygon, Polygon, Position } from 'geojson';
import type { LngLat } from './types';

export function greatCircleArc(a: LngLat, b: LngLat, steps = 128): LineString {
  const gc = greatCircle(a, b, { npoints: steps });
  const geom = gc.geometry;
  if (geom.type === 'LineString') return geom;
  // Crossing the antimeridian: turf splits the line in two at ±180.
  // Unwrap the second half past ±180 so it renders as one continuous line.
  const [first, second] = geom.coordinates;
  const offset = first[first.length - 1][0] > 0 ? 360 : -360;
  const unwrapped = second.map(([lng, lat]) => [lng + offset, lat]);
  return { type: 'LineString', coordinates: [...first, ...unwrapped] };
}

export function sliceByProgress(line: LineString, progress: number): LineString | null {
  if (progress <= 0) return null;
  if (progress >= 1) return line;
  const feature: Feature<LineString> = { type: 'Feature', properties: {}, geometry: line };
  return lineSliceAlong(feature, 0, length(feature) * progress).geometry;
}

// Largest outer ring, reordered to start at its northernmost vertex, wound
// clockwise, closed. This is the ring the trace-on animation follows; other
// rings of a MultiPolygon fade in with the fill (spec §3.4).
export function traceRing(geometry: Polygon | MultiPolygon): LineString {
  const outers: Position[][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates[0]]
      : geometry.coordinates.map((poly) => poly[0]);
  const largest = outers.reduce((best, ring) =>
    area(polygon([ring])) > area(polygon([best])) ? ring : best,
  );

  const open = largest.slice(0, -1); // drop the closing duplicate
  let north = 0;
  open.forEach((pos, i) => {
    if (pos[1] > open[north][1]) north = i;
  });
  let ring = [...open.slice(north), ...open.slice(0, north)];

  // Shoelace with y-up coords: negative = counterclockwise → reverse.
  const signed = ring.reduce((sum, [x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    return sum + (x2 - x1) * (y2 + y1);
  }, 0);
  if (signed < 0) ring = [ring[0], ...ring.slice(1).reverse()];

  return { type: 'LineString', coordinates: [...ring, ring[0]] };
}
