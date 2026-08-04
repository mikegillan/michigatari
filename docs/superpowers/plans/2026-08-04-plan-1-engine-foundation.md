# Plan 1: Engine & Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the app and build the complete pure-function animation engine, proven by a visible demo animation playing on a live map.

**Architecture:** Two halves per the spec (`docs/superpowers/specs/2026-08-04-map-animation-generator-design.md`): a pure-function engine (`src/engine/` — no DOM, no MapLibre imports) computing `(project, timeMs) → SceneState`, and a thin map layer (`src/map/`) that applies a SceneState to a MapLibre map. This plan delivers the engine fully tested plus a hardcoded demo project animating end-to-end. Editor UI is Plan 2; video export is Plan 3.

**Tech Stack:** Vite + React 18 + TypeScript (strict), MapLibre GL JS, @turf/turf, vitest.

## Global Constraints

- License: AGPL-3.0 (`LICENSE` file; `"license": "AGPL-3.0-only"` in package.json).
- No API keys anywhere. Basemap style URL: `https://tiles.openfreemap.org/styles/liberty`.
- Everything under `src/engine/` is pure functions: no imports from `maplibre-gl`, `react`, or DOM APIs; no `Date.now()`, no `Math.random()`. Same inputs → same outputs, always.
- TypeScript strict mode (Vite template default — do not loosen).
- Commit messages: plain, descriptive, **no AI attribution, no Co-Authored-By lines**.
- Node 20+ assumed.
- Run all tests with `npm test` (vitest).

---

### Task 1: Scaffold the project

**Files:**
- Create: entire Vite react-ts scaffold at repo root, `LICENSE`, `README.md`
- Modify: `package.json` (license field, test script), `src/App.tsx`, `src/index.css`
- Delete: `src/App.css`, `src/assets/` (template cruft)

**Interfaces:**
- Consumes: nothing (repo contains only `docs/` and `.gitignore`).
- Produces: running dev server with a full-screen MapLibre map; `npm test` runs vitest.

- [ ] **Step 1: Scaffold Vite into the existing repo**

```bash
cd /Users/mgillan/map-generator
npm create vite@latest scaffold -- --template react-ts
cp -R scaffold/. .
rm -rf scaffold
echo ".DS_Store" >> .gitignore
npm install
npm install maplibre-gl @turf/turf
npm install -D vitest
curl -o LICENSE https://www.gnu.org/licenses/agpl-3.0.txt
```

- [ ] **Step 2: Set package.json fields**

In `package.json`: set `"license": "AGPL-3.0-only"` and add to scripts: `"test": "vitest run"`.

- [ ] **Step 3: Replace template app with a full-screen map**

`src/index.css` (replace entirely):

```css
html, body, #root { height: 100%; margin: 0; }
```

`src/App.tsx` (replace entirely; delete `src/App.css` and `src/assets/`):

```tsx
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [137.0, 36.5],
      zoom: 4,
    });
    return () => map.remove();
  }, []);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
```

`README.md`:

```markdown
# Map Animation Generator

Create animated map sequences for travel vlogs: capture keyframes on an
interactive map, add animated markers, labels, routes, and region outlines,
and export the result as video. Runs entirely in the browser.

Built with [MapLibre GL JS](https://maplibre.org/) and
[OpenFreeMap](https://openfreemap.org/) tiles. Developed with Claude.

License: AGPL-3.0
```

- [ ] **Step 4: Verify**

Run: `npm run dev` → open the URL → full-screen map of Japan renders.
Run: `npm test` → vitest runs, "No test files found" is acceptable here.
Run: `npm run build` → succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Scaffold Vite app with full-screen MapLibre map"
```

---

### Task 2: Core types and project (de)serialization

**Files:**
- Create: `src/engine/types.ts`, `src/engine/project.ts`
- Test: `src/engine/project.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - `types.ts`: `LngLat` (`[number, number]` lng,lat), `CameraPose { center: LngLat; zoom: number; bearing: number; pitch: number }`, `EasingName`, `Transition { durationMs; easing }`, `Keyframe { id; camera; holdMs; transition }`, `Settings { resolution: '1080p'|'1440p'|'4k'; fps: 30|60; aspect: '16:9'|'9:16'; styleUrl: string }`, `AnimationBinding<A> { keyframeId; animation: A; delayMs; durationMs; easing }`, `Element` (union of `MarkerElement | LabelElement | RouteElement | RegionElement`), `Project { version: 1; settings; keyframes: Keyframe[]; elements: Element[] }`
  - `project.ts`: `parseProject(json: string): Project` (throws `ProjectFormatError`), `serializeProject(project: Project): string`

- [ ] **Step 1: Write the types**

`src/engine/types.ts`:

```ts
import type { LineString, MultiPolygon, Polygon } from 'geojson';

export type LngLat = [number, number]; // [lng, lat]

export interface CameraPose {
  center: LngLat;
  zoom: number;
  bearing: number;
  pitch: number;
}

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface Transition {
  durationMs: number;
  easing: EasingName;
}

export interface Keyframe {
  id: string;
  camera: CameraPose;
  holdMs: number;
  transition: Transition; // flight to the NEXT keyframe; ignored on the last
}

export type Resolution = '1080p' | '1440p' | '4k';
export type Aspect = '16:9' | '9:16';

export interface Settings {
  resolution: Resolution;
  fps: 30 | 60;
  aspect: Aspect;
  styleUrl: string;
}

export type EnterAnimation = 'pop' | 'fade' | 'draw';
export type ExitAnimation = 'fade';

export interface AnimationBinding<A extends string> {
  keyframeId: string;
  animation: A;
  delayMs: number;
  durationMs: number;
  easing: EasingName;
}

export interface MarkerData { lngLat: LngLat }
export interface LabelData { lngLat: LngLat; text: string }
export interface RouteData {
  mode: 'arc' | 'road';
  waypoints: LngLat[];
  geometry: LineString; // baked at author time
}
export interface RegionData {
  query: string;
  osmId?: number;
  geometry: Polygon | MultiPolygon; // baked at author time
}

// Which enter animations make sense per type (pop/fade for points, draw for
// lines) is enforced by the editor UI, not the type system.
interface ElementBase<T extends string, D> {
  id: string;
  type: T;
  style: Record<string, string | number>;
  data: D;
  enter: AnimationBinding<EnterAnimation>;
  exit?: AnimationBinding<ExitAnimation>;
}

export type MarkerElement = ElementBase<'marker', MarkerData>;
export type LabelElement = ElementBase<'label', LabelData>;
export type RouteElement = ElementBase<'route', RouteData>;
export type RegionElement = ElementBase<'region', RegionData>;
export type Element = MarkerElement | LabelElement | RouteElement | RegionElement;

export interface Project {
  version: 1;
  settings: Settings;
  keyframes: Keyframe[];
  elements: Element[];
}
```

