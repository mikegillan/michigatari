import { afterEach, expect, it, vi } from 'vitest';
import { NOMINATIM_BASE_URL, searchRegions } from './nominatim';

afterEach(() => vi.unstubAllGlobals());

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

it('queries nominatim with polygon output and maps candidates', async () => {
  const fetchMock = vi.fn(async () =>
    ok([
      { display_name: 'Hokkaido, Japan', osm_id: 3795658, osm_type: 'relation', geojson: { type: 'MultiPolygon' as const, coordinates: [] as Array<number[][][]> } },
      { display_name: 'Hokkaido Station', osm_id: 1, geojson: { type: 'Point', coordinates: [0, 0] } },
      { display_name: 'No geometry', osm_id: 2 },
    ]),
  );
  vi.stubGlobal('fetch', fetchMock);
  const results = await searchRegions('Hokkaido');
  const url = String((fetchMock.mock.calls as unknown as Array<[string | Request]>)[0][0]);
  expect(url.startsWith(`${NOMINATIM_BASE_URL}/search?`)).toBe(true);
  expect(url).toContain('polygon_geojson=1');
  expect(url).toContain('polygon_threshold=0.005');
  expect(url).toContain('q=Hokkaido');
  // point results and missing geometry are filtered out
  expect(results).toEqual([
    { displayName: 'Hokkaido, Japan', osmId: 3795658, osmType: 'relation', geometry: { type: 'MultiPolygon', coordinates: [] as Array<number[][][]> } },
  ]);
});

it('throws a readable error on HTTP failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 }) as Response));
  await expect(searchRegions('x')).rejects.toThrow(/503/);
});
