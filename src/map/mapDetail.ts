import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { MapDetail } from '../engine/types';

// Classification is by OpenMapTiles-schema source-layer names, which all
// bundled styles (Liberty, Bright, Positron) share. Unknown layers are left
// untouched, so an exotic style simply ignores the detail settings.
type DetailCategory = 'placeLabel' | 'poiLabel' | 'road' | 'boundary' | 'other';

function classifyLayer(layer: LayerSpecification): DetailCategory {
  if (layer.id.startsWith('el-')) return 'other'; // our element layers
  const sl = 'source-layer' in layer ? layer['source-layer'] : undefined;
  if (sl === 'place') return 'placeLabel';
  if (sl === 'poi') return 'poiLabel';
  if (sl === 'transportation' || sl === 'transportation_name') return 'road';
  if (sl === 'boundary') return 'boundary';
  return 'other';
}

const MINOR_PLACE_CLASSES = ['town', 'village', 'suburb', 'hamlet', 'quarter', 'neighbourhood', 'isolated_dwelling', 'island'];
const MAJOR_PLACE_CLASSES = ['continent', 'country', 'state', 'province', 'city'];

// A negated match — ["match", x, [classes], false, true] — is an exclusion
// list: the layer shows everything NOT listed (the bundled styles' catch-all
// `label_other`: suburbs, hamlets, islands). If majors are excluded, what the
// layer actually shows is minor. Recurses for nesting inside ["all", ...].
// ponytail: only this negation shape is handled; add legacy ["!in", ...] if a
// style using it ever ships.
function excludesMajors(filter: unknown): boolean {
  if (!Array.isArray(filter)) return false;
  if (filter[0] === 'match' && filter[3] === false && filter[4] === true) {
    const listed = JSON.stringify(filter[2] ?? []);
    return MAJOR_PLACE_CLASSES.some((c) => listed.includes(`"${c}"`));
  }
  return filter.some(excludesMajors);
}

// ponytail: styles split place labels into per-class layers, so instead of
// rewriting layer filters (fragile across legacy/expression syntaxes) we grep
// the filter JSON for class names and toggle whole layers. A layer mixing
// major+minor classes stays visible — degrade by showing more, never less.
function placeLevel(layer: LayerSpecification): 'major' | 'minor' {
  const raw = 'filter' in layer ? layer.filter : undefined;
  if (raw === undefined) return 'major'; // unfiltered place layer: keep
  if (excludesMajors(raw)) return 'minor';
  const filter = JSON.stringify(raw);
  const mentionsMajor = MAJOR_PLACE_CLASSES.some((c) => filter.includes(`"${c}"`));
  const mentionsMinor = MINOR_PLACE_CLASSES.some((c) => filter.includes(`"${c}"`));
  return mentionsMinor && !mentionsMajor ? 'minor' : 'major';
}

/** Pure decision: should this layer show under the given detail settings? null = not ours to manage. */
export function detailVisibility(layer: LayerSpecification, detail: MapDetail): 'show' | 'hide' | null {
  switch (classifyLayer(layer)) {
    case 'placeLabel': {
      const level = detail.placeLabels ?? 'all';
      if (level === 'all') return 'show';
      if (level === 'none') return 'hide';
      return placeLevel(layer) === 'major' ? 'show' : 'hide';
    }
    case 'poiLabel':
      return (detail.poiLabels ?? true) ? 'show' : 'hide';
    case 'road':
      return (detail.roads ?? true) ? 'show' : 'hide';
    case 'boundary':
      return (detail.boundaries ?? true) ? 'show' : 'hide';
    case 'other':
      return null;
  }
}

// Original visibility of layers we've hidden, so "show" only ever restores our
// own changes and never un-hides layers the style author shipped hidden.
const hiddenOriginals = new WeakMap<MapLibreMap, Map<string, 'visible' | 'none'>>();

/** Idempotent; call after style load and whenever settings.mapDetail changes. */
export function applyMapDetail(map: MapLibreMap, detail: MapDetail | undefined): void {
  let originals = hiddenOriginals.get(map);
  if (!originals) {
    originals = new Map();
    hiddenOriginals.set(map, originals);
  }
  for (const layer of map.getStyle().layers) {
    const decision = detailVisibility(layer, detail ?? {});
    if (decision === 'hide') {
      if (!originals.has(layer.id)) {
        const raw = 'layout' in layer ? layer.layout?.visibility : undefined;
        originals.set(layer.id, raw === 'none' ? 'none' : 'visible');
      }
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    } else if (decision === 'show' && originals.has(layer.id)) {
      map.setLayoutProperty(layer.id, 'visibility', originals.get(layer.id)!);
      originals.delete(layer.id);
    }
  }
}