- [ ] **Step 2: Write the failing test**

`src/engine/project.test.ts`:

```ts
import { expect, it } from 'vitest';
import { ProjectFormatError, parseProject, serializeProject } from './project';
import type { Project } from './types';

const minimal: Project = {
  version: 1,
  settings: {
    resolution: '1080p',
    fps: 30,
    aspect: '16:9',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  },
  keyframes: [],
  elements: [],
};

it('round-trips a project through serialize/parse', () => {
  expect(parseProject(serializeProject(minimal))).toEqual(minimal);
});

it('rejects unknown versions with a message naming the version', () => {
  const v2 = JSON.stringify({ ...minimal, version: 2 });
  expect(() => parseProject(v2)).toThrow(/version/i);
});

it('rejects non-JSON input', () => {
  expect(() => parseProject('not json')).toThrow(ProjectFormatError);
});

it('rejects JSON that is not a project', () => {
  expect(() => parseProject('{"version":1}')).toThrow(ProjectFormatError);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./project`.

- [ ] **Step 4: Implement**

`src/engine/project.ts`:

```ts
import type { Project } from './types';

export class ProjectFormatError extends Error {}

// ponytail: shallow shape check, not full schema validation — the only
// files we load are ones we wrote. Tighten if imports from elsewhere appear.
export function parseProject(json: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ProjectFormatError('Not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new ProjectFormatError('Not a project file.');
  }
  const p = raw as Partial<Project>;
  if (p.version !== 1) {
    throw new ProjectFormatError(
      `Unsupported project version: ${String(p.version)}. This app supports version 1.`,
    );
  }
  if (!p.settings || !Array.isArray(p.keyframes) || !Array.isArray(p.elements)) {
    throw new ProjectFormatError('Project file is missing settings, keyframes, or elements.');
  }
  return p as Project;
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine/
git commit -m "Add project types and JSON (de)serialization with version check"
```

---

### Task 3: Easing presets

**Files:**
- Create: `src/engine/easing.ts`
- Test: `src/engine/easing.test.ts`

**Interfaces:**
- Consumes: `EasingName` from `./types`.
- Produces: `EASINGS: Record<EasingName, (t: number) => number>`, `ease(name: EasingName, t: number): number` (clamps t to [0,1] before applying).

- [ ] **Step 1: Write the failing test**

`src/engine/easing.test.ts`:

```ts
import { expect, it } from 'vitest';
import { EASINGS, ease } from './easing';
import type { EasingName } from './types';

const names = Object.keys(EASINGS) as EasingName[];

it('every easing maps 0→0 and 1→1', () => {
  for (const name of names) {
    expect(EASINGS[name](0)).toBeCloseTo(0);
    expect(EASINGS[name](1)).toBeCloseTo(1);
  }
});

it('every easing is monotonically non-decreasing', () => {
  for (const name of names) {
    let prev = EASINGS[name](0);
    for (let i = 1; i <= 100; i++) {
      const v = EASINGS[name](i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  }
});

it('easeInOut is symmetric about the midpoint', () => {
  expect(EASINGS.easeInOut(0.5)).toBeCloseTo(0.5);
  expect(EASINGS.easeInOut(0.25) + EASINGS.easeInOut(0.75)).toBeCloseTo(1);
});

it('ease clamps out-of-range t', () => {
  expect(ease('linear', -1)).toBe(0);
  expect(ease('linear', 2)).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./easing`.

- [ ] **Step 3: Implement**

`src/engine/easing.ts`:

```ts
import type { EasingName } from './types';

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - (1 - t) ** 3,
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

export function ease(name: EasingName, t: number): number {
  return EASINGS[name](Math.min(1, Math.max(0, t)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/easing.ts src/engine/easing.test.ts
git commit -m "Add cubic easing presets"
```

---

### Task 4: Timeline math

**Files:**
- Create: `src/engine/timeline.ts`
- Test: `src/engine/timeline.test.ts`

**Interfaces:**
- Consumes: `Project`, `EasingName` from `./types`.
- Produces:
  - `HoldSegment { kind: 'hold'; keyframeIndex: number; startMs: number; endMs: number }`
  - `TransitionSegment { kind: 'transition'; fromIndex: number; toIndex: number; startMs: number; endMs: number; easing: EasingName }`
  - `Segment = HoldSegment | TransitionSegment`
  - `Timeline { totalMs: number; segments: Segment[]; arrivalMs: Map<string, number> }` — `arrivalMs` maps keyframe id → the ms its hold starts (element animations anchor here per spec §6)
  - `computeTimeline(project: Project): Timeline`
  - `segmentAt(timeline: Timeline, timeMs: number): Segment` — clamps out-of-range times

- [ ] **Step 1: Write the failing test**

`src/engine/timeline.test.ts`:

