import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Project } from '../engine/types';
import type { SceneState } from '../engine/scene';
import { sliceByProgress, traceRing } from '../engine/geometry';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function collection(geometry: Geometry | null, properties: Record<string, unknown> = {}): FeatureCollection {
  return geometry
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties, geometry }] }
    : EMPTY;
}

export function ensureElementLayers(map: MapLibreMap, project: Project): void {
  for (const el of project.elements) {
    const id = `el-${el.id}`;
    if (map.getSource(id)) continue;
    map.addSource(id, { type: 'geojson', data: EMPTY });
    const color = String(el.style.color ?? '#d63031');
    switch (el.type) {
      case 'marker':
        map.addLayer({
          id, type: 'circle', source: id,
          paint: {
            'circle-color': color, 'circle-radius': 8, 'circle-opacity': 0,
            'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0,
          },
        });
        break;
      case 'label':
        map.addLayer({
          id, type: 'symbol', source: id,
          layout: {
            'text-field': ['get', 'text'],
            'text-size': Number(el.style.size ?? 16),
            // hosted by OpenFreeMap (the default styleUrl); the MapLibre default stack 404s there
            'text-font': ['Noto Sans Regular'],
          },
          paint: { 'text-color': color, 'text-opacity': 0, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
        });
        break;
      case 'route':
        map.addLayer({
          id, type: 'line', source: id,
          paint: { 'line-color': color, 'line-width': Number(el.style.width ?? 3) },
        });
        break;
      case 'region':
        map.addSource(`${id}-fill`, { type: 'geojson', data: collection(el.data.geometry) });
        map.addLayer({
          id: `${id}-fill`, type: 'fill', source: `${id}-fill`,
          paint: { 'fill-color': color, 'fill-opacity': 0 },
        });
        map.addLayer({
          id, type: 'line', source: id,
          paint: { 'line-color': color, 'line-width': Number(el.style.width ?? 2.5) },
        });
        break;
    }
  }
}

export function applyScene(map: MapLibreMap, project: Project, scene: SceneState): void {
  map.jumpTo({
    center: scene.camera.center,
    zoom: scene.camera.zoom,
    bearing: scene.camera.bearing,
    pitch: scene.camera.pitch,
  });

  for (const el of project.elements) {
    const state = scene.elements[el.id];
    const id = `el-${el.id}`;
    const source = map.getSource(id) as GeoJSONSource | undefined;
    if (!source || !state) continue;

    switch (el.type) {
      case 'marker':
        source.setData(state.visible ? collection({ type: 'Point', coordinates: el.data.lngLat }) : EMPTY);
        map.setPaintProperty(id, 'circle-opacity', state.opacity);
        map.setPaintProperty(id, 'circle-stroke-opacity', state.opacity);
        map.setPaintProperty(id, 'circle-radius', 8 * Math.max(0, state.scale));
        break;
      case 'label':
        source.setData(
          state.visible
            ? collection({ type: 'Point', coordinates: el.data.lngLat }, { text: el.data.text })
            : EMPTY,
        );
        map.setPaintProperty(id, 'text-opacity', state.opacity);
        break;
      case 'route':
        source.setData(state.visible ? collection(sliceByProgress(el.data.geometry, state.progress)) : EMPTY);
        map.setPaintProperty(id, 'line-opacity', state.opacity);
        break;
      case 'region': {
        // ponytail: traceRing recomputed per frame — memoize per element if
        // profiling ever shows it matters.
        source.setData(state.visible ? collection(sliceByProgress(traceRing(el.data.geometry), state.progress)) : EMPTY);
        map.setPaintProperty(id, 'line-opacity', state.opacity);
        // fill fades in over the last quarter of the trace (spec §3.4 "fill fade after the trace")
        const fillT = Math.max(0, (state.progress - 0.75) / 0.25);
        map.setPaintProperty(`${id}-fill`, 'fill-opacity', state.visible ? 0.2 * fillT * state.opacity : 0);
        break;
      }
    }
  }
}
