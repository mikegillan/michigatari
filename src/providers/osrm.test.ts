import { afterEach, expect, it, vi } from 'vitest';
import { OSRM_BASE_URL, roadRoute } from './osrm';

afterEach(() => vi.unstubAllGlobals());

it('requests a driving route and returns the geometry', async () => {
  const geometry = { type: 'LineString' as const, coordinates: [[135.5, 34.69], [139.77, 35.68]] };
  const fetchMock = vi.fn(async () =>
    ({ ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ geometry }] }) }) as Response,
  );
  vi.stubGlobal('fetch', fetchMock);
  const result = await roadRoute([[135.5, 34.69], [139.77, 35.68]]);
  const url = String((fetchMock.mock.calls as unknown as Array<[string | Request]>)[0][0]);
  expect(url.startsWith(`${OSRM_BASE_URL}/route/v1/driving/135.5,34.69;139.77,35.68`)).toBe(true);
  expect(url).toContain('geometries=geojson');
  expect(result).toEqual(geometry);
});

it('rejects fewer than two waypoints without fetching', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await expect(roadRoute([[0, 0]])).rejects.toThrow(/two waypoints/i);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('throws when OSRM finds no route', async () => {
  vi.stubGlobal('fetch', vi.fn(async () =>
    ({ ok: true, status: 200, json: async () => ({ code: 'NoRoute' }) }) as Response,
  ));
  await expect(roadRoute([[0, 0], [1, 1]])).rejects.toThrow(/no road route/i);
});

it('throws a readable error on HTTP failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as Response));
  await expect(roadRoute([[0, 0], [1, 1]])).rejects.toThrow(/502/);
});
