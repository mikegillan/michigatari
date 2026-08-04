import { expect, it } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { syncElementLayers } from './layerSync';
import { applyScene, createElementLayers, applyElements } from './applyScene';
import { createFakeMap } from './fakeMap';
import { sceneAt } from '../engine/scene';
import { computeTimeline } from '../engine/timeline';
import type {
  Element, LabelElement, MarkerElement, Project, RegionElement, RouteElement,
} from '../engine/types';
import type { ElementScene } from '../engine/elements';

const ENTER = { keyframeId: 'kf1', animation: 'pop' as const, delayMs: 0, durationMs: 400, easing: 'easeInOut' as const };

function project(elements: Element[]): Project {
  return {
    version: 1,
    settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: '' },
    keyframes: [],
    elements,
  };
}

function marker(style: Record<string, string | number> = {}): MarkerElement {
  return { id: 'mk1', type: 'marker', style, data: { lngLat: [1, 2] }, enter: ENTER };
}

function label(style: Record<string, string | number> = {}): LabelElement {
  return { id: 'lb1', type: 'label', style, data: { lngLat: [3, 4], text: 'hi' }, enter: ENTER };
}

function route(style: Record<string, string | number> = {}): RouteElement {
  return {
    id: 'rt1', type: 'route', style,
    data: { mode: 'arc', waypoints: [[0, 0], [1, 1]], geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
    enter: ENTER,
  };
}

function region(style: Record<string, string | number> = {}): RegionElement {
  return {
    id: 'rg1', type: 'region', style,
    data: { query: 'x', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
    enter: ENTER,
  };
}

const asMap = (fake: ReturnType<typeof createFakeMap>) => fake as unknown as MapLibreMap;

it('creates a region\'s line layer plus its fill source/layer, and removal removes both layers before both sources', () => {
  const fake = createFakeMap();
  syncElementLayers(asMap(fake), project([region()]));
  expect(fake.layers.map((l) => l.id).sort()).toEqual(['el-rg1', 'el-rg1-fill']);
  expect(fake.sources.has('el-rg1')).toBe(true);
  expect(fake.sources.has('el-rg1-fill')).toBe(true);

  syncElementLayers(asMap(fake), project([]));
  expect(fake.layers).toHaveLength(0);
  expect(fake.sources.size).toBe(0);
  const idx = (op: string, id: string) => fake.calls.findIndex(([o, i]) => o === op && i === id);
  expect(idx('removeLayer', 'el-rg1')).toBeLessThan(idx('removeSource', 'el-rg1'));
  expect(idx('removeLayer', 'el-rg1-fill')).toBeLessThan(idx('removeSource', 'el-rg1-fill'));
});

it('region create seeds el-<id> and el-<id>-fill layers/sources, with the fill source carrying the element geometry', () => {
  const fake = createFakeMap();
  const el = region();
  syncElementLayers(asMap(fake), project([el]));
  expect(fake.layers.map((l) => l.id).sort()).toEqual(['el-rg1', 'el-rg1-fill']);
  expect(fake.sources.has('el-rg1')).toBe(true);
  expect(fake.sources.has('el-rg1-fill')).toBe(true);
  expect(fake.sources.get('el-rg1-fill')?.data).toEqual({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: el.data.geometry }],
  });
});

it('restyles a surviving marker\'s circle-color', () => {
  const fake = createFakeMap();
  syncElementLayers(asMap(fake), project([marker({ color: '#111111' })]));
  syncElementLayers(asMap(fake), project([marker({ color: '#222222' })]));
  expect(fake.layers.find((l) => l.id === 'el-mk1')?.paint?.['circle-color']).toBe('#222222');
});

it('restyles a surviving label\'s text-color (paint) and text-size (layout)', () => {
  const fake = createFakeMap();
  syncElementLayers(asMap(fake), project([label({ color: '#111111', size: 16 })]));
  syncElementLayers(asMap(fake), project([label({ color: '#222222', size: 30 })]));
  const layer = fake.layers.find((l) => l.id === 'el-lb1');
  expect(layer?.paint?.['text-color']).toBe('#222222');
  expect(layer?.layout?.['text-size']).toBe(30);
});

