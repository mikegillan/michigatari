# Plan 2b: Element Authoring & Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author animated map elements — markers, labels, routes (flight arcs and road-snapped), and region outlines — with per-element styling and animation bindings, completing spec §3.4/§5/§7 except video export.

**Architecture:** Element creation flows through a `placing` mode in the store: the elements panel arms a mode, the map's click handler places, and `syncElementLayers` (already subscribed to project changes in MapView) renders the result — no new render paths. Fetched geometry (OSRM roads, Nominatim regions) is baked into the project at author time per spec §5; provider modules are single-function fetch wrappers behind exported base-URL constants (the monetization seam). The right aside becomes tabs: Elements (default) | Settings — resolving the panel-sharing question from Plan 2a's final review.

**Tech Stack:** Existing stack (no new dependencies). Mantine Tabs/ColorInput/Switch, dnd-kit not needed here.

## Global Constraints

- `src/engine/` stays pure (no DOM/maplibre/react, no `Date.now()`, no `Math.random()`). Editor and provider code may use all of these.
- Network at author time only: routes/regions bake fetched geometry into `element.data.geometry`; playback/export never call providers (spec §5).
- Provider base URLs are exported consts: `NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org'`, `OSRM_BASE_URL = 'https://router.project-osrm.org'`. No API keys.
- Element adds require ≥1 keyframe (bindings default to the FIRST keyframe); add buttons disabled with a tooltip hint otherwise. Placing is disabled entirely in preview mode.
- All element edits go through `updateElement(id, update: (el: Element) => Element)` — narrow on `el.type` inside the updater; never cast.
- Per-type enter animations (spec §3.4): marker `pop`|`fade`, label `fade`, route `draw`, region `draw`. Exit is optional, always `fade`.
- `ensureElementLayers` is DELETED in Task 1 (decision from 2a's final review): `syncElementLayers` is the single layer-creation path; Plan 3's export map will call it once, then `applyScene` per frame.
- TypeScript strict; `npm test` (67 now) and `npm run build` stay green. Commit messages: plain, **no AI attribution, no Co-Authored-By**.
- Stage only your own files with explicit `git add` paths.

---

### Task 1: Groundwork — cleanup, newId, aside tabs

**Files:**
- Modify: `src/map/applyScene.ts` (delete `ensureElementLayers`), `src/map/layerSync.integration.test.ts` (strengthen 2 tests), `src/editor/store.ts` (`newId`), `src/App.tsx`
- Create: `src/editor/AsidePanel.tsx`, `src/editor/ElementsPanel.tsx` (placeholder)
- Test: `src/editor/store.test.ts` (add newId test)

**Interfaces:**
- Consumes: existing store, `SettingsPanel`.
- Produces: `newId(): string` exported from `store.ts` (crypto.randomUUID with non-secure-context fallback); `AsidePanel` (tabs: Elements | Settings); `ElementsPanel` placeholder that Task 3 fills. `ensureElementLayers` no longer exists anywhere.

- [ ] **Step 1: Delete `ensureElementLayers`**

In `src/map/applyScene.ts`, delete the `ensureElementLayers` function and its `Project` import if now unused. It has zero callers (verify: `grep -rn ensureElementLayers src/` → only the definition). `createElementLayers`, `applyElements`, `applyScene` stay exactly as they are.

- [ ] **Step 2: Strengthen the two non-discriminating fake-map tests**

In `src/map/layerSync.integration.test.ts` (adapt names to the file's existing style):
- **Region fill restyle:** after the initial `syncElementLayers`, build a modified project whose region element has a *different* geometry (e.g. shift all coordinates by +1), sync again, and assert the fill source's LAST `setData` call carries the NEW geometry (not the creation-time one).
- **Invisible → EMPTY:** first call `applyElements` with the element visible (source data set to a non-empty collection), then call again with `visible: false`, and assert the source received a LATER `setData` call whose argument is the empty FeatureCollection — assert on call order/count, not just final value.

Run: `npm test` → these must still pass (they now discriminate omitted calls).

- [ ] **Step 3: Add `newId` with fallback**

In `src/editor/store.ts`, above the store:

```ts
// crypto.randomUUID requires a secure context; plain-HTTP LAN hosting gets the fallback.
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
```

Replace the `crypto.randomUUID()` call in `addKeyframe` with `newId()`.

Add to `src/editor/store.test.ts`:

```ts
it('newId produces unique ids', () => {
  const ids = new Set(Array.from({ length: 100 }, () => newId()));
  expect(ids.size).toBe(100);
});
```

(import `newId` alongside the existing imports.)

- [ ] **Step 4: Aside tabs**

`src/editor/ElementsPanel.tsx` (placeholder; Task 3 replaces the body):

```tsx
import { Stack, Text } from '@mantine/core';

export function ElementsPanel() {
  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">Elements</Text>
      <Text size="xs" c="dimmed">Marker, label, route, and region tools arrive in the next tasks.</Text>
    </Stack>
  );
}
```

`src/editor/AsidePanel.tsx`:

```tsx
import { Tabs } from '@mantine/core';
import { ElementsPanel } from './ElementsPanel';
import { SettingsPanel } from './SettingsPanel';

export function AsidePanel() {
  return (
    <Tabs defaultValue="elements" keepMounted={false}>
      <Tabs.List grow>
        <Tabs.Tab value="elements">Elements</Tabs.Tab>
        <Tabs.Tab value="settings">Settings</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="elements" pt="sm"><ElementsPanel /></Tabs.Panel>
      <Tabs.Panel value="settings" pt="sm"><SettingsPanel /></Tabs.Panel>
    </Tabs>
  );
}
```

`src/App.tsx`: replace the `aside={<SettingsPanel />}` slot with `aside={<AsidePanel />}` (swap the import accordingly).

- [ ] **Step 5: Verify and commit**

Run: `npm test` (68: 67 − 0 + 1 new; the two strengthened tests replace themselves) → PASS. `npm run build` + `npm run lint` clean. Dev server: aside shows Elements/Settings tabs; Settings tab contains the old panel.

```bash
git add src/map/applyScene.ts src/map/layerSync.integration.test.ts src/editor/store.ts src/editor/store.test.ts src/editor/AsidePanel.tsx src/editor/ElementsPanel.tsx src/App.tsx
git commit -m "Consolidate layer creation, add newId fallback and aside tabs"
```

---

### Task 2: Providers — Nominatim and OSRM

**Files:**
- Create: `src/providers/nominatim.ts`, `src/providers/osrm.ts`
- Test: `src/providers/nominatim.test.ts`, `src/providers/osrm.test.ts`

**Interfaces:**
- Consumes: `LngLat` from engine types; geojson types.
- Produces (Tasks 6–7 rely on verbatim):
  - `NOMINATIM_BASE_URL`, `RegionCandidate { displayName: string; osmId: number; geometry: Polygon | MultiPolygon }`, `searchRegions(query: string): Promise<RegionCandidate[]>`
  - `OSRM_BASE_URL`, `roadRoute(waypoints: LngLat[]): Promise<LineString>` — throws on <2 waypoints, non-OK HTTP, or no route

- [ ] **Step 1: Write the failing tests**

`src/providers/nominatim.test.ts`:

```ts
import { afterEach, expect, it, vi } from 'vitest';
import { NOMINATIM_BASE_URL, searchRegions } from './nominatim';

afterEach(() => vi.unstubAllGlobals());

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

it('queries nominatim with polygon output and maps candidates', async () => {
  const fetchMock = vi.fn(async () =>
    ok([
      { display_name: 'Hokkaido, Japan', osm_id: 3795658, geojson: { type: 'MultiPolygon', coordinates: [] } },
      { display_name: 'Hokkaido Station', osm_id: 1, geojson: { type: 'Point', coordinates: [0, 0] } },
      { display_name: 'No geometry', osm_id: 2 },
    ]),
  );
  vi.stubGlobal('fetch', fetchMock);
  const results = await searchRegions('Hokkaido');
  const url = String(fetchMock.mock.calls[0][0]);
  expect(url.startsWith(`${NOMINATIM_BASE_URL}/search?`)).toBe(true);
  expect(url).toContain('polygon_geojson=1');
  expect(url).toContain('q=Hokkaido');
  // point results and missing geometry are filtered out
  expect(results).toEqual([
    { displayName: 'Hokkaido, Japan', osmId: 3795658, geometry: { type: 'MultiPolygon', coordinates: [] } },
  ]);
});

it('throws a readable error on HTTP failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 }) as Response));
  await expect(searchRegions('x')).rejects.toThrow(/503/);
});
```

`src/providers/osrm.test.ts`:

```ts
import { afterEach, expect, it, vi } from 'vitest';
import { OSRM_BASE_URL, roadRoute } from './osrm';

afterEach(() => vi.unstubAllGlobals());

it('requests a driving route and returns the geometry', async () => {
  const geometry = { type: 'LineString', coordinates: [[135.5, 34.69], [139.77, 35.68]] };
  const fetchMock = vi.fn(async () =>
    ({ ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ geometry }] }) }) as Response,
  );
  vi.stubGlobal('fetch', fetchMock);
  const result = await roadRoute([[135.5, 34.69], [139.77, 35.68]]);
  const url = String(fetchMock.mock.calls[0][0]);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → FAIL, cannot resolve `./nominatim` / `./osrm`.

- [ ] **Step 3: Implement**

`src/providers/nominatim.ts`:

```ts
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
```

`src/providers/osrm.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass; commit**

Run: `npm test` → PASS (73). `npm run build` clean.

```bash
git add src/providers/
git commit -m "Add Nominatim region search and OSRM routing providers"
```

---

### Task 3: Placing infrastructure — markers and labels

**Files:**
- Modify: `src/editor/store.ts` (placing state), `src/editor/MapView.tsx` (click handler + cursor), `src/editor/ElementsPanel.tsx` (add buttons + placing hint)
- Create: `src/editor/elementDefaults.ts`
- Test: `src/editor/elementDefaults.test.ts`, `src/editor/store.test.ts` (placing actions)

**Interfaces:**
- Consumes: `newId`, store, engine types, `greatCircleArc` (Task 6 uses defaults too).
- Produces:
  - Store additions: `placing: PlacingState` where `type PlacingState = { kind: 'marker' } | { kind: 'label' } | { kind: 'route'; mode: 'arc' | 'road'; waypoints: LngLat[] } | null`; actions `setPlacing(placing: PlacingState): void`, `appendPlacingWaypoint(lngLat: LngLat): void` (no-op unless placing a route).
  - `elementDefaults.ts`: `defaultEnter(type: Element['type'], keyframeId: string): AnimationBinding<EnterAnimation>` (marker pop 400ms; label fade 400ms; route/region draw 1500ms; all delay 0, easeInOut), `createMarker(lngLat: LngLat, keyframeId: string): MarkerElement` (style `{ color: '#d63031', size: 8 }`), `createLabel(lngLat: LngLat, keyframeId: string): LabelElement` (style `{ color: '#2d3436', size: 16 }`, text `'Label'`), `createArcRoute(a: LngLat, b: LngLat, keyframeId: string): RouteElement` (mode 'arc', baked `greatCircleArc(a, b)`, style `{ color: '#0984e3', width: 3 }`), `createRoadRoute(waypoints: LngLat[], geometry: LineString, keyframeId: string): RouteElement`, `createRegion(candidate: RegionCandidate, keyframeId: string): RegionElement` (style `{ color: '#6c5ce7', width: 2.5 }`, data `{ query: candidate.displayName, osmId: candidate.osmId, geometry: candidate.geometry }`).
  - MapView behavior: map `click` places per the mode; cursor is crosshair while placing; placing ignored in preview mode.

- [ ] **Step 1: Write the failing tests**

`src/editor/elementDefaults.test.ts`:

```ts
import { expect, it } from 'vitest';
import { createArcRoute, createLabel, createMarker, defaultEnter } from './elementDefaults';

it('defaultEnter picks the per-type animation and duration', () => {
  expect(defaultEnter('marker', 'kf')).toMatchObject({ animation: 'pop', durationMs: 400, delayMs: 0, easing: 'easeInOut', keyframeId: 'kf' });
  expect(defaultEnter('label', 'kf')).toMatchObject({ animation: 'fade', durationMs: 400 });
  expect(defaultEnter('route', 'kf')).toMatchObject({ animation: 'draw', durationMs: 1500 });
  expect(defaultEnter('region', 'kf')).toMatchObject({ animation: 'draw', durationMs: 1500 });
});

it('creators produce well-formed elements with unique ids', () => {
  const m = createMarker([135, 35], 'kf');
  const l = createLabel([135, 35], 'kf');
  expect(m.type).toBe('marker');
  expect(m.data.lngLat).toEqual([135, 35]);
  expect(l.data.text).toBe('Label');
  expect(m.id).not.toBe(l.id);
});

it('arc routes bake a great-circle geometry at creation', () => {
  const r = createArcRoute([139.77, 35.68], [135.5, 34.69], 'kf');
  expect(r.data.mode).toBe('arc');
  expect(r.data.waypoints).toEqual([[139.77, 35.68], [135.5, 34.69]]);
  expect(r.data.geometry.type).toBe('LineString');
  expect(r.data.geometry.coordinates.length).toBeGreaterThan(2);
});
```

Add to `src/editor/store.test.ts`:

```ts
it('placing state arms, appends route waypoints, and clears', () => {
  const s = useEditorStore.getState();
  s.setPlacing({ kind: 'route', mode: 'road', waypoints: [] });
  useEditorStore.getState().appendPlacingWaypoint([1, 2]);
  useEditorStore.getState().appendPlacingWaypoint([3, 4]);
  let placing = useEditorStore.getState().placing;
  expect(placing).toEqual({ kind: 'route', mode: 'road', waypoints: [[1, 2], [3, 4]] });
  useEditorStore.getState().appendPlacingWaypoint([5, 6]);
  useEditorStore.getState().setPlacing(null);
  expect(useEditorStore.getState().placing).toBeNull();
});

it('appendPlacingWaypoint is a no-op outside route placing', () => {
  useEditorStore.getState().setPlacing({ kind: 'marker' });
  useEditorStore.getState().appendPlacingWaypoint([1, 2]);
  expect(useEditorStore.getState().placing).toEqual({ kind: 'marker' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → FAIL (missing module / missing actions).

- [ ] **Step 3: Implement store additions**

In `src/editor/store.ts`: add the `PlacingState` type (exported), `placing: null` initial state, and:

```ts
setPlacing: (placing) => set({ placing }),
appendPlacingWaypoint: (lngLat) =>
  set((s) =>
    s.placing?.kind === 'route'
      ? { placing: { ...s.placing, waypoints: [...s.placing.waypoints, lngLat] } }
      : s,
  ),
```

Also: `loadProject`/`newProject` reset `placing: null`; `setMode` clears placing when entering preview (`set({ mode, ...(mode === 'preview' ? { placing: null } : {}) })`).

- [ ] **Step 4: Implement elementDefaults**

`src/editor/elementDefaults.ts` per the Interfaces block above — one `defaultEnter` switch plus five small creator functions, each `{ id: newId(), type, style: <defaults>, data: <args>, enter: defaultEnter(type, keyframeId) }`. Import `greatCircleArc` from `../engine/geometry`, `RegionCandidate` from `../providers/nominatim`.

- [ ] **Step 5: MapView click handler + cursor**

In the map-creation effect of `src/editor/MapView.tsx`, after the error handler, register:

```ts
map.on('click', (e) => {
  const { placing, mode: m, project, addElement, setPlacing, appendPlacingWaypoint } = useEditorStore.getState();
  if (!placing || m === 'preview') return;
  const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
  const firstKf = project.keyframes[0]?.id;
  if (!firstKf) return; // add buttons are disabled without keyframes; belt and suspenders
  if (placing.kind === 'marker') {
    addElement(createMarker(lngLat, firstKf));
    setPlacing(null);
  } else if (placing.kind === 'label') {
    addElement(createLabel(lngLat, firstKf));
    setPlacing(null);
  } else if (placing.kind === 'route' && placing.mode === 'arc') {
    if (placing.waypoints.length === 0) {
      appendPlacingWaypoint(lngLat);
    } else {
      addElement(createArcRoute(placing.waypoints[0], lngLat, firstKf));
      setPlacing(null);
    }
  } else if (placing.kind === 'route' && placing.mode === 'road') {
    appendPlacingWaypoint(lngLat); // Finish button in the panel completes it (Task 6)
  }
});
```

(imports: `createArcRoute, createLabel, createMarker` from `./elementDefaults`.)

Add a cursor effect in the component:

```ts
const placing = useEditorStore((s) => s.placing);
useEffect(() => {
  const canvas = mapRef.current?.getCanvas();
  if (canvas) canvas.style.cursor = placing ? 'crosshair' : '';
}, [placing]);
```

- [ ] **Step 6: ElementsPanel add buttons**

Replace `src/editor/ElementsPanel.tsx`:

```tsx
import { Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useEditorStore, type PlacingState } from './store';

type ArmSpec = { label: string; make: () => NonNullable<PlacingState> };

const ADD_BUTTONS: ArmSpec[] = [
  { label: 'Marker', make: () => ({ kind: 'marker' }) },
  { label: 'Label', make: () => ({ kind: 'label' }) },
  { label: 'Arc route', make: () => ({ kind: 'route', mode: 'arc', waypoints: [] }) },
  { label: 'Road route', make: () => ({ kind: 'route', mode: 'road', waypoints: [] }) },
];

export function ElementsPanel() {
  const hasKeyframes = useEditorStore((s) => s.project.keyframes.length > 0);
  const mode = useEditorStore((s) => s.mode);
  const placing = useEditorStore((s) => s.placing);
  const setPlacing = useEditorStore((s) => s.setPlacing);
  const disabled = !hasKeyframes || mode === 'preview';

  const isArmed = (spec: ArmSpec): boolean => {
    if (!placing) return false;
    const target = spec.make();
    if (placing.kind !== target.kind) return false;
    return placing.kind !== 'route' || target.kind !== 'route' || placing.mode === target.mode;
  };

  return (
    <Stack gap="sm">
      <Tooltip label="Capture a keyframe first — element animations bind to keyframes" disabled={hasKeyframes}>
        <Group gap={6}>
          {ADD_BUTTONS.map((b) => (
            <Button
              key={b.label}
              size="compact-xs"
              variant={isArmed(b) ? 'filled' : 'default'}
              disabled={disabled}
              onClick={() => setPlacing(b.make())}
            >
              {b.label}
            </Button>
          ))}
        </Group>
      </Tooltip>
      {placing && (
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {placing.kind === 'route' && placing.mode === 'arc'
              ? placing.waypoints.length === 0 ? 'Click the start point on the map.' : 'Click the end point.'
              : placing.kind === 'route'
                ? `Click waypoints on the map (${placing.waypoints.length} so far).`
                : 'Click the map to place it.'}
          </Text>
          <Button size="compact-xs" variant="subtle" onClick={() => setPlacing(null)}>Cancel</Button>
        </Group>
      )}
    </Stack>
  );
}
```

(The arc-vs-road variant matching via `JSON.stringify` compares armed button state including waypoints — acceptable: armed buttons show filled only before the first click. Road's Finish button arrives in Task 6; element rows in Task 4.)

- [ ] **Step 7: Verify and commit**

Run: `npm test` → PASS. Build + lint clean. Dev: with a keyframe captured, Marker/Label place on click with crosshair cursor; markers/labels appear on the map immediately (the existing project-change subscription syncs layers); arc route completes on the second click and draws its curve; buttons disabled with tooltip when no keyframes.

```bash
git add src/editor/ src/App.tsx
git commit -m "Add element placing modes with marker, label, and arc creation"
```

---

### Task 4: Element rows — style, text, delete

**Files:**
- Modify: `src/editor/ElementsPanel.tsx`
- Create: `src/editor/ElementRow.tsx`

**Interfaces:**
- Consumes: store (`updateElement` updater signature, `deleteElement`), engine `Element` union.
- Produces: `ElementRow({ element }: { element: Element })` — per-type controls: ColorInput bound to `style.color`; NumberInput bound to `style.size` (marker/label) or `style.width` (route/region); TextInput for label `data.text`; type/name line; delete button. Task 5 appends the animation editor inside this row.

- [ ] **Step 1: Implement ElementRow**

`src/editor/ElementRow.tsx`:

```tsx
import { ActionIcon, Card, ColorInput, Group, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { useEditorStore } from './store';
import type { Element } from '../engine/types';

function rowTitle(el: Element): string {
  switch (el.type) {
    case 'marker': return 'Marker';
    case 'label': return 'Label';
    case 'route': return el.data.mode === 'arc' ? 'Route (arc)' : 'Route (road)';
    case 'region': return el.data.query;
  }
}

export function ElementRow({ element }: { element: Element }) {
  const updateElement = useEditorStore((s) => s.updateElement);
  const deleteElement = useEditorStore((s) => s.deleteElement);
  const sizeKey = element.type === 'marker' || element.type === 'label' ? 'size' : 'width';
  const sizeDefault = element.type === 'marker' ? 8 : element.type === 'label' ? 16 : element.type === 'route' ? 3 : 2.5;

  return (
    <Card withBorder padding="xs">
      <Stack gap={6}>
        <Group justify="space-between" gap="xs">
          <Text size="sm" fw={600} lineClamp={1}>{rowTitle(element)}</Text>
          <ActionIcon size="sm" variant="subtle" color="red" aria-label="Delete element"
            onClick={() => deleteElement(element.id)}>✕</ActionIcon>
        </Group>
        {element.type === 'label' && (
          <TextInput
            size="xs" label="Text" value={element.data.text}
            onChange={(e) => {
              const text = e.currentTarget.value;
              updateElement(element.id, (el) =>
                el.type === 'label' ? { ...el, data: { ...el.data, text } } : el,
              );
            }}
          />
        )}
        <Group gap="xs" grow>
          <ColorInput
            size="xs" label="Color" value={String(element.style.color ?? '#d63031')} format="hex"
            onChange={(color) => updateElement(element.id, (el) => ({ ...el, style: { ...el.style, color } }))}
          />
          <NumberInput
            size="xs" label={sizeKey === 'size' ? 'Size' : 'Width'} min={1} step={0.5}
            value={Number(element.style[sizeKey] ?? sizeDefault)}
            onChange={(v) =>
              updateElement(element.id, (el) => ({ ...el, style: { ...el.style, [sizeKey]: Number(v) || sizeDefault } }))
            }
          />
        </Group>
      </Stack>
    </Card>
  );
}
```

- [ ] **Step 2: List rows in the panel**

In `src/editor/ElementsPanel.tsx`: subscribe `const elements = useEditorStore((s) => s.project.elements);` and render below the placing hint:

```tsx
{elements.map((el) => <ElementRow key={el.id} element={el} />)}
{elements.length === 0 && <Text size="xs" c="dimmed">No elements yet.</Text>}
```

(Wrap the panel's outer `Stack` content in `style={{ overflowY: 'auto' }}` if not already scrollable.)

- [ ] **Step 3: Verify and commit**

Run: `npm test` → PASS (no new tests — UI wiring over the tested updater; layer restyle is covered by the fake-map suite). Build + lint clean. Dev: place a marker and a label; change color/size — the map updates live (restyle path); edit label text — map text updates; delete removes the layer from the map.

```bash
git add src/editor/ElementRow.tsx src/editor/ElementsPanel.tsx
git commit -m "Add element rows with style, text, and delete controls"
```

---

### Task 5: Animation binding editor

**Files:**
- Create: `src/editor/BindingEditor.tsx`
- Modify: `src/editor/ElementRow.tsx` (render it)

**Interfaces:**
- Consumes: store, `EASINGS` keys, engine types (`AnimationBinding`, `EnterAnimation`).
- Produces: `BindingEditor({ element }: { element: Element })` — Enter section: keyframe Select (labeled "Keyframe N"), animation Select (marker: pop|fade; single-option types render static text), delay/duration NumberInputs, easing Select. Exit section: Switch "Fade out at…"; when on, keyframe/delay/duration/easing fields; toggling off removes `exit`.

- [ ] **Step 1: Implement**

`src/editor/BindingEditor.tsx`:

```tsx
import { Group, NumberInput, Select, Stack, Switch, Text } from '@mantine/core';
import { useEditorStore } from './store';
import { EASINGS } from '../engine/easing';
import type { AnimationBinding, EasingName, Element, EnterAnimation, ExitAnimation } from '../engine/types';

const EASING_OPTIONS = Object.keys(EASINGS) as EasingName[];

const ENTER_CHOICES: Record<Element['type'], EnterAnimation[]> = {
  marker: ['pop', 'fade'],
  label: ['fade'],
  route: ['draw'],
  region: ['draw'],
};

export function BindingEditor({ element }: { element: Element }) {
  const keyframes = useEditorStore((s) => s.project.keyframes);
  const updateElement = useEditorStore((s) => s.updateElement);
  const kfOptions = keyframes.map((k, i) => ({ value: k.id, label: `Keyframe ${i + 1}` }));
  const choices = ENTER_CHOICES[element.type];

  const patchEnter = (patch: Partial<AnimationBinding<EnterAnimation>>) =>
    updateElement(element.id, (el) => ({ ...el, enter: { ...el.enter, ...patch } }));
  const patchExit = (patch: Partial<AnimationBinding<ExitAnimation>>) =>
    updateElement(element.id, (el) => (el.exit ? { ...el, exit: { ...el.exit, ...patch } } : el));

  const toggleExit = (on: boolean) => {
    const lastKf = keyframes[keyframes.length - 1]?.id;
    if (on && lastKf === undefined) return; // all keyframes deleted: nothing to bind to
    updateElement(element.id, (el) =>
      on
        ? {
            ...el,
            exit: {
              keyframeId: lastKf!,
              animation: 'fade',
              delayMs: 0,
              durationMs: 300,
              easing: 'easeInOut',
            },
          }
        : { ...el, exit: undefined },
    );
  };

  return (
    <Stack gap={6}>
      <Text size="xs" fw={600}>Enter</Text>
      <Group gap="xs" grow>
        <Select
          size="xs" label="At keyframe" data={kfOptions} allowDeselect={false}
          value={element.enter.keyframeId}
          onChange={(v) => v && patchEnter({ keyframeId: v })}
        />
        {choices.length > 1 ? (
          <Select
            size="xs" label="Animation" data={choices} allowDeselect={false}
            value={element.enter.animation}
            onChange={(v) => v && patchEnter({ animation: v as EnterAnimation })}
          />
        ) : (
          <Stack gap={2}><Text size="xs" c="dimmed">Animation</Text><Text size="xs">{choices[0]}</Text></Stack>
        )}
      </Group>
      <Group gap="xs" grow>
        <NumberInput size="xs" label="Delay (ms)" min={0} step={100} value={element.enter.delayMs}
          onChange={(v) => patchEnter({ delayMs: Number(v) || 0 })} />
        <NumberInput size="xs" label="Duration (ms)" min={0} step={100} value={element.enter.durationMs}
          onChange={(v) => patchEnter({ durationMs: Number(v) || 0 })} />
        <Select size="xs" label="Easing" data={EASING_OPTIONS} allowDeselect={false}
          value={element.enter.easing} onChange={(v) => v && patchEnter({ easing: v as EasingName })} />
      </Group>
      <Switch
        size="xs" label="Fade out"
        checked={element.exit !== undefined}
        onChange={(e) => toggleExit(e.currentTarget.checked)}
      />
      {element.exit && (
        <Group gap="xs" grow>
          <Select size="xs" label="At keyframe" data={kfOptions} allowDeselect={false}
            value={element.exit.keyframeId} onChange={(v) => v && patchExit({ keyframeId: v })} />
          <NumberInput size="xs" label="Delay (ms)" min={0} step={100} value={element.exit.delayMs}
            onChange={(v) => patchExit({ delayMs: Number(v) || 0 })} />
          <NumberInput size="xs" label="Duration (ms)" min={0} step={100} value={element.exit.durationMs}
            onChange={(v) => patchExit({ durationMs: Number(v) || 0 })} />
        </Group>
      )}
    </Stack>
  );
}
```

In `src/editor/ElementRow.tsx`: render `<BindingEditor element={element} />` at the bottom of the card's Stack.

- [ ] **Step 2: Verify and commit**

Run: `npm test` → PASS. Build + lint clean. Dev: marker's animation switchable pop↔fade; enter keyframe/delay/duration/easing edits persist; enabling Fade out adds exit fields; scrubbing the preview shows enter/exit honoring the bindings (engine already handles it).

```bash
git add src/editor/BindingEditor.tsx src/editor/ElementRow.tsx
git commit -m "Add enter and exit animation binding editor"
```

---

### Task 6: Road routes — fetch, finish, refresh

**Files:**
- Modify: `src/editor/ElementsPanel.tsx` (Finish button for road placing), `src/editor/ElementRow.tsx` (refresh geometry for road routes)

**Interfaces:**
- Consumes: `roadRoute`, `createRoadRoute`, store placing state.
- Produces: road-route creation (waypoints → Finish → OSRM fetch → baked element) with loading state and error notifications; a per-row "Refresh geometry" action for road routes re-running OSRM over the stored waypoints (spec §5).

- [ ] **Step 1: Finish button in the placing hint**

In `src/editor/ElementsPanel.tsx`, inside the placing hint Group, when `placing.kind === 'route' && placing.mode === 'road'`:

```tsx
<Button
  size="compact-xs"
  loading={fetching}
  disabled={placing.waypoints.length < 2}
  onClick={finishRoad}
>
  Finish ({placing.waypoints.length})
</Button>
```

with, in the component:

```tsx
const [fetching, setFetching] = useState(false);
const finishRoad = async () => {
  const p = useEditorStore.getState().placing;
  const firstKf = useEditorStore.getState().project.keyframes[0]?.id;
  if (!p || p.kind !== 'route' || p.mode !== 'road' || !firstKf) return;
  setFetching(true);
  try {
    const geometry = await roadRoute(p.waypoints);
    useEditorStore.getState().addElement(createRoadRoute(p.waypoints, geometry, firstKf));
    useEditorStore.getState().setPlacing(null);
  } catch (err) {
    notifications.show({ color: 'red', title: 'Routing failed', message: String((err as Error).message) });
    // keep placing state so the user can retry or cancel
  } finally {
    setFetching(false);
  }
};
```

(imports: `useState`, `notifications`, `roadRoute`, `createRoadRoute`.)

- [ ] **Step 2: Refresh geometry on road-route rows**

In `src/editor/ElementRow.tsx`, next to the delete icon, for `element.type === 'route' && element.data.mode === 'road'`:

```tsx
<ActionIcon size="sm" variant="subtle" aria-label="Refresh road geometry" loading={refreshing}
  onClick={refreshRoad}>↻</ActionIcon>
```

with:

```tsx
const [refreshing, setRefreshing] = useState(false);
const refreshRoad = async () => {
  if (element.type !== 'route') return;
  setRefreshing(true);
  try {
    const geometry = await roadRoute(element.data.waypoints);
    updateElement(element.id, (el) =>
      el.type === 'route' ? { ...el, data: { ...el.data, geometry } } : el,
    );
  } catch (err) {
    notifications.show({ color: 'red', title: 'Routing failed', message: String((err as Error).message) });
  } finally {
    setRefreshing(false);
  }
};
```

- [ ] **Step 3: Verify and commit**

Run: `npm test` → PASS. Build + lint clean. Dev (needs network): Road route → click 3+ waypoints along real roads → Finish → a road-following line appears and draws in preview; refresh re-fetches; killing the network and finishing shows the red notification and keeps the waypoints.

```bash
git add src/editor/ElementsPanel.tsx src/editor/ElementRow.tsx
git commit -m "Add road route creation and refresh via OSRM"
```

---

### Task 7: Regions — search, bake, refresh

**Files:**
- Create: `src/editor/RegionSearch.tsx`
- Modify: `src/editor/ElementsPanel.tsx` (mount it), `src/editor/ElementRow.tsx` (region refresh)

**Interfaces:**
- Consumes: `searchRegions`, `createRegion`, Mantine `useDebouncedValue`.
- Produces: debounced (400ms) region name search with a candidate list; clicking a candidate bakes the boundary into a region element; per-row refresh re-fetching by stored query and matching `osmId` (falling back to the first candidate).

- [ ] **Step 1: Implement RegionSearch**

`src/editor/RegionSearch.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Button, Loader, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { searchRegions, type RegionCandidate } from '../providers/nominatim';
import { createRegion } from './elementDefaults';
import { useEditorStore } from './store';

export function RegionSearch() {
  const hasKeyframes = useEditorStore((s) => s.project.keyframes.length > 0);
  const addElement = useEditorStore((s) => s.addElement);
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 400);
  const [results, setResults] = useState<RegionCandidate[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults([]);
      return;
    }
    let stale = false;
    setSearching(true);
    searchRegions(debounced)
      .then((r) => { if (!stale) setResults(r); })
      .catch((err) => {
        if (!stale) notifications.show({ color: 'red', title: 'Region search failed', message: String((err as Error).message) });
      })
      .finally(() => { if (!stale) setSearching(false); });
    return () => { stale = true; };
  }, [debounced]);

  const add = (candidate: RegionCandidate) => {
    const firstKf = useEditorStore.getState().project.keyframes[0]?.id;
    if (!firstKf) return;
    addElement(createRegion(candidate, firstKf));
    setQuery('');
    setResults([]);
  };

  return (
    <Stack gap={4}>
      <TextInput
        size="xs" label="Add region outline" placeholder="Search: Hokkaido, Osaka Prefecture…"
        value={query} onChange={(e) => setQuery(e.currentTarget.value)}
        disabled={!hasKeyframes}
        rightSection={searching ? <Loader size={12} /> : null}
      />
      {results.map((r) => (
        <Button key={`${r.osmId}`} size="compact-xs" variant="default" justify="flex-start" fullWidth onClick={() => add(r)}>
          <Text size="xs" truncate>{r.displayName}</Text>
        </Button>
      ))}
    </Stack>
  );
}
```

Mount `<RegionSearch />` in `ElementsPanel` between the add buttons and the element rows.

- [ ] **Step 2: Region refresh on rows**

In `src/editor/ElementRow.tsx`, for `element.type === 'region'`, add a refresh ActionIcon (same pattern as road refresh) running:

```ts
const candidates = await searchRegions(element.data.query);
const match = candidates.find((c) => c.osmId === element.data.osmId) ?? candidates[0];
if (!match) throw new Error('No boundary found for this region anymore.');
updateElement(element.id, (el) =>
  el.type === 'region'
    ? { ...el, data: { ...el.data, osmId: match.osmId, geometry: match.geometry } }
    : el,
);
```

- [ ] **Step 3: Verify and commit**

Run: `npm test` → PASS. Build + lint clean. Dev (needs network): search "Hokkaido" → candidates appear after the debounce → clicking one draws the boundary; in preview the outline traces clockwise then the fill fades in (engine + applier already do this); refresh works; searching gibberish shows no candidates; network failure shows the notification.

```bash
git add src/editor/RegionSearch.tsx src/editor/ElementsPanel.tsx src/editor/ElementRow.tsx
git commit -m "Add region search, baking, and refresh via Nominatim"
```

---

### Task 8: Polish and README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Full visual pass** (controller-performed in the browser): every element type end-to-end — place, style, bind, preview, save/reload — plus the disabled states (no keyframes, preview mode). Fix only breakages found.

- [ ] **Step 2: README status update**

Replace the Status section body with:

```markdown
The editor is feature-complete for authoring: keyframe camera animation plus
animated markers, labels, flight-arc and road routes, and region outlines,
with per-element styling and animation timing. Video export is in progress.
```

- [ ] **Step 3: Verify and commit**

`npm test` + `npm run build` + `npm run lint` clean.

```bash
git add README.md
git commit -m "Update README status for element authoring"
```

---

## Out of Scope for Plan 2b

- Video export (Plan 3: hidden map at reference size + `pixelRatio`, WebCodecs, muxing, export UI).
- Waypoint editing on existing routes; marker/label repositioning by drag (delete + re-place covers v1).
- Layer metadata tagging to replace the `el-` id heuristic (deferred until author-supplied ids exist).