```ts
import { expect, it } from 'vitest';
import { computeTimeline, segmentAt } from './timeline';
import type { Keyframe, Project } from './types';

function kf(id: string, holdMs: number, transitionMs: number): Keyframe {
  return {
    id,
    camera: { center: [0, 0], zoom: 5, bearing: 0, pitch: 0 },
    holdMs,
    transition: { durationMs: transitionMs, easing: 'linear' },
  };
}

function proj(keyframes: Keyframe[]): Project {
  return {
    version: 1,
    settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: '' },
    keyframes,
    elements: [],
  };
}

// hold(kf1)=2000 → transition=3000 → hold(kf2)=1000; kf2's own transition ignored
const two = proj([kf('kf1', 2000, 3000), kf('kf2', 1000, 9999)]);

it('lays out hold → transition → hold and sums total', () => {
  const tl = computeTimeline(two);
  expect(tl.totalMs).toBe(6000);
  expect(tl.segments).toEqual([
    { kind: 'hold', keyframeIndex: 0, startMs: 0, endMs: 2000 },
    { kind: 'transition', fromIndex: 0, toIndex: 1, startMs: 2000, endMs: 5000, easing: 'linear' },
    { kind: 'hold', keyframeIndex: 1, startMs: 5000, endMs: 6000 },
  ]);
});

it('records arrival times (hold start) per keyframe id', () => {
  const tl = computeTimeline(two);
  expect(tl.arrivalMs.get('kf1')).toBe(0);
  expect(tl.arrivalMs.get('kf2')).toBe(5000);
});

it('ignores the last keyframe transition entirely', () => {
  const tl = computeTimeline(proj([kf('only', 1500, 9999)]));
  expect(tl.totalMs).toBe(1500);
  expect(tl.segments).toHaveLength(1);
});

it('segmentAt finds the right segment and clamps the edges', () => {
  const tl = computeTimeline(two);
  expect(segmentAt(tl, 0).kind).toBe('hold');
  expect(segmentAt(tl, 1999).kind).toBe('hold');
  expect(segmentAt(tl, 2000).kind).toBe('transition');
  expect(segmentAt(tl, 4999).kind).toBe('transition');
  expect(segmentAt(tl, 5000)).toMatchObject({ kind: 'hold', keyframeIndex: 1 });
  expect(segmentAt(tl, 6000)).toMatchObject({ kind: 'hold', keyframeIndex: 1 }); // t == total
  expect(segmentAt(tl, -50).kind).toBe('hold');
  expect(segmentAt(tl, 99999)).toMatchObject({ kind: 'hold', keyframeIndex: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./timeline`.

- [ ] **Step 3: Implement**

`src/engine/timeline.ts`:

```ts
import type { EasingName, Project } from './types';

export interface HoldSegment {
  kind: 'hold';
  keyframeIndex: number;
  startMs: number;
  endMs: number;
}

export interface TransitionSegment {
  kind: 'transition';
  fromIndex: number;
  toIndex: number;
  startMs: number;
  endMs: number;
  easing: EasingName;
}

export type Segment = HoldSegment | TransitionSegment;

export interface Timeline {
  totalMs: number;
  segments: Segment[];
  arrivalMs: Map<string, number>; // keyframe id → ms its hold starts
}

export function computeTimeline(project: Project): Timeline {
  const segments: Segment[] = [];
  const arrivalMs = new Map<string, number>();
  let cursor = 0;
  project.keyframes.forEach((keyframe, i) => {
    arrivalMs.set(keyframe.id, cursor);
    segments.push({ kind: 'hold', keyframeIndex: i, startMs: cursor, endMs: cursor + keyframe.holdMs });
    cursor += keyframe.holdMs;
    if (i < project.keyframes.length - 1) {
      segments.push({
        kind: 'transition',
        fromIndex: i,
        toIndex: i + 1,
        startMs: cursor,
        endMs: cursor + keyframe.transition.durationMs,
        easing: keyframe.transition.easing,
      });
      cursor += keyframe.transition.durationMs;
    }
  });
  return { totalMs: cursor, segments, arrivalMs };
}

export function segmentAt(timeline: Timeline, timeMs: number): Segment {
  const t = Math.min(Math.max(timeMs, 0), timeline.totalMs);
  // zero-duration segments (holdMs 0) never match t >= start && t < end, so
  // they are skipped — which is the behavior we want.
  const seg = timeline.segments.find((s) => t >= s.startMs && t < s.endMs);
  return seg ?? timeline.segments[timeline.segments.length - 1];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/timeline.ts src/engine/timeline.test.ts
git commit -m "Add derived timeline computation and segment lookup"
```

---

### Task 5: Viewport helper and camera interpolation

**Files:**
- Create: `src/engine/viewport.ts`, `src/engine/camera.ts`
- Test: `src/engine/viewport.test.ts`, `src/engine/camera.test.ts`

**Interfaces:**
- Consumes: `CameraPose`, `LngLat`, `Project`, `Settings` from `./types`; `ease` from `./easing`; `Timeline`, `segmentAt` from `./timeline`.
- Produces:
  - `viewport.ts`: `viewportForSettings(settings: Settings): { width: number; height: number }`
  - `camera.ts`: `interpolateCamera(from: CameraPose, to: CameraPose, t: number, viewport: { width: number; height: number }): CameraPose` (t is already eased, 0–1), `cameraAt(project: Project, timeline: Timeline, timeMs: number, viewport: { width: number; height: number }): CameraPose`

**Background for the implementer:** camera flights use the van Wijk–Nuij "smooth and efficient zooming and panning" path — the same math as MapLibre's `flyTo`, but reimplemented as a pure function of `t` so any instant is directly computable (needed for scrubbing and frame-exact export). The path zooms out, pans, and zooms back in, in one smooth curve. The nominal viewport comes from the project's export settings so preview and export follow identical paths. Reference: mapbox-gl-js `src/ui/camera.js` flyTo, and van Wijk & Nuij 2003.

- [ ] **Step 1: Write the failing viewport test**

`src/engine/viewport.test.ts`:

```ts
import { expect, it } from 'vitest';
import { viewportForSettings } from './viewport';
import type { Settings } from './types';

function s(resolution: Settings['resolution'], aspect: Settings['aspect']): Settings {
  return { resolution, aspect, fps: 30, styleUrl: '' };
}

it('maps resolution + aspect to pixel dimensions', () => {
  expect(viewportForSettings(s('1080p', '16:9'))).toEqual({ width: 1920, height: 1080 });
  expect(viewportForSettings(s('1440p', '16:9'))).toEqual({ width: 2560, height: 1440 });
  expect(viewportForSettings(s('4k', '16:9'))).toEqual({ width: 3840, height: 2160 });
  expect(viewportForSettings(s('4k', '9:16'))).toEqual({ width: 2160, height: 3840 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./viewport`.

- [ ] **Step 3: Implement viewport**

`src/engine/viewport.ts`:

