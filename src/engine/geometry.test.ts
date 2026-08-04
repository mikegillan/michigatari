import { expect, it } from 'vitest';
import type { MultiPolygon, Position } from 'geojson';
import { greatCircleArc, sliceByProgress, traceRing } from './geometry';

it('arc endpoints match the inputs', () => {
  const arc = greatCircleArc([139.77, 35.68], [135.5, 34.69]);
  const coords = arc.coordinates;
  expect(coords[0][0]).toBeCloseTo(139.77, 2);
  expect(coords[0][1]).toBeCloseTo(35.68, 2);
  expect(coords[coords.length - 1][0]).toBeCloseTo(135.5, 2);
  expect(coords[coords.length - 1][1]).toBeCloseTo(34.69, 2);
});

it('an arc across the antimeridian is one continuous line', () => {
  const arc = greatCircleArc([170, 0], [-170, 10]);
  for (let i = 1; i < arc.coordinates.length; i++) {
    const jump = Math.abs(arc.coordinates[i][0] - arc.coordinates[i - 1][0]);
    expect(jump).toBeLessThan(90); // no wrap-around jumps
  }
});

it('sliceByProgress returns null at 0, the full line at 1, half at 0.5', () => {
  const line = greatCircleArc([0, 0], [10, 0]);
  expect(sliceByProgress(line, 0)).toBeNull();
  expect(sliceByProgress(line, 1)).toEqual(line);
  const half = sliceByProgress(line, 0.5)!;
  const lastLng = half.coordinates[half.coordinates.length - 1][0];
  expect(lastLng).toBeCloseTo(5, 0);
});

// Big square (0..10) and a small distant square (20..21), both CCW per GeoJSON.
const square = (min: number, max: number): Position[] => [
  [min, min], [max, min], [max, max], [min, max], [min, min],
];
const multi: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [[square(20, 21)], [square(0, 10)]],
};

it('traceRing picks the largest polygon of a MultiPolygon', () => {
  const ring = traceRing(multi);
  expect(Math.max(...ring.coordinates.map((c) => c[0]))).toBe(10);
});

it('traceRing starts at the northernmost vertex and runs clockwise', () => {
  const ring = traceRing(multi);
  expect(ring.coordinates[0][1]).toBe(10); // northernmost latitude
  // clockwise (lat = y-up): from a top corner the next step heads along the
  // top or down the east side, never up. Shoelace sign check:
  const signed = ring.coordinates.slice(0, -1).reduce((sum, [x1, y1], i, open) => {
    const [x2, y2] = open[(i + 1) % open.length];
    return sum + (x2 - x1) * (y2 + y1);
  }, 0);
  expect(signed).toBeGreaterThan(0); // positive = clockwise for y-up coords
});

it('traceRing output is closed (first point repeated at the end)', () => {
  const ring = traceRing(multi);
  expect(ring.coordinates[0]).toEqual(ring.coordinates[ring.coordinates.length - 1]);
});
