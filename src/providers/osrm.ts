import type { LineString } from 'geojson';
import type { LngLat } from '../engine/types';

export const OSRM_BASE_URL = 'https://router.project-osrm.org';

export async function roadRoute(waypoints: LngLat[]): Promise<LineString> {
  if (waypoints.length < 2) throw new Error('A road route needs at least two waypoints.');
  const coords = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const res = await fetch(`${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`);
  if (!res.ok) throw new Error(`Routing failed (${res.status}).`);
  const data = (await res.json()) as { code: string; routes?: Array<{ geometry: LineString }> };
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No road route found between those points.');
  return data.routes[0].geometry;
}