```ts
import type { Settings } from './types';

const SHORT_SIDE: Record<Settings['resolution'], number> = {
  '1080p': 1080,
  '1440p': 1440,
  '4k': 2160,
};

export function viewportForSettings(settings: Settings): { width: number; height: number } {
  const short = SHORT_SIDE[settings.resolution];
  const long = Math.round((short * 16) / 9);
  return settings.aspect === '16:9' ? { width: long, height: short } : { width: short, height: long };
}
```

Run: `npm test` → viewport tests PASS.

- [ ] **Step 4: Write the failing camera test**

`src/engine/camera.test.ts`:

```ts
import { expect, it } from 'vitest';
import { cameraAt, interpolateCamera } from './camera';
import { computeTimeline } from './timeline';
import type { CameraPose, Project } from './types';

const VP = { width: 1920, height: 1080 };
const tokyo: CameraPose = { center: [139.77, 35.68], zoom: 10, bearing: 0, pitch: 0 };
const osaka: CameraPose = { center: [135.5, 34.69], zoom: 9, bearing: 40, pitch: 30 };

it('returns exact endpoints at t=0 and t=1', () => {
  expect(interpolateCamera(tokyo, osaka, 0, VP)).toEqual(tokyo);
  expect(interpolateCamera(tokyo, osaka, 1, VP)).toEqual(osaka);
});

it('takes the shortest angular path for bearing', () => {
  const a = { ...tokyo, bearing: 350 };
  const b = { ...tokyo, bearing: 10 };
  const mid = interpolateCamera(a, b, 0.5, VP);
  // midpoint of 350°→10° is 0° (through north), never 180°
  const norm = ((mid.bearing % 360) + 360) % 360;
  expect(Math.min(norm, 360 - norm)).toBeLessThan(1);
});

it('same center means a pure zoom with the center pinned', () => {
  const zoomedOut = { ...tokyo, zoom: 5 };
  const mid = interpolateCamera(tokyo, zoomedOut, 0.5, VP);
  expect(mid.center[0]).toBeCloseTo(tokyo.center[0], 5);
  expect(mid.center[1]).toBeCloseTo(tokyo.center[1], 5);
  expect(mid.zoom).toBeCloseTo(7.5);
});

it('zooms out below both endpoints mid-flight on a long move', () => {
  const mid = interpolateCamera(tokyo, osaka, 0.5, VP);
  expect(mid.zoom).toBeLessThan(Math.min(tokyo.zoom, osaka.zoom));
});

it('lerps pitch', () => {
  const mid = interpolateCamera(tokyo, osaka, 0.5, VP);
  expect(mid.pitch).toBeCloseTo(15);
});

function proj(): Project {
  return {
    version: 1,
    settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: '' },
    keyframes: [
      { id: 'a', camera: tokyo, holdMs: 1000, transition: { durationMs: 2000, easing: 'linear' } },
      { id: 'b', camera: osaka, holdMs: 1000, transition: { durationMs: 0, easing: 'linear' } },
    ],
    elements: [],
  };
}

it('cameraAt returns the keyframe pose during a hold', () => {
  const p = proj();
  const tl = computeTimeline(p);
  expect(cameraAt(p, tl, 500, VP)).toEqual(tokyo);
  expect(cameraAt(p, tl, 3500, VP)).toEqual(osaka);
});

it('cameraAt mid-transition matches interpolateCamera at the eased fraction', () => {
  const p = proj();
  const tl = computeTimeline(p);
  // linear easing, transition spans 1000–3000ms → t=0.5 at 2000ms
  expect(cameraAt(p, tl, 2000, VP)).toEqual(interpolateCamera(tokyo, osaka, 0.5, VP));
});

it('cameraAt throws on a project with no keyframes', () => {
  const p = { ...proj(), keyframes: [] };
  expect(() => cameraAt(p, computeTimeline(p), 0, VP)).toThrow(/no keyframes/i);
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./camera`.

- [ ] **Step 6: Implement camera**

`src/engine/camera.ts`:

```ts
import type { CameraPose, LngLat, Project } from './types';
import { ease } from './easing';
import { segmentAt, type Timeline } from './timeline';

// Web-mercator world pixels (world is 512 * 2^zoom px wide).
function project(lngLat: LngLat, zoom: number): { x: number; y: number } {
  const worldSize = 512 * 2 ** zoom;
  const [lng, lat] = lngLat;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * worldSize,
    y: ((1 - Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / Math.PI) / 2) * worldSize,
  };
}

function unproject(x: number, y: number, zoom: number): LngLat {
  const worldSize = 512 * 2 ** zoom;
  const lng = (x / worldSize) * 360 - 180;
  const n = Math.PI * (1 - (2 * y) / worldSize);
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return [lng, lat];
}

function shortestBearingDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// Flight "curviness" — 1.42 is the van Wijk & Nuij recommended value and
// MapLibre's default.
const RHO = 1.42;

/**
 * Camera pose at fraction t (0–1, ALREADY eased) along the van Wijk–Nuij
 * flight path. `viewport` is the nominal output size in px — pass
 * viewportForSettings(project.settings) so preview and export match.
 */
export function interpolateCamera(
  from: CameraPose,
  to: CameraPose,
  t: number,
  viewport: { width: number; height: number },
): CameraPose {
  if (t <= 0) return from;
  if (t >= 1) return to;

  const bearing = from.bearing + shortestBearingDelta(from.bearing, to.bearing) * t;
  const pitch = from.pitch + (to.pitch - from.pitch) * t;

  const p0 = project(from.center, from.zoom);
  const p1 = project(to.center, from.zoom);
  const u1 = Math.hypot(p1.x - p0.x, p1.y - p0.y); // ground distance, px at start zoom
  const w0 = Math.max(viewport.width, viewport.height); // visible span, px
  const w1 = w0 / 2 ** (to.zoom - from.zoom); // same span at end zoom
  const rho2 = RHO * RHO;

  let zoom: number;
  let un: number; // normalized ground progress 0–1

  if (u1 < 1e-6) {
    // No ground distance: pure zoom, center pinned.
    zoom = from.zoom + (to.zoom - from.zoom) * t;
    un = t;
  } else {
    // van Wijk & Nuij 2003, as implemented by mapbox/maplibre flyTo.
    const b = (i: 0 | 1) =>
      (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho2 * rho2 * u1 * u1) /
      (2 * (i ? w1 : w0) * rho2 * u1);
    const r = (i: 0 | 1) => {
      const bi = b(i);
      return Math.log(Math.sqrt(bi * bi + 1) - bi);
    };
    const r0 = r(0);
    const S = (r(1) - r0) / RHO; // total path length in flight-space
    const s = t * S;
    const w = Math.cosh(r0) / Math.cosh(r0 + RHO * s); // width factor: >1 means zoomed out
    const u = (w0 * (Math.cosh(r0) * Math.tanh(r0 + RHO * s) - Math.sinh(r0))) / rho2;
    zoom = from.zoom + Math.log2(1 / w);
    un = Math.min(1, Math.max(0, u / u1));
  }

  const cx = p0.x + (p1.x - p0.x) * un;
  const cy = p0.y + (p1.y - p0.y) * un;
  return { center: unproject(cx, cy, from.zoom), zoom, bearing, pitch };
}

export function cameraAt(
  proj: Project,
  timeline: Timeline,
  timeMs: number,
  viewport: { width: number; height: number },
): CameraPose {
  if (proj.keyframes.length === 0) throw new Error('Project has no keyframes.');
  const seg = segmentAt(timeline, timeMs);
  if (seg.kind === 'hold') return proj.keyframes[seg.keyframeIndex].camera;
  const t = (Math.min(timeMs, seg.endMs) - seg.startMs) / (seg.endMs - seg.startMs);
  return interpolateCamera(
    proj.keyframes[seg.fromIndex].camera,
    proj.keyframes[seg.toIndex].camera,
    ease(seg.easing, t),
    viewport,
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all camera + viewport tests).

- [ ] **Step 8: Commit**

```bash
git add src/engine/viewport.ts src/engine/viewport.test.ts src/engine/camera.ts src/engine/camera.test.ts
git commit -m "Add van Wijk-Nuij camera interpolation and viewport helper"
```

---

### Task 6: Element animation evaluators

**Files:**
- Create: `src/engine/elements.ts`
- Test: `src/engine/elements.test.ts`

**Interfaces:**
- Consumes: `Element`, `AnimationBinding` from `./types`; `ease` from `./easing`; `Timeline` from `./timeline`.
- Produces:
  - `ElementScene { visible: boolean; opacity: number; scale: number; progress: number }` — opacity 0–1 for fades; scale for pop entrances (1 otherwise); progress 0–1 for draw/trace entrances (1 once drawn)
  - `evaluateElement(element: Element, timeline: Timeline, timeMs: number): ElementScene`

**Timing rules (spec §6):** the animation window starts at `arrivalMs(keyframeId) + delayMs` and lasts `durationMs`; it may run past the hold into the next transition. Before the enter window: hidden. After it: fully shown. Exit (optional, always fade): fades 1→0 over its window, hidden after. Elements whose enter references a missing keyframe id are hidden (can happen mid-edit when a keyframe is deleted; the editor will clean these up in Plan 2).

- [ ] **Step 1: Write the failing test**

`src/engine/elements.test.ts`:

```ts
import { expect, it } from 'vitest';
import { evaluateElement } from './elements';
import { computeTimeline } from './timeline';
import type { AnimationBinding, EnterAnimation, ExitAnimation, MarkerElement, Project } from './types';

// timeline: kf1 hold 0–2000, transition 2000–5000, kf2 hold 5000–6000
const p: Project = {
  version: 1,
  settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: '' },
  keyframes: [
    { id: 'kf1', camera: { center: [0, 0], zoom: 5, bearing: 0, pitch: 0 }, holdMs: 2000, transition: { durationMs: 3000, easing: 'linear' } },
    { id: 'kf2', camera: { center: [10, 0], zoom: 5, bearing: 0, pitch: 0 }, holdMs: 1000, transition: { durationMs: 0, easing: 'linear' } },
  ],
  elements: [],
};
const tl = computeTimeline(p);

function marker(
  enter: AnimationBinding<EnterAnimation>,
  exit?: AnimationBinding<ExitAnimation>,
): MarkerElement {
  return { id: 'm1', type: 'marker', style: {}, data: { lngLat: [0, 0] }, enter, exit };
}

const popEnter: AnimationBinding<EnterAnimation> = {
  keyframeId: 'kf2', animation: 'pop', delayMs: 500, durationMs: 400, easing: 'linear',
};

it('is hidden before the enter window opens', () => {
  // kf2 arrival 5000 + delay 500 = window opens at 5500
  const s = evaluateElement(marker(popEnter), tl, 5499);
  expect(s.visible).toBe(false);
  expect(s.opacity).toBe(0);
});

it('animates inside the enter window', () => {
  const s = evaluateElement(marker(popEnter), tl, 5700); // t = 0.5
  expect(s.visible).toBe(true);
  expect(s.opacity).toBeGreaterThan(0);
  expect(s.scale).toBeGreaterThan(0);
});

it('pop starts at scale 0 and settles at exactly 1', () => {
  expect(evaluateElement(marker(popEnter), tl, 5500).scale).toBeCloseTo(0);
  expect(evaluateElement(marker(popEnter), tl, 5900).scale).toBe(1);
});

it('pop overshoots past 1 mid-animation', () => {
  // easeOutBack peaks around t≈0.7
  const s = evaluateElement(marker(popEnter), tl, 5780); // t = 0.7
  expect(s.scale).toBeGreaterThan(1);
});

it('is fully shown after the enter window with no exit', () => {
  const s = evaluateElement(marker(popEnter), tl, 999999);
  expect(s).toEqual({ visible: true, opacity: 1, scale: 1, progress: 1 });
});

it('draw entrance ramps progress 0→1', () => {
  const draw = marker({ keyframeId: 'kf1', animation: 'draw', delayMs: 0, durationMs: 1000, easing: 'linear' });
  expect(evaluateElement(draw, tl, 0).progress).toBeCloseTo(0);
  expect(evaluateElement(draw, tl, 500).progress).toBeCloseTo(0.5);
  expect(evaluateElement(draw, tl, 1000).progress).toBe(1);
});