it('restyles a surviving route\'s line-color and line-width', () => {
  const fake = createFakeMap();
  syncElementLayers(asMap(fake), project([route({ color: '#111111', width: 3 })]));
  syncElementLayers(asMap(fake), project([route({ color: '#222222', width: 7 })]));
  const layer = fake.layers.find((l) => l.id === 'el-rt1');
  expect(layer?.paint?.['line-color']).toBe('#222222');
  expect(layer?.paint?.['line-width']).toBe(7);
});

it('restyles a surviving region\'s fill source with the LATEST element geometry, not the creation-time one', () => {
  const fake = createFakeMap();
  const el = region();
  syncElementLayers(asMap(fake), project([el])); // create path -> seeds fill source with el.data.geometry
  const moved: RegionElement = {
    ...el,
    data: { ...el.data, geometry: { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] } },
  };
  syncElementLayers(asMap(fake), project([moved])); // still present -> restyle path, new geometry
  expect(fake.sources.get('el-rg1-fill')?.data).toEqual({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: moved.data.geometry }],
  });
});

it('applyElements skips an element with no source on the map, without throwing', () => {
  const fake = createFakeMap();
  const el = marker();
  const states: Record<string, ElementScene> = { mk1: { visible: true, opacity: 1, scale: 1, progress: 1 } };
  expect(() => applyElements(asMap(fake), project([el]), states)).not.toThrow();
});

it('sets marker radius to size * max(0, scale)', () => {
  const fake = createFakeMap();
  const el = marker({ size: 10 });
  createElementLayers(asMap(fake), el);
  const states: Record<string, ElementScene> = { mk1: { visible: true, opacity: 1, scale: 1.1, progress: 1 } };
  applyElements(asMap(fake), project([el]), states);
  expect(fake.layers.find((l) => l.id === 'el-mk1')?.paint?.['circle-radius']).toBeCloseTo(11);
});

it('sets EMPTY data on an invisible element\'s source via a LATER setData call, not just creation-time state', () => {
  const fake = createFakeMap();
  const el = marker();
  createElementLayers(asMap(fake), el); // addSource seeds data EMPTY -> must not be mistaken for the real assertion
  const visible: Record<string, ElementScene> = { mk1: { visible: true, opacity: 1, scale: 1, progress: 1 } };
  applyElements(asMap(fake), project([el]), visible);
  expect(fake.sources.get('el-mk1')?.data).toEqual({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: el.data.lngLat } }],
  });

  const invisible: Record<string, ElementScene> = { mk1: { visible: false, opacity: 0, scale: 0, progress: 0 } };
  applyElements(asMap(fake), project([el]), invisible);
  const setDataCalls = fake.calls.filter(([op, id]) => op === 'setData' && id === 'el-mk1');
  expect(setDataCalls).toHaveLength(2); // one per applyElements call, excluding the creation-time addSource
  expect(fake.sources.get('el-mk1')?.data).toEqual({ type: 'FeatureCollection', features: [] });
});

it('applyScene drives the map camera to the keyframe pose and re-evaluates element paint from the timeline', () => {
  const fake = createFakeMap();
  const el = marker({ size: 10 });
  const proj: Project = {
    version: 1,
    settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: '' },
    keyframes: [
      {
        id: 'kf1',
        camera: { center: [139.77, 35.68], zoom: 8, bearing: 0, pitch: 0 },
        holdMs: 1000,
        transition: { durationMs: 0, easing: 'linear' },
      },
    ],
    elements: [el, region()],
  };
  syncElementLayers(asMap(fake), proj);
  const timeline = computeTimeline(proj);

  applyScene(asMap(fake), proj, sceneAt(proj, 0, timeline));
  expect(fake.jumpToCalls.at(-1)).toEqual(proj.keyframes[0].camera);

  // 200ms into the marker's 400ms pop (ENTER): mid-flight, not resting at rest scale.
  applyScene(asMap(fake), proj, sceneAt(proj, 200, timeline));
  const radius = fake.layers.find((l) => l.id === 'el-mk1')?.paint?.['circle-radius'] as number;
  expect(radius).not.toBe(10); // default size — pop overshoot means it isn't resting there
  expect(radius).toBeGreaterThanOrEqual(0);
});
