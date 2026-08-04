import { expect, it } from 'vitest';
import { createArcRoute, createLabel, createMarker, defaultEnter } from './elementDefaults';

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
