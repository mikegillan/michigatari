import type { LineString } from 'geojson';
import { greatCircleArc } from '../engine/geometry';
import type {
  AnimationBinding,
  Element,
  EnterAnimation,
  LabelElement,
  LngLat,
  MarkerElement,
  RegionElement,
  RouteElement,
} from '../engine/types';
import type { RegionCandidate } from '../providers/nominatim';
import { newId } from './store';

export function defaultEnter(type: Element['type'], keyframeId: string): AnimationBinding<EnterAnimation> {
  const base = { keyframeId, delayMs: 0, easing: 'easeInOut' as const };
  switch (type) {
    case 'marker':
      return { ...base, animation: 'pop', durationMs: 400 };
    case 'label':
      return { ...base, animation: 'fade', durationMs: 400 };
    case 'route':
    case 'region':
      return { ...base, animation: 'draw', durationMs: 1500 };
  }
}

export function createMarker(lngLat: LngLat, keyframeId: string): MarkerElement {
  return {
    id: newId(),
    type: 'marker',
    style: { color: '#d63031', size: 8 },
    data: { lngLat },
    enter: defaultEnter('marker', keyframeId),
  };
}

export function createLabel(lngLat: LngLat, keyframeId: string): LabelElement {
  return {
    id: newId(),
    type: 'label',
    style: { color: '#2d3436', size: 16 },
    data: { lngLat, text: 'Label' },
    enter: defaultEnter('label', keyframeId),
  };
}

export function createArcRoute(a: LngLat, b: LngLat, keyframeId: string): RouteElement {
  return {
    id: newId(),
    type: 'route',
    style: { color: '#0984e3', width: 3 },
    data: { mode: 'arc', waypoints: [a, b], geometry: greatCircleArc(a, b) },
    enter: defaultEnter('route', keyframeId),
  };
}

export function createRoadRoute(waypoints: LngLat[], geometry: LineString, keyframeId: string): RouteElement {
  return {
    id: newId(),
    type: 'route',
    style: { color: '#0984e3', width: 3 },
    data: { mode: 'road', waypoints, geometry },
    enter: defaultEnter('route', keyframeId),
  };
}

export function createRegion(candidate: RegionCandidate, keyframeId: string): RegionElement {
  return {
    id: newId(),
    type: 'region',
    style: { color: '#6c5ce7', width: 2.5 },
    data: { query: candidate.displayName, osmId: candidate.osmId, geometry: candidate.geometry },
    enter: defaultEnter('region', keyframeId),
  };
}
