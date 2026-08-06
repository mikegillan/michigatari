import { expect, it } from 'vitest';
import type { LayerSpecification } from 'maplibre-gl';
import { detailVisibility } from './mapDetail';

// Minimal layers mirroring the OpenMapTiles schema the bundled styles use.
const city: LayerSpecification = {
  id: 'label_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
  filter: ['all', ['==', 'class', 'city']],
} as LayerSpecification;
const village: LayerSpecification = {
  id: 'label_village', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
  filter: ['all', ['in', 'class', 'village', 'hamlet']],
} as LayerSpecification;
const poi: LayerSpecification = {
  id: 'poi_z14', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi',
} as LayerSpecification;
const road: LayerSpecification = {
  id: 'road_major', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
} as LayerSpecification;
const boundary: LayerSpecification = {
  id: 'admin_country', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary',
} as LayerSpecification;
const water: LayerSpecification = {
  id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
} as LayerSpecification;
const element: LayerSpecification = {
  id: 'el-abc123', type: 'circle', source: 'el-abc123',
} as LayerSpecification;

// Empty detail must change nothing visible: old projects keep today's look.
it('defaults show everything and never touch non-basemap layers', () => {
  for (const layer of [city, village, poi, road, boundary]) {
    expect(detailVisibility(layer, {})).toBe('show');
  }
  expect(detailVisibility(water, {})).toBe(null);
  expect(detailVisibility(element, {})).toBe(null);
});

// 'major' exists so creators can declutter without losing orientation cities.
it('major place level keeps cities, hides villages', () => {
  expect(detailVisibility(city, { placeLabels: 'major' })).toBe('show');
  expect(detailVisibility(village, { placeLabels: 'major' })).toBe('hide');
});

it('none hides all place labels', () => {
  expect(detailVisibility(city, { placeLabels: 'none' })).toBe('hide');
  expect(detailVisibility(village, { placeLabels: 'none' })).toBe('hide');
});

// Mixed-class layers must degrade toward showing more, never less.
it('a layer mixing major and minor classes stays visible at major level', () => {
  const mixed = {
    ...city, id: 'label_places',
    filter: ['all', ['in', 'class', 'city', 'town']],
  } as LayerSpecification;
  expect(detailVisibility(mixed, { placeLabels: 'major' })).toBe('show');
});

// All bundled styles have a `label_other` layer whose filter is an EXCLUSION
// list (class NOT IN [city, country, ...]) — i.e. suburbs/hamlets/islands.
// Grepping it for class names sees "city" and wrongly keeps it at major level.
it('a negated-match layer excluding major classes is minor', () => {
  const labelOther = {
    ...city, id: 'label_other',
    filter: ['match', ['get', 'class'], ['city', 'continent', 'country', 'state', 'town', 'village'], false, true],
  } as LayerSpecification;
  expect(detailVisibility(labelOther, { placeLabels: 'major' })).toBe('hide');
  expect(detailVisibility(labelOther, { placeLabels: 'all' })).toBe('show');
});

it('poi/roads/boundaries toggle independently', () => {
  expect(detailVisibility(poi, { poiLabels: false })).toBe('hide');
  expect(detailVisibility(road, { roads: false })).toBe('hide');
  expect(detailVisibility(boundary, { boundaries: false })).toBe('hide');
  expect(detailVisibility(road, { poiLabels: false, boundaries: false })).toBe('show');
});
