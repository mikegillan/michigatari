import type { MultiPolygon, Polygon } from 'geojson';

export const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

export interface RegionCandidate {
  displayName: string;
  osmId: number;
  geometry: Polygon | MultiPolygon;
}

interface NominatimRow {
  display_name: string;
  osm_id: number;
  geojson?: { type: string };
}

export async function searchRegions(query: string): Promise<RegionCandidate[]> {
  const params = new URLSearchParams({ q: query, format: 'jsonv2', polygon_geojson: '1', limit: '5' });
  const res = await fetch(`${NOMINATIM_BASE_URL}/search?${params}`);
  if (!res.ok) throw new Error(`Region search failed (${res.status}).`);
  const rows = (await res.json()) as NominatimRow[];
  return rows
    .filter((r) => r.geojson && (r.geojson.type === 'Polygon' || r.geojson.type === 'MultiPolygon'))
    .map((r) => ({
      displayName: r.display_name,
      osmId: r.osm_id,
      geometry: r.geojson as unknown as Polygon | MultiPolygon,
    }));
}