it('a delayed animation can run past its hold into the transition', () => {
  // kf1 hold ends at 2000; delay 1500 + duration 1000 → window 1500–2500
  const late = marker({ keyframeId: 'kf1', animation: 'fade', delayMs: 1500, durationMs: 1000, easing: 'linear' });
  const s = evaluateElement(late, tl, 2250); // inside the transition, t = 0.75
  expect(s.opacity).toBeCloseTo(0.75);
});

it('exit fades out and then hides', () => {
  const exiting = marker(
    { keyframeId: 'kf1', animation: 'fade', delayMs: 0, durationMs: 100, easing: 'linear' },
    { keyframeId: 'kf2', animation: 'fade', delayMs: 0, durationMs: 300, easing: 'linear' },
  );
  expect(evaluateElement(exiting, tl, 5150).opacity).toBeCloseTo(0.5); // mid-fade
  expect(evaluateElement(exiting, tl, 5300).visible).toBe(false);
});

it('zero-duration enter shows instantly at its start time', () => {
  const instant = marker({ keyframeId: 'kf1', animation: 'fade', delayMs: 100, durationMs: 0, easing: 'linear' });
  expect(evaluateElement(instant, tl, 99).visible).toBe(false);
  expect(evaluateElement(instant, tl, 100)).toEqual({ visible: true, opacity: 1, scale: 1, progress: 1 });
});

