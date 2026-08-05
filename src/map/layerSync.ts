import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { Project } from '../engine/types';
import { elementFontStack } from '../config';
import { createElementLayers } from './applyScene';

export function planLayerSync(
  project: Project,
  existingElementIds: string[],
): { create: string[]; remove: string[]; restyle: string[] } {
  const wanted = new Set(project.elements.map((e) => e.id));
  const existing = new Set(existingElementIds);
  return {
    create: project.elements.filter((e) => !existing.has(e.id)).map((e) => e.id),
    remove: existingElementIds.filter((id) => !wanted.has(id)),
    restyle: project.elements.filter((e) => existing.has(e.id)).map((e) => e.id),
  };
}

// Structural sync: create/remove element layers and re-apply style-driven
// properties. applyScene/applyElements only touch animated properties; the
// editor calls this after every project mutation.
export function syncElementLayers(map: MapLibreMap, project: Project): void {
  const existingIds = map
    .getStyle()
    .layers.filter((l) => l.id.startsWith('el-') && !l.id.endsWith('-fill'))
    .map((l) => l.id.slice(3));
  const plan = planLayerSync(project, existingIds);
  const byId = new Map(project.elements.map((e) => [e.id, e]));

  for (const id of plan.remove) {
    for (const layerId of [`el-${id}`, `el-${id}-fill`]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(layerId)) map.removeSource(layerId);
    }
  }
  const fontStack = elementFontStack(project.settings.styleUrl);
  for (const id of plan.create) {
    createElementLayers(map, byId.get(id)!, fontStack);
  }
  for (const id of plan.restyle) {
    const el = byId.get(id)!;
    const layerId = `el-${id}`;
    const color = String(el.style.color ?? '#d63031');
    switch (el.type) {
      case 'marker':
        map.setPaintProperty(layerId, 'circle-color', color);
        break;
      case 'label':
        map.setPaintProperty(layerId, 'text-color', color);
        map.setLayoutProperty(layerId, 'text-size', Number(el.style.size ?? 16));
        break;
      case 'route':
        map.setPaintProperty(layerId, 'line-color', color);
        map.setPaintProperty(layerId, 'line-width', Number(el.style.width ?? 3));
        break;
      case 'region': {
        map.setPaintProperty(layerId, 'line-color', color);
        map.setPaintProperty(layerId, 'line-width', Number(el.style.width ?? 2.5));
        map.setPaintProperty(`${layerId}-fill`, 'fill-color', color);
        const fill: FeatureCollection = {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry: el.data.geometry }],
        };
        (map.getSource(`${layerId}-fill`) as GeoJSONSource | undefined)?.setData(fill);
        break;
      }
    }
  }
}
