# Plan 2a: Editor Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the engine + demo into a usable editor: capture and arrange keyframes on a live map, preview/scrub the camera animation, and save/load projects — camera-only animations become fully authorable.

**Architecture:** A zustand store holds the `Project` (the same JSON the engine consumes) plus editor-only state (mode, playback time, thumbnails). The map area is letterboxed to the project's aspect ratio; a pure zoom-offset helper converts between the on-screen canvas zoom and the engine's reference viewport so what you frame is exactly what exports. Two display paths share the MapLibre layers: edit mode shows all elements fully via `applyElements`; preview mode drives `sceneAt` through the same applier. Element *authoring* UI is Plan 2b — but loaded projects containing elements must render, so the layer-sync contract (`syncElementLayers`) lands here.

**Tech Stack:** Existing (Vite 8, React 19, TS 6 strict, MapLibre GL 6, vitest 4) plus: zustand, @mantine/core + @mantine/hooks + @mantine/notifications (dark theme), @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities (keyframe reorder), jsdom (dev, for DOM-touching unit tests).

## Global Constraints

- License AGPL-3.0; no API keys; default style URL exactly `https://tiles.openfreemap.org/styles/liberty`.
- `src/engine/` stays pure: no maplibre-gl/react/DOM imports, no `Date.now()`, no `Math.random()`. Editor code (`src/editor/`) and map code (`src/map/`) may use all of these.
- TypeScript strict; `npm run build` stays clean; run tests with `npm test`.
- Commit messages: plain, descriptive, **no AI attribution, no Co-Authored-By lines**.
- **Reference-viewport contract (decided after Plan 1's final review):** the engine's viewport is a fixed reference size per aspect — 16:9 → 1920×1080, 9:16 → 1080×1920 — regardless of export resolution. Resolution will drive the export map's `pixelRatio` in Plan 3. Keyframe `camera.zoom` is always stored in *reference* zoom; the editor converts to/from the on-screen canvas with `canvasZoomOffset`.
- **Layer-sync contract (decided after Plan 1's final review):** `applyScene`/`applyElements` only set *animated* per-frame properties. Structural changes (element added/removed, style edits, baked-geometry refresh) go through `syncElementLayers(map, project)`, which the editor calls after every project mutation.
- The editor must handle the zero-keyframe project: never call `sceneAt` when `project.keyframes.length === 0` (it throws, by documented contract).
- Deleting a keyframe cleans up element bindings: an `enter` referencing it rebinds to the first remaining keyframe (left dangling only if no keyframes remain); an `exit` referencing it is dropped.
- Existing interfaces consumed (do not change signatures): `sceneAt(project, timeMs, timeline?)`, `computeTimeline(project)`, `parseProject(json)`, `serializeProject(project)`, `ProjectFormatError`, `ensureElementLayers(map, project)`, `applyScene(map, project, scene)`.

---

### Task 1: Reference viewport and canvas zoom offset

**Files:**
- Modify: `src/engine/viewport.ts` (full replacement below)
- Test: `src/engine/viewport.test.ts` (full replacement below)

**Interfaces:**
- Consumes: `Aspect`, `Settings` from `./types`.
- Produces (later tasks rely on these verbatim):
  - `REFERENCE_VIEWPORT: Record<Aspect, { width: number; height: number }>`
  - `viewportForSettings(settings: Settings): { width: number; height: number }` — now returns the reference size for the aspect; resolution no longer affects it
  - `canvasZoomOffset(canvasCssWidth: number, aspect: Aspect): number` — `referenceZoom = canvasZoom + offset`; `canvasZoom = referenceZoom - offset`

- [ ] **Step 1: Replace the test file with the new contract**

`src/engine/viewport.test.ts` (replace entirely):

```ts
import { expect, it } from 'vitest';
import { canvasZoomOffset, viewportForSettings } from './viewport';
import type { Settings } from './types';

function s(resolution: Settings['resolution'], aspect: Settings['aspect']): Settings {
  return { resolution, aspect, fps: 30, styleUrl: '' };
}

it('returns the fixed reference viewport per aspect, independent of resolution', () => {
  expect(viewportForSettings(s('1080p', '16:9'))).toEqual({ width: 1920, height: 1080 });
  expect(viewportForSettings(s('1440p', '16:9'))).toEqual({ width: 1920, height: 1080 });
  expect(viewportForSettings(s('4k', '16:9'))).toEqual({ width: 1920, height: 1080 });
  expect(viewportForSettings(s('1080p', '9:16'))).toEqual({ width: 1080, height: 1920 });
  expect(viewportForSettings(s('4k', '9:16'))).toEqual({ width: 1080, height: 1920 });
});

it('computes the canvas→reference zoom offset', () => {
  expect(canvasZoomOffset(1920, '16:9')).toBe(0);
  expect(canvasZoomOffset(960, '16:9')).toBe(1); // half-size canvas: reference is 1 zoom level in
  expect(canvasZoomOffset(3840, '16:9')).toBe(-1); // double-size canvas
  expect(canvasZoomOffset(1080, '9:16')).toBe(0);
  expect(canvasZoomOffset(540, '9:16')).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — old `viewportForSettings` returns export pixels (e.g. 3840×2160 for 4k), and `canvasZoomOffset` doesn't exist.

- [ ] **Step 3: Implement**

`src/engine/viewport.ts` (replace entirely):

```ts
import type { Aspect, Settings } from './types';

// The engine's camera math runs against a fixed REFERENCE viewport per
// aspect, so a project composes identically at every export resolution.
// Resolution only scales pixels: the export map (Plan 3) renders at the
// reference CSS size with pixelRatio = exportWidth / referenceWidth.
export const REFERENCE_VIEWPORT: Record<Aspect, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
};

export function viewportForSettings(settings: Settings): { width: number; height: number } {
  return REFERENCE_VIEWPORT[settings.aspect];
}

/**
 * Zoom delta between an on-screen canvas and the reference viewport showing
 * the same geographic frame: referenceZoom = canvasZoom + offset.
 */
export function canvasZoomOffset(canvasCssWidth: number, aspect: Aspect): number {
  return Math.log2(REFERENCE_VIEWPORT[aspect].width / canvasCssWidth);
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (44 tests — viewport tests replaced, camera/scene tests unaffected since they pass explicit viewports or use 16:9 defaults).

- [ ] **Step 5: Commit**

```bash
git add src/engine/viewport.ts src/engine/viewport.test.ts
git commit -m "Switch engine to fixed reference viewport per aspect"
```

---

### Task 2: Dependencies and Mantine app shell

**Files:**
- Modify: `package.json` (via npm install), `src/main.tsx`, `src/index.css`
- Create: `src/editor/AppShell.tsx`
- Modify: `src/App.tsx` (becomes a thin wrapper)
- Delete: `src/demo/` (the looping demo; the editor replaces it)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `EditorShell` component with named slots later tasks fill: header actions (Task 8), navbar (Task 6), aside (Task 3), main (Task 5), footer (Task 7). Props: `{ header?, navbar?, aside?, main?, footer? }` all `ReactNode`.

- [ ] **Step 1: Install dependencies**

```bash
npm install zustand @mantine/core @mantine/hooks @mantine/notifications @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install -D jsdom
```

- [ ] **Step 2: Wire Mantine provider and styles**

`src/main.tsx` (replace entirely):

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark">
      <Notifications />
      <App />
    </MantineProvider>
  </StrictMode>,
);
```

`src/index.css` (replace entirely):

```css
html, body, #root { height: 100%; margin: 0; }
```

- [ ] **Step 3: Build the shell**

`src/editor/AppShell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { AppShell, Group, Text } from '@mantine/core';

interface EditorShellProps {
  header?: ReactNode;
  navbar?: ReactNode;
  aside?: ReactNode;
  main?: ReactNode;
  footer?: ReactNode;
}

export function EditorShell({ header, navbar, aside, main, footer }: EditorShellProps) {
  return (
    <AppShell
      header={{ height: 48 }}
      navbar={{ width: 280, breakpoint: 0 }}
      aside={{ width: 300, breakpoint: 0 }}
      footer={{ height: 72 }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700}>Michigatari</Text>
          <Group gap="xs">{header}</Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">{navbar}</AppShell.Navbar>
      <AppShell.Aside p="sm">{aside}</AppShell.Aside>
      <AppShell.Main style={{ display: 'flex', height: 'calc(100dvh - 48px - 72px)' }}>
        {main}
      </AppShell.Main>
      <AppShell.Footer p="sm">{footer}</AppShell.Footer>
    </AppShell>
  );
}
```

`src/App.tsx` (replace entirely; this deletes the demo loop — also `git rm -r src/demo`):

```tsx
import { EditorShell } from './editor/AppShell';

export default function App() {
  return <EditorShell />;
}
```

- [ ] **Step 4: Verify**

Run: `npm test` → PASS (no tests reference the demo). Run: `npm run build` → clean. Run: `npm run dev` → dark shell renders with header "Michigatari", empty navbar/aside/footer, empty main.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Mantine app shell and editor dependencies, remove demo"
```

---

### Task 3: Editor store and settings panel

**Files:**
- Create: `src/editor/store.ts`, `src/editor/SettingsPanel.tsx`
- Modify: `src/App.tsx` (mount SettingsPanel in aside)
- Test: `src/editor/store.test.ts`

**Interfaces:**
- Consumes: engine types, `serializeProject` (Task 8 uses store shapes).
- Produces (relied on verbatim by Tasks 5–8 and Plan 2b):
  - `blankProject(): Project`, `DEFAULT_STYLE_URL`
  - `useEditorStore` (zustand hook) with state `{ project: Project; mode: 'edit' | 'preview'; playing: boolean; timeMs: number; thumbnails: Record<string, string> }` and actions:
    - `loadProject(project: Project): void` (resets mode/playback/thumbnails)
    - `newProject(): void`
    - `updateSettings(patch: Partial<Settings>): void`
    - `addKeyframe(camera: CameraPose): string` — appends with defaults `holdMs: 2000`, `transition: { durationMs: 3000, easing: 'easeInOut' }`, returns new id
    - `updateKeyframe(id: string, patch: Partial<Omit<Keyframe, 'id'>>): void`
    - `moveKeyframe(id: string, toIndex: number): void`
    - `deleteKeyframe(id: string): void` — with binding cleanup per Global Constraints
    - `setThumbnail(id: string, dataUrl: string): void`
    - `addElement(element: Element): void`, `updateElement(id: string, patch: Partial<Omit<Element, 'id' | 'type'>>): void`, `deleteElement(id: string): void` (authoring UI is Plan 2b; loaded projects need these for Plan 2b and tests)
    - `setMode(mode: 'edit' | 'preview'): void`, `setPlaying(playing: boolean): void`, `setTimeMs(timeMs: number): void`

- [ ] **Step 1: Write the failing test**

`src/editor/store.test.ts`:

```ts
import { beforeEach, expect, it } from 'vitest';
import { blankProject, useEditorStore } from './store';
import type { MarkerElement } from '../engine/types';

beforeEach(() => {
  useEditorStore.getState().loadProject(blankProject());
});

const CAM = { center: [135.5, 34.7] as [number, number], zoom: 8, bearing: 0, pitch: 0 };

function marker(enterKf: string, exitKf?: string): MarkerElement {
  return {
    id: 'm1',
    type: 'marker',
    style: {},
    data: { lngLat: [135.5, 34.7] },
    enter: { keyframeId: enterKf, animation: 'pop', delayMs: 0, durationMs: 400, easing: 'easeInOut' },
    exit: exitKf
      ? { keyframeId: exitKf, animation: 'fade', delayMs: 0, durationMs: 300, easing: 'easeInOut' }
      : undefined,
  };
}

it('addKeyframe appends with timing defaults and a unique id', () => {
  const s = useEditorStore.getState();
  const a = s.addKeyframe(CAM);
  const b = useEditorStore.getState().addKeyframe(CAM);
  const kfs = useEditorStore.getState().project.keyframes;
  expect(kfs).toHaveLength(2);
  expect(a).not.toBe(b);
  expect(kfs[0]).toMatchObject({ id: a, holdMs: 2000, transition: { durationMs: 3000, easing: 'easeInOut' } });
});

it('updateKeyframe shallow-merges a patch', () => {
  const id = useEditorStore.getState().addKeyframe(CAM);
  useEditorStore.getState().updateKeyframe(id, { holdMs: 500 });
  const kf = useEditorStore.getState().project.keyframes[0];
  expect(kf.holdMs).toBe(500);
  expect(kf.transition.durationMs).toBe(3000); // untouched
});

it('moveKeyframe reorders', () => {
  const s = useEditorStore.getState();
  const a = s.addKeyframe(CAM);
  const b = useEditorStore.getState().addKeyframe(CAM);
  const c = useEditorStore.getState().addKeyframe(CAM);
  useEditorStore.getState().moveKeyframe(c, 0);
  expect(useEditorStore.getState().project.keyframes.map((k) => k.id)).toEqual([c, a, b]);
});

it('deleteKeyframe rebinds enters to the first remaining keyframe and drops exits', () => {
  const s = useEditorStore.getState();
  const a = s.addKeyframe(CAM);
  const b = useEditorStore.getState().addKeyframe(CAM);
  useEditorStore.getState().addElement(marker(b, b));
  useEditorStore.getState().deleteKeyframe(b);
  const el = useEditorStore.getState().project.elements[0];
  expect(el.enter.keyframeId).toBe(a);
  expect(el.exit).toBeUndefined();
});

it('deleting the last keyframe leaves bindings dangling (hidden by engine contract)', () => {
  const a = useEditorStore.getState().addKeyframe(CAM);
  useEditorStore.getState().addElement(marker(a));
  useEditorStore.getState().deleteKeyframe(a);
  const st = useEditorStore.getState();
  expect(st.project.keyframes).toHaveLength(0);
  expect(st.project.elements[0].enter.keyframeId).toBe(a); // dangling, engine hides it
});

it('newProject resets project and playback state', () => {
  useEditorStore.getState().addKeyframe(CAM);
  useEditorStore.getState().setTimeMs(1234);
  useEditorStore.getState().newProject();
  const st = useEditorStore.getState();
  expect(st.project).toEqual(blankProject());
  expect(st.timeMs).toBe(0);
  expect(st.mode).toBe('edit');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Implement the store**

`src/editor/store.ts`:

```ts
import { create } from 'zustand';
import type { CameraPose, Element, Keyframe, Project, Settings } from '../engine/types';

export const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export function blankProject(): Project {
  return {
    version: 1,
    settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: DEFAULT_STYLE_URL },
    keyframes: [],
    elements: [],
  };
}