it('hides elements whose enter keyframe no longer exists', () => {
  const dangling = marker({ keyframeId: 'gone', animation: 'fade', delayMs: 0, durationMs: 100, easing: 'linear' });
  expect(evaluateElement(dangling, tl, 1000).visible).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./elements`.

- [ ] **Step 3: Implement**

`src/engine/elements.ts`:

```ts
import type { AnimationBinding, Element } from './types';
import { ease } from './easing';
import type { Timeline } from './timeline';

export interface ElementScene {
  visible: boolean;
  opacity: number; // 0–1
  scale: number; // pop entrance; 1 otherwise
  progress: number; // draw/trace entrance; 1 once fully drawn
}

const HIDDEN: ElementScene = { visible: false, opacity: 0, scale: 0, progress: 0 };
const SHOWN: ElementScene = { visible: true, opacity: 1, scale: 1, progress: 1 };

// easeOutBack: starts at 0, overshoots to ~1.1, settles at exactly 1.
// The overshoot is inherent to pop (spec §3.4), separate from the easing preset.
function popScale(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function windowOf(
  binding: AnimationBinding<string>,
  timeline: Timeline,
): [start: number, end: number] | null {
  const arrival = timeline.arrivalMs.get(binding.keyframeId);
  if (arrival === undefined) return null; // keyframe was deleted
  const start = arrival + binding.delayMs;
  return [start, start + binding.durationMs];
}

export function evaluateElement(element: Element, timeline: Timeline, timeMs: number): ElementScene {
  const enterWindow = windowOf(element.enter, timeline);
  if (enterWindow === null) return HIDDEN;
  const [enterStart, enterEnd] = enterWindow;
  if (timeMs < enterStart) return HIDDEN;

  if (element.exit) {
    const exitWindow = windowOf(element.exit, timeline);
    if (exitWindow !== null) {
      const [exitStart, exitEnd] = exitWindow;
      if (timeMs >= exitEnd) return HIDDEN;
      if (timeMs >= exitStart) {
        const t = ease(element.exit.easing, (timeMs - exitStart) / (exitEnd - exitStart));
        return { visible: true, opacity: 1 - t, scale: 1, progress: 1 };
      }
    }
  }

  if (timeMs >= enterEnd) return SHOWN;

  const t = ease(element.enter.easing, (timeMs - enterStart) / (enterEnd - enterStart));
  switch (element.enter.animation) {
    case 'fade':
      return { visible: true, opacity: t, scale: 1, progress: 1 };
    case 'pop':
      // opacity ramps in over the first 30% so the overshoot happens fully visible
      return { visible: true, opacity: Math.min(1, t / 0.3), scale: popScale(t), progress: 1 };
    case 'draw':
      return { visible: true, opacity: 1, scale: 1, progress: t };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/elements.ts src/engine/elements.test.ts
git commit -m "Add element animation evaluators (fade, pop, draw, exit)"
```

---

### Task 7: Geometry utilities

**Files:**
- Create: `src/engine/geometry.ts`
- Test: `src/engine/geometry.test.ts`

**Interfaces:**
- Consumes: `@turf/turf` (`greatCircle`, `length`, `lineSliceAlong`, `area`, `polygon`); geojson types.
- Produces:
  - `greatCircleArc(a: LngLat, b: LngLat, steps?: number): LineString` — flight arc; handles antimeridian crossing by unwrapping longitudes past ±180 so the line renders continuously
  - `sliceByProgress(line: LineString, progress: number): LineString | null` — `null` at progress ≤ 0 (nothing to draw), the full line at ≥ 1
  - `traceRing(geometry: Polygon | MultiPolygon): LineString` — the largest outer ring, reordered to start at its northernmost vertex, wound clockwise, closed (spec §3.4)

- [ ] **Step 1: Write the failing test**

`src/engine/geometry.test.ts`:

```ts
import { expect, it } from 'vitest';
import type { MultiPolygon, Position } from 'geojson';
import { greatCircleArc, sliceByProgress, traceRing } from './geometry';

it('arc endpoints match the inputs', () => {
  const arc = greatCircleArc([139.77, 35.68], [135.5, 34.69]);
  const coords = arc.coordinates;
  expect(coords[0][0]).toBeCloseTo(139.77, 2);
  expect(coords[0][1]).toBeCloseTo(35.68, 2);
  expect(coords[coords.length - 1][0]).toBeCloseTo(135.5, 2);
  expect(coords[coords.length - 1][1]).toBeCloseTo(34.69, 2);
});

it('an arc across the antimeridian is one continuous line', () => {
  const arc = greatCircleArc([170, 0], [-170, 10]);
  for (let i = 1; i < arc.coordinates.length; i++) {
    const jump = Math.abs(arc.coordinates[i][0] - arc.coordinates[i - 1][0]);
    expect(jump).toBeLessThan(90); // no wrap-around jumps
  }
});

it('sliceByProgress returns null at 0, the full line at 1, half at 0.5', () => {
  const line = greatCircleArc([0, 0], [10, 0]);
  expect(sliceByProgress(line, 0)).toBeNull();
  expect(sliceByProgress(line, 1)).toEqual(line);
  const half = sliceByProgress(line, 0.5)!;
  const lastLng = half.coordinates[half.coordinates.length - 1][0];
  expect(lastLng).toBeCloseTo(5, 0);
});

// Big square (0..10) and a small distant square (20..21), both CCW per GeoJSON.
const square = (min: number, max: number): Position[] => [
  [min, min], [max, min], [max, max], [min, max], [min, min],
];
const multi: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [[square(20, 21)], [square(0, 10)]],
};

it('traceRing picks the largest polygon of a MultiPolygon', () => {
  const ring = traceRing(multi);
  expect(Math.max(...ring.coordinates.map((c) => c[0]))).toBe(10);
});

it('traceRing starts at the northernmost vertex and runs clockwise', () => {
  const ring = traceRing(multi);
  expect(ring.coordinates[0][1]).toBe(10); // northernmost latitude
  // clockwise (lat = y-up): from a top corner the next step heads along the
  // top or down the east side, never up. Shoelace sign check:
  const signed = ring.coordinates.slice(0, -1).reduce((sum, [x1, y1], i, open) => {
    const [x2, y2] = open[(i + 1) % open.length];
    return sum + (x2 - x1) * (y2 + y1);
  }, 0);
  expect(signed).toBeGreaterThan(0); // positive = clockwise for y-up coords
});

it('traceRing output is closed (first point repeated at the end)', () => {
  const ring = traceRing(multi);
  expect(ring.coordinates[0]).toEqual(ring.coordinates[ring.coordinates.length - 1]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./geometry`.

- [ ] **Step 3: Implement**

`src/engine/geometry.ts`:

```ts
import { area, greatCircle, length, lineSliceAlong, polygon } from '@turf/turf';
import type { Feature, LineString, MultiPolygon, Polygon, Position } from 'geojson';
import type { LngLat } from './types';

export function greatCircleArc(a: LngLat, b: LngLat, steps = 128): LineString {
  const gc = greatCircle(a, b, { npoints: steps });
  const geom = gc.geometry;
  if (geom.type === 'LineString') return geom;
  // Crossing the antimeridian: turf splits the line in two at ±180.
  // Unwrap the second half past ±180 so it renders as one continuous line.
  const [first, second] = geom.coordinates;
  const offset = first[first.length - 1][0] > 0 ? 360 : -360;
  const unwrapped = second.map(([lng, lat]) => [lng + offset, lat]);
  return { type: 'LineString', coordinates: [...first, ...unwrapped] };
}

export function sliceByProgress(line: LineString, progress: number): LineString | null {
  if (progress <= 0) return null;
  if (progress >= 1) return line;
  const feature: Feature<LineString> = { type: 'Feature', properties: {}, geometry: line };
  return lineSliceAlong(feature, 0, length(feature) * progress).geometry;
}

// Largest outer ring, reordered to start at its northernmost vertex, wound
// clockwise, closed. This is the ring the trace-on animation follows; other
// rings of a MultiPolygon fade in with the fill (spec §3.4).
export function traceRing(geometry: Polygon | MultiPolygon): LineString {
  const outers: Position[][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates[0]]
      : geometry.coordinates.map((poly) => poly[0]);
  const largest = outers.reduce((best, ring) =>
    area(polygon([ring])) > area(polygon([best])) ? ring : best,
  );

  const open = largest.slice(0, -1); // drop the closing duplicate
  let north = 0;
  open.forEach((pos, i) => {
    if (pos[1] > open[north][1]) north = i;
  });
  let ring = [...open.slice(north), ...open.slice(0, north)];

  // Shoelace with y-up coords: negative = counterclockwise → reverse.
  const signed = ring.reduce((sum, [x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    return sum + (x2 - x1) * (y2 + y1);
  }, 0);
  if (signed < 0) ring = [ring[0], ...ring.slice(1).reverse()];

  return { type: 'LineString', coordinates: [...ring, ring[0]] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/geometry.ts src/engine/geometry.test.ts
git commit -m "Add arc, line-slice, and region trace-ring geometry utilities"
```

---

### Task 8: SceneState assembly

**Files:**
- Create: `src/engine/scene.ts`
- Test: `src/engine/scene.test.ts`

**Interfaces:**
- Consumes: everything above (`cameraAt`, `evaluateElement`, `computeTimeline`, `viewportForSettings`).
- Produces (THE engine entry point — Plans 2 and 3 call only this):
  - `SceneState { timeMs: number; camera: CameraPose; elements: Record<string, ElementScene> }`
  - `sceneAt(project: Project, timeMs: number, timeline?: Timeline): SceneState` — the optional timeline parameter lets callers in a render loop compute it once instead of per frame

- [ ] **Step 1: Write the failing test**

`src/engine/scene.test.ts`:

```ts
import { expect, it } from 'vitest';
import { sceneAt } from './scene';
import { computeTimeline } from './timeline';
import { cameraAt } from './camera';
import { viewportForSettings } from './viewport';
import type { Project } from './types';

const p: Project = {
  version: 1,
  settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: '' },
  keyframes: [
    { id: 'kf1', camera: { center: [139.77, 35.68], zoom: 8, bearing: 0, pitch: 0 }, holdMs: 1000, transition: { durationMs: 2000, easing: 'easeInOut' } },
    { id: 'kf2', camera: { center: [135.5, 34.69], zoom: 9, bearing: 0, pitch: 0 }, holdMs: 1000, transition: { durationMs: 0, easing: 'linear' } },
  ],
  elements: [
    {
      id: 'm1', type: 'marker', style: {}, data: { lngLat: [139.77, 35.68] },
      enter: { keyframeId: 'kf1', animation: 'pop', delayMs: 0, durationMs: 400, easing: 'linear' },
    },
  ],
};

it('assembles camera and element states for an instant', () => {
  const tl = computeTimeline(p);
  const scene = sceneAt(p, 2000, tl);
  expect(scene.timeMs).toBe(2000);
  expect(scene.camera).toEqual(cameraAt(p, tl, 2000, viewportForSettings(p.settings)));
  expect(scene.elements.m1).toEqual({ visible: true, opacity: 1, scale: 1, progress: 1 });
});

it('computes its own timeline when not given one', () => {
  expect(sceneAt(p, 0).camera).toEqual(p.keyframes[0].camera);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./scene`.

- [ ] **Step 3: Implement**

`src/engine/scene.ts`:

```ts
import type { CameraPose, Project } from './types';
import { computeTimeline, type Timeline } from './timeline';
import { cameraAt } from './camera';
import { evaluateElement, type ElementScene } from './elements';
import { viewportForSettings } from './viewport';

export interface SceneState {
  timeMs: number;
  camera: CameraPose;
  elements: Record<string, ElementScene>;
}

export function sceneAt(
  project: Project,
  timeMs: number,
  timeline: Timeline = computeTimeline(project),
): SceneState {
  const viewport = viewportForSettings(project.settings);
  const elements: Record<string, ElementScene> = {};
  for (const el of project.elements) {
    elements[el.id] = evaluateElement(el, timeline, timeMs);
  }
  return { timeMs, camera: cameraAt(project, timeline, timeMs, viewport), elements };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/scene.ts src/engine/scene.test.ts
git commit -m "Add sceneAt engine entry point"
```

---

### Task 9: Scene applier and demo animation

**Files:**
- Create: `src/map/applyScene.ts`, `src/demo/sampleProject.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `sceneAt`, `computeTimeline`, `sliceByProgress`, `traceRing`, engine types.
- Produces (Plans 2 and 3 reuse these for preview and export):
  - `ensureElementLayers(map: maplibregl.Map, project: Project): void` — idempotently creates one geojson source + layer per element (`el-<id>`; regions also get `el-<id>-fill`)
  - `applyScene(map: maplibregl.Map, project: Project, scene: SceneState): void` — jumps the camera and updates every element's data + paint properties for one frame

**Note:** this task has no unit tests — it drives a WebGL map, which jsdom cannot run. All logic it applies (timing, slicing, interpolation) is already unit-tested in Tasks 2–8; verification here is visual, per the checklist in Step 3. Export smoke tests come in Plan 3.

- [ ] **Step 1: Implement the scene applier**

`src/map/applyScene.ts`:

```ts
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
          layout: { 'text-field': ['get', 'text'], 'text-size': Number(el.style.size ?? 16) },
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
```

- [ ] **Step 2: Add the sample project and demo loop**

`src/demo/sampleProject.ts`:

```ts
import { greatCircleArc } from '../engine/geometry';
import type { Project } from '../engine/types';

const TOKYO: [number, number] = [139.77, 35.68];
const OSAKA: [number, number] = [135.5, 34.69];

export const sampleProject: Project = {
  version: 1,
  settings: {
    resolution: '1080p',
    fps: 30,
    aspect: '16:9',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  },
  keyframes: [
    {
      id: 'kf-japan',
      camera: { center: [137.5, 36.2], zoom: 4.6, bearing: 0, pitch: 0 },
      holdMs: 2000,
      transition: { durationMs: 3000, easing: 'easeInOut' },
    },
    {
      id: 'kf-osaka',
      camera: { center: OSAKA, zoom: 8.5, bearing: -15, pitch: 45 },
      holdMs: 3000,
      transition: { durationMs: 0, easing: 'linear' },
    },
  ],
  elements: [
    {
      id: 'marker-tokyo',
      type: 'marker',
      style: { color: '#d63031' },
      data: { lngLat: TOKYO },
      enter: { keyframeId: 'kf-japan', animation: 'pop', delayMs: 300, durationMs: 400, easing: 'linear' },
    },
    {
      id: 'label-tokyo',
      type: 'label',
      style: { color: '#2d3436', size: 18 },
      data: { lngLat: [141.2, 35.68], text: 'Tokyo' },
      enter: { keyframeId: 'kf-japan', animation: 'fade', delayMs: 600, durationMs: 400, easing: 'easeInOut' },
    },
    {
      id: 'route-flight',
      type: 'route',
      style: { color: '#0984e3', width: 3 },
      data: { mode: 'arc', waypoints: [TOKYO, OSAKA], geometry: greatCircleArc(TOKYO, OSAKA) },
      enter: { keyframeId: 'kf-japan', animation: 'draw', delayMs: 1100, durationMs: 1500, easing: 'easeInOut' },
    },
  ],
};
```

`src/App.tsx` (replace entirely):

```tsx
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { computeTimeline } from './engine/timeline';
import { sceneAt } from './engine/scene';
import { applyScene, ensureElementLayers } from './map/applyScene';
import { sampleProject } from './demo/sampleProject';

// ponytail: App IS the looping demo for now — Plan 2 replaces this with the editor.
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: sampleProject.settings.styleUrl,
      center: sampleProject.keyframes[0].camera.center,
      zoom: sampleProject.keyframes[0].camera.zoom,
      interactive: false,
    });

    let raf = 0;
    map.on('load', () => {
      ensureElementLayers(map, sampleProject);
      const timeline = computeTimeline(sampleProject);
      const start = performance.now();
      const frame = (now: number) => {
        const t = (now - start) % timeline.totalMs;
        applyScene(map, sampleProject, sceneAt(sampleProject, t, timeline));
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
    };
  }, []);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev` and watch a full loop. Checklist:
- Map opens on a wide Japan view, holds ~2s.
- Tokyo marker pops in (visible overshoot) ~0.3s in; "Tokyo" label fades in beside it.
- Blue arc draws smoothly from Tokyo to Osaka.
- Camera flies to Osaka — zooms out slightly, pans, zooms in — ending tilted (pitch 45) and rotated.
- Holds on Osaka ~3s, then loops.
- No console errors.

Run: `npm test` → full suite still PASS. Run: `npm run build` → no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/map/ src/demo/ src/App.tsx
git commit -m "Add scene applier and looping demo animation"
```

---

## Out of Scope for Plan 1

- Editor UI (keyframe capture, element authoring, preview bar, scrubbing) — Plan 2, which also covers providers (Nominatim, OSRM), project save/load, and autosave.
- Video export (hidden render map, WebCodecs, muxing, progress UI) — Plan 3.

Plans 2 and 3 are written after this plan executes, against the real code.
