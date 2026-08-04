import { expect, it } from 'vitest';
import type { LineString } from 'geojson';
import { createArcRoute, createLabel, createMarker, createRegion, createRoadRoute, defaultEnter } from './elementDefaults';
import type { RegionCandidate } from '../providers/nominatim';
import type { LngLat } from '../engine/types';

it('defaultEnter picks the per-type animation and duration', () => {
  expect(defaultEnter('marker', 'kf')).toMatchObject({ animation: 'pop', durationMs: 400, delayMs: 0, easing: 'easeInOut', keyframeId: 'kf' });
  expect(defaultEnter('label', 'kf')).toMatchObject({ animation: 'fade', durationMs: 400 });
  expect(defaultEnter('route', 'kf')).toMatchObject({ animation: 'draw', durationMs: 1500 });
  expect(defaultEnter('region', 'kf')).toMatchObject({ animation: 'draw', durationMs: 1500 });
});

it('creators produce well-formed elements with unique ids', () => {
  const m = createMarker([135, 35], 'kf');
  const l = createLabel([135, 35], 'kf');
  expect(m.type).toBe('marker');
  expect(m.data.lngLat).toEqual([135, 35]);
  expect(l.data.text).toBe('Label');
  expect(m.id).not.toBe(l.id);
});

it('arc routes bake a great-circle geometry at creation', () => {
  const r = createArcRoute([139.77, 35.68], [135.5, 34.69], 'kf');
  expect(r.data.mode).toBe('arc');
  expect(r.data.waypoints).toEqual([[139.77, 35.68], [135.5, 34.69]]);
  expect(r.data.geometry.type).toBe('LineString');
  expect(r.data.geometry.coordinates.length).toBeGreaterThan(2);
});

it('road routes store the given waypoints and OSRM geometry as-is (not rebaked)', () => {
  const waypoints: LngLat[] = [[139.77, 35.68], [140, 36], [135.5, 34.69]];
  const geometry: LineString = { type: 'LineString', coordinates: [[139.77, 35.68], [140.1, 35.9], [135.5, 34.69]] };
  const r = createRoadRoute(waypoints, geometry, 'kf');
  expect(r.data.mode).toBe('road');
  expect(r.data.waypoints).toEqual(waypoints);
  expect(r.data.geometry).toEqual(geometry);
});

it('regions store the candidate\'s display name, osm id/type, and baked geometry', () => {
  const candidate: RegionCandidate = {
    displayName: 'Hokkaido, Japan',
    osmId: 3795658,
    osmType: 'relation',
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  };
  const r = createRegion(candidate, 'kf');
  expect(r.data.query).toBe(candidate.displayName);
  expect(r.data.osmId).toBe(candidate.osmId);
  expect(r.data.osmType).toBe(candidate.osmType);
  expect(r.data.geometry).toEqual(candidate.geometry);
});