export type EditorMode = 'edit' | 'preview';

interface EditorStore {
  project: Project;
  mode: EditorMode;
  playing: boolean;
  timeMs: number;
  thumbnails: Record<string, string>;

  loadProject(project: Project): void;
  newProject(): void;
  updateSettings(patch: Partial<Settings>): void;
  addKeyframe(camera: CameraPose): string;
  updateKeyframe(id: string, patch: Partial<Omit<Keyframe, 'id'>>): void;
  moveKeyframe(id: string, toIndex: number): void;
  deleteKeyframe(id: string): void;
  setThumbnail(id: string, dataUrl: string): void;
  addElement(element: Element): void;
  updateElement(id: string, patch: Partial<Omit<Element, 'id' | 'type'>>): void;
  deleteElement(id: string): void;
  setMode(mode: EditorMode): void;
  setPlaying(playing: boolean): void;
  setTimeMs(timeMs: number): void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  project: blankProject(),
  mode: 'edit',
  playing: false,
  timeMs: 0,
  thumbnails: {},

  loadProject: (project) => set({ project, mode: 'edit', playing: false, timeMs: 0, thumbnails: {} }),
  newProject: () => set({ project: blankProject(), mode: 'edit', playing: false, timeMs: 0, thumbnails: {} }),

  updateSettings: (patch) =>
    set((s) => ({ project: { ...s.project, settings: { ...s.project.settings, ...patch } } })),

  addKeyframe: (camera) => {
    const id = crypto.randomUUID();
    set((s) => ({
      project: {
        ...s.project,
        keyframes: [
          ...s.project.keyframes,
          { id, camera, holdMs: 2000, transition: { durationMs: 3000, easing: 'easeInOut' } },
        ],
      },
    }));
    return id;
  },

  updateKeyframe: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        keyframes: s.project.keyframes.map((k) => (k.id === id ? { ...k, ...patch } : k)),
      },
    })),

  moveKeyframe: (id, toIndex) =>
    set((s) => {
      const keyframes = [...s.project.keyframes];
      const from = keyframes.findIndex((k) => k.id === id);
      if (from === -1) return s;
      const [kf] = keyframes.splice(from, 1);
      keyframes.splice(toIndex, 0, kf);
      return { project: { ...s.project, keyframes } };
    }),

  deleteKeyframe: (id) =>
    set((s) => {
      const keyframes = s.project.keyframes.filter((k) => k.id !== id);
      const fallback = keyframes[0]?.id;
      const elements = s.project.elements.map((el) => {
        let next = el;
        if (el.enter.keyframeId === id && fallback !== undefined) {
          next = { ...next, enter: { ...next.enter, keyframeId: fallback } };
        }
        if (next.exit?.keyframeId === id) {
          next = { ...next, exit: undefined };
        }
        return next;
      });
      const thumbnails = { ...s.thumbnails };
      delete thumbnails[id];
      return { project: { ...s.project, keyframes, elements }, thumbnails };
    }),

  setThumbnail: (id, dataUrl) => set((s) => ({ thumbnails: { ...s.thumbnails, [id]: dataUrl } })),

  addElement: (element) =>
    set((s) => ({ project: { ...s.project, elements: [...s.project.elements, element] } })),
  updateElement: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        elements: s.project.elements.map((el) => (el.id === id ? ({ ...el, ...patch } as Element) : el)),
      },
    })),
  deleteElement: (id) =>
    set((s) => ({ project: { ...s.project, elements: s.project.elements.filter((el) => el.id !== id) } })),

  setMode: (mode) => set({ mode }),
  setPlaying: (playing) => set({ playing }),
  setTimeMs: (timeMs) => set({ timeMs }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Add the settings panel**

`src/editor/SettingsPanel.tsx`:

```tsx
import { SegmentedControl, Select, Stack, Text } from '@mantine/core';
import { useEditorStore } from './store';
import type { Settings } from '../engine/types';

export function SettingsPanel() {
  const settings = useEditorStore((s) => s.project.settings);
  const updateSettings = useEditorStore((s) => s.updateSettings);

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">Project settings</Text>
      <SegmentedControl
        fullWidth
        data={[{ label: 'Widescreen 16:9', value: '16:9' }, { label: 'Vertical 9:16', value: '9:16' }]}
        value={settings.aspect}
        onChange={(v) => updateSettings({ aspect: v as Settings['aspect'] })}
      />
      <Select
        label="Export resolution"
        data={[{ value: '1080p', label: '1080p' }, { value: '1440p', label: '1440p' }, { value: '4k', label: '4K' }]}
        value={settings.resolution}
        onChange={(v) => v && updateSettings({ resolution: v as Settings['resolution'] })}
        allowDeselect={false}
      />
      <SegmentedControl
        fullWidth
        data={[{ label: '30 fps', value: '30' }, { label: '60 fps', value: '60' }]}
        value={String(settings.fps)}
        onChange={(v) => updateSettings({ fps: Number(v) as Settings['fps'] })}
      />
    </Stack>
  );
}
```

`src/App.tsx` (replace entirely):

```tsx
import { EditorShell } from './editor/AppShell';
import { SettingsPanel } from './editor/SettingsPanel';

export default function App() {
  return <EditorShell aside={<SettingsPanel />} />;
}
```

- [ ] **Step 6: Verify and commit**

Run: `npm test` → PASS. `npm run build` → clean. `npm run dev` → settings panel in the right sidebar; toggles update (verify aspect toggle switches highlight).

```bash
git add src/editor/ src/App.tsx
git commit -m "Add editor store with keyframe/element actions and settings panel"
```

---

### Task 4: Layer sync and applyElements split

**Files:**
- Modify: `src/map/applyScene.ts`
- Create: `src/map/layerSync.ts`, `src/editor/editorScene.ts`
- Test: `src/map/layerSync.test.ts`, `src/editor/editorScene.test.ts`

**Interfaces:**
- Consumes: `Element`, `Project` types; existing applyScene internals.
- Produces (relied on by Tasks 5–7 and Plan 3):
  - In `applyScene.ts`: `applyElements(map: MapLibreMap, project: Project, elements: Record<string, ElementScene>): void` (extracted body of the per-element loop; `applyScene` becomes `jumpTo` + `applyElements`). Marker radius reads `Number(el.style.size ?? 8)` in both creation and per-frame paths. `createElementLayers(map: MapLibreMap, el: Element): void` (extracted single-element body of `ensureElementLayers`; `ensureElementLayers` now loops over missing elements calling it).
  - In `layerSync.ts`: `planLayerSync(project: Project, existingElementIds: string[]): { create: string[]; remove: string[]; restyle: string[] }` (pure, element ids); `syncElementLayers(map: MapLibreMap, project: Project): void`.
  - In `editorScene.ts`: `allShownStates(elements: Element[]): Record<string, ElementScene>` — every element `{ visible: true, opacity: 1, scale: 1, progress: 1 }`.

- [ ] **Step 1: Write the failing tests**

`src/map/layerSync.test.ts`:

```ts
import { expect, it } from 'vitest';
import { planLayerSync } from './layerSync';
import type { Project } from '../engine/types';

function proj(ids: string[]): Project {
  return {
    version: 1,
    settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: '' },
    keyframes: [],
    elements: ids.map((id) => ({
      id,
      type: 'marker',
      style: {},
      data: { lngLat: [0, 0] },
      enter: { keyframeId: 'kf1', animation: 'pop', delayMs: 0, durationMs: 400, easing: 'easeInOut' },
    })),
  };
}

it('creates missing, removes orphaned, restyles surviving elements', () => {
  const plan = planLayerSync(proj(['a', 'b']), ['b', 'c']);
  expect(plan.create).toEqual(['a']);
  expect(plan.remove).toEqual(['c']);
  expect(plan.restyle).toEqual(['b']);
});

it('is empty-safe in both directions', () => {
  expect(planLayerSync(proj([]), [])).toEqual({ create: [], remove: [], restyle: [] });
  expect(planLayerSync(proj([]), ['x']).remove).toEqual(['x']);
  expect(planLayerSync(proj(['x']), []).create).toEqual(['x']);
});
```

`src/editor/editorScene.test.ts`:

```ts
import { expect, it } from 'vitest';
import { allShownStates } from './editorScene';
import type { Element } from '../engine/types';

const els: Element[] = [
  {
    id: 'm1',
    type: 'marker',
    style: {},
    data: { lngLat: [0, 0] },
    enter: { keyframeId: 'gone', animation: 'pop', delayMs: 0, durationMs: 400, easing: 'easeInOut' },
  },
];

it('shows every element fully regardless of bindings', () => {
  expect(allShownStates(els)).toEqual({
    m1: { visible: true, opacity: 1, scale: 1, progress: 1 },
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./layerSync` and `./editorScene`.

- [ ] **Step 3: Implement**

`src/editor/editorScene.ts`:

```ts
import type { Element } from '../engine/types';
import type { ElementScene } from '../engine/elements';

// Edit mode shows everything at full visibility so the author can see and
// style elements without scrubbing to their animation window.
export function allShownStates(elements: Element[]): Record<string, ElementScene> {
  const states: Record<string, ElementScene> = {};
  for (const el of elements) {
    states[el.id] = { visible: true, opacity: 1, scale: 1, progress: 1 };
  }
  return states;
}
```

In `src/map/applyScene.ts`, three refactors (behavior of `applyScene` unchanged):

1. Extract the body of `ensureElementLayers`'s per-element `switch` into an exported `createElementLayers(map: MapLibreMap, el: Element): void` (everything from `map.addSource(id, ...)` through the `switch`; the `const id`/`const color` lines move with it). `ensureElementLayers` becomes:

```ts
export function ensureElementLayers(map: MapLibreMap, project: Project): void {
  for (const el of project.elements) {
    if (!map.getSource(`el-${el.id}`)) createElementLayers(map, el);
  }
}
```

2. Extract the per-element loop of `applyScene` into an exported `applyElements(map, project, elements)`:

```ts
export function applyElements(
  map: MapLibreMap,
  project: Project,
  elements: Record<string, ElementScene>,
): void {
  for (const el of project.elements) {
    const state = elements[el.id];
    // ...existing loop body unchanged (source lookup, switch on el.type)...
  }
}

export function applyScene(map: MapLibreMap, project: Project, scene: SceneState): void {
  map.jumpTo({
    center: scene.camera.center,
    zoom: scene.camera.zoom,
    bearing: scene.camera.bearing,
    pitch: scene.camera.pitch,
  });
  applyElements(map, project, scene.elements);
}
```

(Import `ElementScene` as a type from `../engine/elements`.)

3. Marker radius honors style size in both places: in `createElementLayers`, `'circle-radius': Number(el.style.size ?? 8)`; in `applyElements`, `map.setPaintProperty(id, 'circle-radius', Number(el.style.size ?? 8) * Math.max(0, state.scale))`.

`src/map/layerSync.ts`:

```ts
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { Project } from '../engine/types';
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
  for (const id of plan.create) {
    createElementLayers(map, byId.get(id)!);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (new tests plus the existing 44 — the applyScene refactor is behavior-preserving).

Run: `npm run build` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/map/ src/editor/editorScene.ts src/editor/editorScene.test.ts
git commit -m "Split applyElements from applyScene and add structural layer sync"
```

---

### Task 5: Letterboxed map view

**Files:**
- Create: `src/editor/MapView.tsx`, `src/editor/mapRef.ts`, `src/editor/MapView.css`
- Modify: `src/App.tsx` (mount MapView in main)

**Interfaces:**
- Consumes: `useEditorStore`, `syncElementLayers`, `applyElements`, `allShownStates`, `canvasZoomOffset`.
- Produces (Tasks 6–7 rely on):
  - `mapRef: { current: MapLibreMap | null }` from `./mapRef` — the single live editor map instance
  - `currentZoomOffset(): number` from `./mapRef` — `canvasZoomOffset` for the live canvas width and current project aspect; returns 0 if the map is not ready (lives in mapRef.ts, not MapView.tsx, to avoid a circular import with CaptureBar)
  - MapView behavior: letterboxed to project aspect, free interaction in edit mode, an invisible pointer-blocking overlay in preview mode, elements synced + fully shown on every project change in edit mode

- [ ] **Step 1: Implement mapRef**

`src/editor/mapRef.ts`:

```ts
import type { Map as MapLibreMap } from 'maplibre-gl';
import { canvasZoomOffset } from '../engine/viewport';
import { useEditorStore } from './store';

// Single live editor map instance. A module ref (not React state) because
// imperative tools — keyframe capture, the preview loop — need synchronous
// access outside the React tree.
export const mapRef: { current: MapLibreMap | null } = { current: null };

/** Zoom offset between the live editor canvas and the reference viewport. */
export function currentZoomOffset(): number {
  const map = mapRef.current;
  if (!map) return 0;
  const aspect = useEditorStore.getState().project.settings.aspect;
  return canvasZoomOffset(map.getContainer().clientWidth, aspect);
}
```

- [ ] **Step 2: Implement MapView**

`src/editor/MapView.css`:

```css
.map-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  background: var(--mantine-color-dark-8);
  padding: 12px;
}
.map-frame {
  position: relative;
  max-width: 100%;
  max-height: 100%;
  box-shadow: 0 0 0 1px var(--mantine-color-dark-4);
}
.map-frame[data-aspect='16:9'] { aspect-ratio: 16 / 9; width: min(100%, calc((100dvh - 168px) * 16 / 9)); }
.map-frame[data-aspect='9:16'] { aspect-ratio: 9 / 16; height: min(100%, calc(100dvh - 168px)); }
.map-canvas { position: absolute; inset: 0; }
.map-block-overlay { position: absolute; inset: 0; z-index: 2; }
```

`src/editor/MapView.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './MapView.css';
import { useEditorStore } from './store';
import { mapRef } from './mapRef';
import { syncElementLayers } from '../map/layerSync';
import { applyElements } from '../map/applyScene';
import { allShownStates } from './editorScene';

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const aspect = useEditorStore((s) => s.project.settings.aspect);
  const styleUrl = useEditorStore((s) => s.project.settings.styleUrl);
  const mode = useEditorStore((s) => s.mode);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: useEditorStore.getState().project.settings.styleUrl,
      center: [137.0, 36.5],
      zoom: 3.5,
      attributionControl: { compact: true },
    });
    map.on('load', () => {
      if (cancelled) return;
      mapRef.current = map;
      const { project } = useEditorStore.getState();
      syncElementLayers(map, project);
      applyElements(map, project, allShownStates(project.elements));
    });
    return () => {
      cancelled = true;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Structural sync + edit-mode display on every project change.
  useEffect(
    () =>
      useEditorStore.subscribe((state, prev) => {
        const map = mapRef.current;
        if (!map || state.project === prev.project) return;
        if (!map.isStyleLoaded()) return; // initial sync happens in the load handler
        syncElementLayers(map, state.project);
        if (state.mode === 'edit') {
          applyElements(map, state.project, allShownStates(state.project.elements));
        }
      }),
    [],
  );

  // Style URL changes rebuild element layers after the new style loads.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(styleUrl);
    map.once('style.load', () => {
      const { project } = useEditorStore.getState();
      syncElementLayers(map, project);
      applyElements(map, project, allShownStates(project.elements));
    });
  }, [styleUrl]);

  // Aspect changes resize the letterbox.
  useEffect(() => {
    mapRef.current?.resize();
  }, [aspect]);

  return (
    <div className="map-stage">
      <div className="map-frame" data-aspect={aspect}>
        <div ref={containerRef} className="map-canvas" />
        {mode === 'preview' && <div className="map-block-overlay" />}
      </div>
    </div>
  );
}
```

`src/App.tsx` (replace entirely):

```tsx
import { EditorShell } from './editor/AppShell';
import { SettingsPanel } from './editor/SettingsPanel';
import { MapView } from './editor/MapView';

export default function App() {
  return <EditorShell aside={<SettingsPanel />} main={<MapView />} />;
}
```

- [ ] **Step 3: Verify**

Run: `npm test` → PASS. `npm run build` → clean. `npm run dev` →
- Map renders letterboxed 16:9, centered in the dark stage; pan/zoom/rotate freely.
- Toggling aspect to 9:16 reshapes the frame to vertical and the map resizes without distortion.
- No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/editor/ src/App.tsx
git commit -m "Add letterboxed editor map view with structural element sync"
```

---

### Task 6: Keyframe workflow

**Files:**
- Create: `src/editor/KeyframePanel.tsx`, `src/editor/captureThumbnail.ts`, `src/editor/CaptureBar.tsx`
- Modify: `src/App.tsx`, `src/editor/MapView.css` (capture bar position)

**Interfaces:**
- Consumes: `mapRef`, `currentZoomOffset`, store actions (`addKeyframe`, `updateKeyframe`, `moveKeyframe`, `deleteKeyframe`, `setThumbnail`), `EASINGS` keys for the easing select.
- Produces: `KeyframePanel` (navbar), `CaptureBar` (floating over the map). Camera capture/jump conventions used by Task 7: stored keyframes hold *reference* zoom; on-map application subtracts `currentZoomOffset()`.

- [ ] **Step 1: Thumbnail capture helper**

`src/editor/captureThumbnail.ts`:

```ts
import type { Map as MapLibreMap } from 'maplibre-gl';

// WebGL canvases are cleared after compositing, so the pixels must be read
// inside a render callback; triggerRepaint guarantees one arrives.
export function captureThumbnail(map: MapLibreMap, width = 192): Promise<string> {
  return new Promise((resolve) => {
    map.once('render', () => {
      const src = map.getCanvas();
      const height = Math.max(1, Math.round((width * src.height) / src.width));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(src, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    });
    map.triggerRepaint();
  });
}
```

- [ ] **Step 2: Capture bar over the map**

`src/editor/CaptureBar.tsx`:

```tsx
import { Button, Group } from '@mantine/core';
import { useEditorStore } from './store';
import { currentZoomOffset, mapRef } from './mapRef';
import { captureThumbnail } from './captureThumbnail';
import type { CameraPose } from '../engine/types';

export function cameraFromMap(): CameraPose | null {
  const map = mapRef.current;
  if (!map) return null;
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom() + currentZoomOffset(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

export function CaptureBar() {
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const setThumbnail = useEditorStore((s) => s.setThumbnail);
  const mode = useEditorStore((s) => s.mode);

  const capture = async () => {
    const camera = cameraFromMap();
    const map = mapRef.current;
    if (!camera || !map) return;
    const id = addKeyframe(camera);
    setThumbnail(id, await captureThumbnail(map));
  };

  return (
    <Group className="capture-bar" gap="xs">
      <Button size="xs" onClick={capture} disabled={mode === 'preview'}>
        Capture keyframe
      </Button>
    </Group>
  );
}
```

Append to `src/editor/MapView.css`:

```css
.capture-bar { position: absolute; top: 8px; left: 8px; z-index: 3; }
```

And render `<CaptureBar />` inside `.map-frame` in `MapView.tsx` (import it; place after the overlay conditional).

- [ ] **Step 3: Keyframe panel with reorder and timing fields**

`src/editor/KeyframePanel.tsx`:

```tsx
import { Card, Group, Image, NumberInput, Select, Stack, Text, ActionIcon, Tooltip } from '@mantine/core';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEditorStore } from './store';
import { currentZoomOffset, mapRef } from './mapRef';
import { captureThumbnail } from './captureThumbnail';
import { cameraFromMap } from './CaptureBar';
import type { EasingName, Keyframe } from '../engine/types';

const EASING_OPTIONS: EasingName[] = ['linear', 'easeIn', 'easeOut', 'easeInOut'];

function KeyframeCard({ kf, index, isLast }: { kf: Keyframe; index: number; isLast: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: kf.id });
  const updateKeyframe = useEditorStore((s) => s.updateKeyframe);
  const deleteKeyframe = useEditorStore((s) => s.deleteKeyframe);
  const setThumbnail = useEditorStore((s) => s.setThumbnail);
  const thumbnail = useEditorStore((s) => s.thumbnails[kf.id]);

  const jumpTo = () => {
    mapRef.current?.jumpTo({ ...kf.camera, zoom: kf.camera.zoom - currentZoomOffset() });
  };

  const updateFromView = async () => {
    const camera = cameraFromMap();
    const map = mapRef.current;
    if (!camera || !map) return;
    updateKeyframe(kf.id, { camera });
    setThumbnail(kf.id, await captureThumbnail(map));
  };

  return (
    <Card
      ref={setNodeRef}
      withBorder
      padding="xs"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <div {...attributes} {...listeners} style={{ cursor: 'grab', alignSelf: 'center' }}>⠿</div>
        <Stack gap={6} style={{ flex: 1 }}>
          <Group gap="xs" justify="space-between">
            <Text size="sm" fw={600} style={{ cursor: 'pointer' }} onClick={jumpTo}>
              Keyframe {index + 1}
            </Text>
            <Group gap={4}>
              <Tooltip label="Update from current view">
                <ActionIcon size="sm" variant="subtle" onClick={updateFromView}>↺</ActionIcon>
              </Tooltip>
              <Tooltip label="Delete keyframe">
                <ActionIcon size="sm" variant="subtle" color="red" onClick={() => deleteKeyframe(kf.id)}>✕</ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          {thumbnail && <Image src={thumbnail} radius="sm" onClick={jumpTo} style={{ cursor: 'pointer' }} />}
          <NumberInput
            label="Hold (ms)" size="xs" min={0} step={100} value={kf.holdMs}
            onChange={(v) => updateKeyframe(kf.id, { holdMs: Number(v) || 0 })}
          />
          {!isLast && (
            <>
              <NumberInput
                label="Transition (ms)" size="xs" min={0} step={100} value={kf.transition.durationMs}
                onChange={(v) =>
                  updateKeyframe(kf.id, { transition: { ...kf.transition, durationMs: Number(v) || 0 } })
                }
              />
              <Select
                label="Easing" size="xs" allowDeselect={false}
                data={EASING_OPTIONS} value={kf.transition.easing}
                onChange={(v) =>
                  v && updateKeyframe(kf.id, { transition: { ...kf.transition, easing: v as EasingName } })
                }
              />
            </>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

export function KeyframePanel() {
  const keyframes = useEditorStore((s) => s.project.keyframes);
  const moveKeyframe = useEditorStore((s) => s.moveKeyframe);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const toIndex = keyframes.findIndex((k) => k.id === over.id);
    moveKeyframe(String(active.id), toIndex);
  };

  return (
    <Stack gap="sm" style={{ overflowY: 'auto' }}>
      <Text fw={600} size="sm">Keyframes</Text>
      {keyframes.length === 0 && (
        <Text size="xs" c="dimmed">Frame a view on the map, then press “Capture keyframe”.</Text>
      )}
      <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={keyframes.map((k) => k.id)} strategy={verticalListSortingStrategy}>
          <Stack gap="xs">
            {keyframes.map((kf, i) => (
              <KeyframeCard key={kf.id} kf={kf} index={i} isLast={i === keyframes.length - 1} />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
    </Stack>
  );
}
```

`src/App.tsx` (replace entirely):

```tsx
import { EditorShell } from './editor/AppShell';
import { SettingsPanel } from './editor/SettingsPanel';
import { MapView } from './editor/MapView';
import { KeyframePanel } from './editor/KeyframePanel';

export default function App() {
  return <EditorShell navbar={<KeyframePanel />} aside={<SettingsPanel />} main={<MapView />} />;
}
```

- [ ] **Step 4: Verify**

Run: `npm test` → PASS. `npm run build` → clean. `npm run dev`:
- Capture two keyframes at different views: cards appear with thumbnails.
- Click a card title/thumbnail → camera jumps to that view exactly (compose against the letterbox edges to confirm framing round-trips).
- Drag cards to reorder; edit hold/transition/easing; last card shows no transition fields.
- Delete a card; remaining cards renumber.

- [ ] **Step 5: Commit**

```bash
git add src/editor/ src/App.tsx
git commit -m "Add keyframe capture, thumbnails, reorder, and timing fields"
```

---

### Task 7: Preview bar with play/pause and scrubbing

**Files:**
- Create: `src/editor/PreviewBar.tsx`, `src/editor/usePlayback.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `sceneAt`, `computeTimeline`, `applyScene` is NOT used (camera needs the zoom offset) — instead `applyElements` + a manual `jumpTo`; `mapRef`, `currentZoomOffset`, store playback state.
- Produces: `PreviewBar` (footer). Convention Task 8/Plan 3 rely on: preview never mutates the project; `applyPreviewFrame(timeMs)` is the single place engine scenes reach the editor map.

- [ ] **Step 1: Playback hook**

`src/editor/usePlayback.ts`:

```ts
import { useEffect, useMemo, useRef } from 'react';
import { useEditorStore } from './store';
import { computeTimeline } from '../engine/timeline';
import { sceneAt } from '../engine/scene';
import { currentZoomOffset, mapRef } from './mapRef';
import { applyElements } from '../map/applyScene';

export function applyPreviewFrame(timeMs: number): void {
  const map = mapRef.current;
  const { project } = useEditorStore.getState();
  if (!map || project.keyframes.length === 0) return; // sceneAt throws on empty projects
  const scene = sceneAt(project, timeMs);
  map.jumpTo({
    center: scene.camera.center,
    zoom: scene.camera.zoom - currentZoomOffset(),
    bearing: scene.camera.bearing,
    pitch: scene.camera.pitch,
  });
  applyElements(map, project, scene.elements);
}

export function usePlayback() {
  const playing = useEditorStore((s) => s.playing);
  const keyframes = useEditorStore((s) => s.project.keyframes);
  const timeline = useMemo(() => {
    const project = useEditorStore.getState().project;
    return keyframes.length > 0 ? computeTimeline(project) : null;
  }, [keyframes]);

  const rafRef = useRef(0);
  useEffect(() => {
    if (!playing || !timeline) return;
    let last = performance.now();
    const frame = (now: number) => {
      const store = useEditorStore.getState();
      const next = store.timeMs + (now - last);
      last = now;
      if (next >= timeline.totalMs) {
        store.setTimeMs(timeline.totalMs);
        store.setPlaying(false);
        applyPreviewFrame(timeline.totalMs);
        return;
      }
      store.setTimeMs(next);
      applyPreviewFrame(next);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, timeline]);

  return timeline;
}
```

- [ ] **Step 2: Preview bar UI**

`src/editor/PreviewBar.tsx`:

```tsx
import { ActionIcon, Button, Group, Slider, Text } from '@mantine/core';
import { useEditorStore } from './store';
import { applyPreviewFrame, usePlayback } from './usePlayback';
import { syncElementLayers } from '../map/layerSync';
import { applyElements } from '../map/applyScene';
import { allShownStates } from './editorScene';
import { mapRef } from './mapRef';

function fmt(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

export function PreviewBar() {
  const timeline = usePlayback();
  const mode = useEditorStore((s) => s.mode);
  const playing = useEditorStore((s) => s.playing);
  const timeMs = useEditorStore((s) => s.timeMs);
  const setMode = useEditorStore((s) => s.setMode);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const setTimeMs = useEditorStore((s) => s.setTimeMs);

  if (!timeline) {
    return <Text size="sm" c="dimmed">Capture a keyframe to enable preview.</Text>;
  }

  const marks = [...timeline.arrivalMs.values()].map((ms) => ({ value: ms }));

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    setMode('preview');
    if (timeMs >= timeline.totalMs) setTimeMs(0);
    setPlaying(true);
  };

  const scrub = (value: number) => {
    setMode('preview');
    setPlaying(false);
    setTimeMs(value);
    applyPreviewFrame(value);
  };

  const exitPreview = () => {
    setPlaying(false);
    setMode('edit');
    const map = mapRef.current;
    const { project } = useEditorStore.getState();
    if (map && map.isStyleLoaded()) {
      syncElementLayers(map, project);
      applyElements(map, project, allShownStates(project.elements));
    }
  };

  return (
    <Group gap="md" wrap="nowrap">
      <ActionIcon size="lg" variant="filled" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </ActionIcon>
      <Slider
        style={{ flex: 1 }}
        min={0}
        max={timeline.totalMs}
        step={1000 / 60}
        value={Math.min(timeMs, timeline.totalMs)}
        onChange={scrub}
        marks={marks}
        label={fmt}
      />
      <Text size="xs" w={90} ta="right">{fmt(Math.min(timeMs, timeline.totalMs))} / {fmt(timeline.totalMs)}</Text>
      {mode === 'preview' && (
        <Button size="xs" variant="light" onClick={exitPreview}>Exit preview</Button>
      )}
    </Group>
  );
}
```

`src/App.tsx` (replace entirely):

```tsx
import { EditorShell } from './editor/AppShell';
import { SettingsPanel } from './editor/SettingsPanel';
import { MapView } from './editor/MapView';
import { KeyframePanel } from './editor/KeyframePanel';
import { PreviewBar } from './editor/PreviewBar';

export default function App() {
  return (
    <EditorShell
      navbar={<KeyframePanel />}
      aside={<SettingsPanel />}
      main={<MapView />}
      footer={<PreviewBar />}
    />
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm test` → PASS. `npm run build` → clean. `npm run dev`:
- With zero keyframes the footer shows the hint; no crash (zero-keyframe guard).
- Capture 2–3 keyframes at different views/zooms. Press play: camera flies keyframe to keyframe with holds; playhead advances; playback stops at the end.
- Scrub the slider: the map shows the exact instant, including mid-flight camera; keyframe tick marks sit at hold starts.
- During preview, map interaction is blocked (the overlay); "Exit preview" restores free panning and full element display.
- Capture is disabled during preview.

- [ ] **Step 4: Commit**

```bash
git add src/editor/ src/App.tsx
git commit -m "Add playback loop, scrubber, and preview mode"
```

---

### Task 8: Persistence — save/open, autosave, restore

**Files:**
- Create: `src/editor/persistence.ts`, `src/editor/ProjectMenu.tsx`
- Modify: `src/App.tsx`
- Test: `src/editor/persistence.test.ts`

**Interfaces:**
- Consumes: `serializeProject`, `parseProject`, `ProjectFormatError`, `blankProject`, `useEditorStore`.
- Produces:
  - `AUTOSAVE_KEY = 'michigatari-autosave'`
  - `readAutosave(): Project | null` — null when absent or unparseable
  - `writeAutosave(project: Project): void`, `clearAutosave(): void`
  - `startAutosave(): () => void` — subscribes to the store, throttled trailing-edge 2000 ms, returns unsubscribe
  - `saveProjectFile(project: Project): Promise<void>` — File System Access API when available, `<a download>` fallback
  - `openProjectFile(file: File): Promise<Project>` — rejects with `ProjectFormatError` on bad files
  - `ProjectMenu` header component: New / Open / Save buttons + boot-time restore prompt

- [ ] **Step 1: Write the failing test**

`src/editor/persistence.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { AUTOSAVE_KEY, clearAutosave, readAutosave, startAutosave, writeAutosave } from './persistence';
import { blankProject, useEditorStore } from './store';

beforeEach(() => {
  localStorage.clear();
  useEditorStore.getState().loadProject(blankProject());
});

it('round-trips a project through autosave storage', () => {
  const project = blankProject();
  project.settings.fps = 60;
  writeAutosave(project);
  expect(readAutosave()).toEqual(project);
});

it('returns null for absent or corrupt autosaves', () => {
  expect(readAutosave()).toBeNull();
  localStorage.setItem(AUTOSAVE_KEY, 'not json');
  expect(readAutosave()).toBeNull();
});

it('clearAutosave removes the entry', () => {
  writeAutosave(blankProject());
  clearAutosave();
  expect(readAutosave()).toBeNull();
});

it('startAutosave writes after edits, throttled', () => {
  vi.useFakeTimers();
  const stop = startAutosave();
  useEditorStore.getState().updateSettings({ fps: 60 });
  expect(readAutosave()).toBeNull(); // trailing throttle: nothing yet
  vi.advanceTimersByTime(2100);
  expect(readAutosave()?.settings.fps).toBe(60);
  stop();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./persistence`.

- [ ] **Step 3: Implement persistence**

`src/editor/persistence.ts`:

```ts
import type { Project } from '../engine/types';
import { parseProject, serializeProject } from '../engine/project';
import { useEditorStore } from './store';

export const AUTOSAVE_KEY = 'michigatari-autosave';

export function writeAutosave(project: Project): void {
  localStorage.setItem(AUTOSAVE_KEY, serializeProject(project));
}

export function readAutosave(): Project | null {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (raw === null) return null;
  try {
    return parseProject(raw);
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}

// Trailing-edge throttle: at most one write per 2s, always capturing the
// latest project state at fire time.
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = useEditorStore.subscribe((state, prev) => {
    if (state.project === prev.project || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      writeAutosave(useEditorStore.getState().project);
    }, 2000);
  });
  return () => {
    if (timer !== null) clearTimeout(timer);
    unsubscribe();
  };
}

export async function saveProjectFile(project: Project): Promise<void> {
  const json = serializeProject(project);
  const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> })
    .showSaveFilePicker;
  if (picker) {
    const handle = await picker({
      suggestedName: 'michigatari-project.json',
      types: [{ description: 'Michigatari project', accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'michigatari-project.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function openProjectFile(file: File): Promise<Project> {
  return parseProject(await file.text()); // throws ProjectFormatError on bad files
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Project menu with restore prompt**

`src/editor/ProjectMenu.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Button, Group, Modal, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEditorStore } from './store';
import {
  clearAutosave, openProjectFile, readAutosave, saveProjectFile, startAutosave,
} from './persistence';
import { ProjectFormatError } from '../engine/project';

export function ProjectMenu() {
  const loadProject = useEditorStore((s) => s.loadProject);
  const newProject = useEditorStore((s) => s.newProject);
  const fileInput = useRef<HTMLInputElement>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  useEffect(() => {
    if (readAutosave() !== null) setRestoreOpen(true);
    return startAutosave();
  }, []);

  const restore = () => {
    const saved = readAutosave();
    if (saved) loadProject(saved);
    setRestoreOpen(false);
  };

  const discardRestore = () => {
    clearAutosave();
    setRestoreOpen(false);
  };

  const onOpenFile = async (file: File | null) => {
    if (!file) return;
    try {
      loadProject(await openProjectFile(file));
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Could not open project',
        message: err instanceof ProjectFormatError ? err.message : 'Unexpected error reading the file.',
      });
    }
  };

  const save = async () => {
    try {
      await saveProjectFile(useEditorStore.getState().project);
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return; // user cancelled the picker
      notifications.show({ color: 'red', title: 'Save failed', message: String(err) });
    }
  };

  return (
    <Group gap="xs">
      <Button size="xs" variant="default" onClick={() => { clearAutosave(); newProject(); }}>New</Button>
      <Button size="xs" variant="default" onClick={() => fileInput.current?.click()}>Open</Button>
      <Button size="xs" onClick={save}>Save</Button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void onOpenFile(e.currentTarget.files?.[0] ?? null);
          e.currentTarget.value = '';
        }}
      />
      <Modal opened={restoreOpen} onClose={discardRestore} title="Restore unsaved work?">
        <Text size="sm" mb="md">An autosaved project from a previous session was found.</Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={discardRestore}>Discard</Button>
          <Button onClick={restore}>Restore</Button>
        </Group>
      </Modal>
    </Group>
  );
}
```

`src/App.tsx`: add `header={<ProjectMenu />}` to `EditorShell` (import it; other slots unchanged).

- [ ] **Step 6: Verify**

Run: `npm test` → PASS. `npm run build` → clean. `npm run dev`:
- Capture keyframes, wait ~2s, reload → restore prompt appears; Restore brings the keyframes back (thumbnails absent — regenerate via "Update from view"; acceptable).
- Save downloads/picks a JSON file; New (after clearing) starts blank; Open on the saved file round-trips; Open on a non-JSON file shows the red notification and keeps the current project.

- [ ] **Step 7: Commit**

```bash
git add src/editor/ src/App.tsx
git commit -m "Add project save/open, autosave, and restore prompt"
```

---

### Task 9: Polish pass and README

**Files:**
- Modify: `README.md`, `src/editor/MapView.css` (only if the visual pass below finds sizing bugs)

**Interfaces:**
- Consumes: everything.
- Produces: shippable Plan 2a.

- [ ] **Step 1: Full visual pass**

Run `npm run dev` and walk the complete flow: new project → capture 3 keyframes (mixed zooms/bearings/pitch) → reorder → edit timings → play → scrub → exit preview → switch aspect 9:16 and confirm letterbox + capture still work → save → new → open → play again. Fix only breakages found (report anything nontrivial rather than redesigning).

- [ ] **Step 2: Update README**

In `README.md`, replace the Status section body with:

```markdown
Camera animations are fully authorable: capture keyframes on the map,
arrange and time them, preview with scrubbing, and save/load projects.
Animated map elements (markers, labels, routes, region outlines) and video
export are in progress.
```

And under Development, replace the dev-script comment line with:

```markdown
    npm run dev    # the editor
```

- [ ] **Step 3: Verify and commit**

Run: `npm test` → PASS. `npm run build` → clean.

```bash
git add -A
git commit -m "Polish editor core and update README status"
```

---

## Out of Scope for Plan 2a

- Element authoring UI (markers, labels, routes, regions), Nominatim/OSRM providers, geometry baking/refresh — Plan 2b.
- Video export (offscreen map at reference size with `pixelRatio = exportWidth / 1920`, WebCodecs, muxing) — Plan 3.
- Custom style URL editing UI (the store supports it; no UI until someone needs it).
