# Plan 3: Video Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a project as an MP4 (H.264) or WebM (VP9) video file, rendered frame-by-frame and deterministic — spec §3.6, §9, §10 — completing Michigatari v1.

**Architecture:** An offscreen MapLibre map at the reference CSS size with `pixelRatio = exportWidth / referenceWidth` renders exact pixels (keyframes already store reference zoom, so `syncElementLayers` once + `applyScene(map, project, sceneAt(project, t))` per frame works verbatim — the contract pinned by the fake-map round-trip test). Each frame: apply scene → wait for the map `idle` event (timeout ~10s, one retry, then stop and surface per §10) → wrap the canvas in a `VideoFrame` → WebCodecs `VideoEncoder` → mp4-muxer/webm-muxer → File System Access stream (Chromium) or in-memory buffer + download (fallback). Pure math (frame counts, timestamps, encoder configs) lives in tested modules; the browser-only pipeline is verified end-to-end by the controller.

**Tech Stack:** Existing stack + `mp4-muxer` and `webm-muxer` (Vanilagy's muxers, MIT). WebCodecs `VideoEncoder` (no polyfill — capability-probed per §10).

## Global Constraints

- Deterministic: same project file → same video. Frame `i` renders at `t = min(i × 1000/fps, totalMs)`; never realtime capture.
- Export pixel dimensions: 1080p → 1920×1080, 1440p → 2560×1440, 4k → 3840×2160 (16:9; swapped for 9:16). Achieved via reference CSS size + `pixelRatio` — the engine and applier are NOT modified by this plan.
- §10 stall handling: idle-wait timeout 10 000 ms, one retry (`triggerRepaint`), then the export stops with a clear surfaced error ("pause and surface" is implemented as stop-with-message; the user restarts the export — resumable pause is out of scope, documented here as the plan's interpretation).
- §10 capability probe: `VideoEncoder.isConfigSupported` checked per format at the project's exact dimensions/fps before the dialog offers it; unsupported formats disabled with a plain-language message; neither supported → dialog explains the browser lacks WebCodecs support.
- Keyframe interval: an encoder key frame every 2 seconds (`i % (fps * 2) === 0`).
- Encoder backpressure: if `encoder.encodeQueueSize > 4`, await the encoder's `dequeue` event before continuing.
- The export map keeps the (compact) attribution control visible — exported videos must carry OSM/OpenFreeMap attribution.
- Muxer API drift rule: the code below targets mp4-muxer/webm-muxer's documented APIs; if the installed version's `.d.ts` differs, adapt minimally and disclose the deviation in the report — do not restructure around it.
- `src/engine/` untouched by this plan. TypeScript strict; `npm test`, `npm run build`, `npm run lint` stay green. Commits plain, **no AI attribution, no Co-Authored-By**. Stage only your own files (explicit `git add` paths).

---

### Task 1: Dependencies and pure export math

**Files:**
- Modify: `package.json` (via npm install)
- Create: `src/export/timing.ts`, `src/export/encoderConfig.ts`
- Test: `src/export/timing.test.ts`, `src/export/encoderConfig.test.ts`

**Interfaces:**
- Consumes: `Settings`, `REFERENCE_VIEWPORT` from `src/engine/viewport`.
- Produces (later tasks rely on verbatim):
  - `timing.ts`: `frameCount(totalMs: number, fps: number): number` (round(totalMs·fps/1000) + 1, min 1 — includes the final instant), `frameTimeMs(i: number, fps: number, totalMs: number): number` (min(i·1000/fps, totalMs)), `frameTimestampUs(i: number, fps: number): number` (round(i·1e6/fps))
  - `encoderConfig.ts`: `ExportFormat = 'mp4' | 'webm'`; `exportDimensions(settings: Settings): { width: number; height: number }`; `exportPixelRatio(settings: Settings): number`; `buildEncoderConfig(format: ExportFormat, settings: Settings): VideoEncoderConfig` (mp4 → `avc1.640034` for 4k@60 else `avc1.640033`, plus `avc: { format: 'avc' }`; webm → `vp09.00.51.08`; `bitrate = round(width·height·fps·0.1)`; `framerate = fps`)

- [ ] **Step 1: Install muxers**

```bash
npm install mp4-muxer webm-muxer
```

- [ ] **Step 2: Write the failing tests**

`src/export/timing.test.ts`:

```ts
import { expect, it } from 'vitest';
import { frameCount, frameTimeMs, frameTimestampUs } from './timing';

it('counts frames including the final instant', () => {
  expect(frameCount(1000, 30)).toBe(31); // 0..1000ms inclusive
  expect(frameCount(7000, 30)).toBe(211);
  expect(frameCount(0, 30)).toBe(1); // degenerate project: one frame
});

it('clamps the last frame time to the timeline end', () => {
  expect(frameTimeMs(0, 30, 7000)).toBe(0);
  expect(frameTimeMs(210, 30, 7000)).toBe(7000);
  expect(frameTimeMs(209, 30, 7000)).toBeCloseTo(6966.666, 2);
});

it('produces integer microsecond timestamps', () => {
  expect(frameTimestampUs(0, 30)).toBe(0);
  expect(frameTimestampUs(1, 30)).toBe(33333);
  expect(frameTimestampUs(3, 60)).toBe(50000);
});
```

`src/export/encoderConfig.test.ts`:

```ts
import { expect, it } from 'vitest';
import { buildEncoderConfig, exportDimensions, exportPixelRatio } from './encoderConfig';
import type { Settings } from '../engine/types';

function s(resolution: Settings['resolution'], aspect: Settings['aspect'], fps: Settings['fps']): Settings {
  return { resolution, aspect, fps, styleUrl: '' };
}

it('maps settings to export pixel dimensions', () => {
  expect(exportDimensions(s('1080p', '16:9', 30))).toEqual({ width: 1920, height: 1080 });
  expect(exportDimensions(s('4k', '16:9', 60))).toEqual({ width: 3840, height: 2160 });
  expect(exportDimensions(s('4k', '9:16', 30))).toEqual({ width: 2160, height: 3840 });
});

it('derives pixelRatio from export width over reference width', () => {
  expect(exportPixelRatio(s('1080p', '16:9', 30))).toBe(1);
  expect(exportPixelRatio(s('4k', '16:9', 30))).toBe(2);
  expect(exportPixelRatio(s('4k', '9:16', 30))).toBe(2); // 2160/1080
});

it('picks H.264 level 5.2 only for 4k60', () => {
  expect(buildEncoderConfig('mp4', s('4k', '16:9', 60)).codec).toBe('avc1.640034');
  expect(buildEncoderConfig('mp4', s('4k', '16:9', 30)).codec).toBe('avc1.640033');
  expect(buildEncoderConfig('mp4', s('1080p', '16:9', 60)).codec).toBe('avc1.640033');
});

it('builds complete configs with bitrate and framerate', () => {
  const cfg = buildEncoderConfig('webm', s('1080p', '16:9', 30));
  expect(cfg.codec).toBe('vp09.00.51.08');
  expect(cfg.width).toBe(1920);
  expect(cfg.height).toBe(1080);
  expect(cfg.framerate).toBe(30);
  expect(cfg.bitrate).toBe(Math.round(1920 * 1080 * 30 * 0.1));
  expect(buildEncoderConfig('mp4', s('1080p', '16:9', 30)).avc).toEqual({ format: 'avc' });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test` → FAIL, cannot resolve `./timing` / `./encoderConfig`.

- [ ] **Step 4: Implement**

`src/export/timing.ts`:

```ts
// Frame i of an export renders the timeline instant min(i * 1000/fps, totalMs).
// The count includes a final frame at exactly totalMs so the video ends on the
// last keyframe's settled state.
export function frameCount(totalMs: number, fps: number): number {
  return Math.max(1, Math.round((totalMs * fps) / 1000) + 1);
}

export function frameTimeMs(i: number, fps: number, totalMs: number): number {
  return Math.min((i * 1000) / fps, totalMs);
}

export function frameTimestampUs(i: number, fps: number): number {
  return Math.round((i * 1_000_000) / fps);
}
```

`src/export/encoderConfig.ts`:

```ts
import type { Settings } from '../engine/types';
import { REFERENCE_VIEWPORT } from '../engine/viewport';

export type ExportFormat = 'mp4' | 'webm';

const SHORT_SIDE: Record<Settings['resolution'], number> = {
  '1080p': 1080,
  '1440p': 1440,
  '4k': 2160,
};

export function exportDimensions(settings: Settings): { width: number; height: number } {
  const short = SHORT_SIDE[settings.resolution];
  const long = Math.round((short * 16) / 9);
  return settings.aspect === '16:9' ? { width: long, height: short } : { width: short, height: long };
}

export function exportPixelRatio(settings: Settings): number {
  return exportDimensions(settings).width / REFERENCE_VIEWPORT[settings.aspect].width;
}

export function buildEncoderConfig(format: ExportFormat, settings: Settings): VideoEncoderConfig {
  const { width, height } = exportDimensions(settings);
  const fps = settings.fps;
  const bitrate = Math.round(width * height * fps * 0.1);
  if (format === 'mp4') {
    // High profile; level 5.2 is required for 3840×2160@60, 5.1 covers the rest
    const codec = settings.resolution === '4k' && fps === 60 ? 'avc1.640034' : 'avc1.640033';
    return { codec, width, height, bitrate, framerate: fps, avc: { format: 'avc' } };
  }
  return { codec: 'vp09.00.51.08', width, height, bitrate, framerate: fps };
}
```

- [ ] **Step 5: Run tests to verify they pass; commit**

Run: `npm test` → PASS (84 + 7 new = 91). Build + lint clean.

```bash
git add package.json package-lock.json src/export/
git commit -m "Add muxer dependencies and pure export timing and encoder config"
```

---

### Task 2: Capability probe and idle waiter

**Files:**
- Create: `src/export/probe.ts`, `src/export/waitForIdle.ts`
- Test: `src/export/probe.test.ts`, `src/export/waitForIdle.test.ts`

**Interfaces:**
- Consumes: `buildEncoderConfig`, `ExportFormat`.
- Produces:
  - `probe.ts`: `probeExportFormats(settings: Settings, isSupported?: (config: VideoEncoderConfig) => Promise<{ supported?: boolean }>): Promise<{ mp4: boolean; webm: boolean }>` — defaults to `VideoEncoder.isConfigSupported` when WebCodecs exists, resolves all-false when it doesn't; injectable for tests.
  - `waitForIdle.ts`: `IdleMap = { once(ev: 'idle', cb: () => void): void; off(ev: 'idle', cb: () => void): void }`; `waitForIdle(map: IdleMap, timeoutMs: number): Promise<'idle' | 'timeout'>`.

- [ ] **Step 1: Write the failing tests**

`src/export/probe.test.ts`:

```ts
import { expect, it, vi } from 'vitest';
import { probeExportFormats } from './probe';
import type { Settings } from '../engine/types';

const settings: Settings = { resolution: '1080p', aspect: '16:9', fps: 30, styleUrl: '' };

it('reports each format from the injected support check', async () => {
  const isSupported = vi.fn(async (config: VideoEncoderConfig) => ({
    supported: config.codec.startsWith('avc'),
  }));
  await expect(probeExportFormats(settings, isSupported)).resolves.toEqual({ mp4: true, webm: false });
  expect(isSupported).toHaveBeenCalledTimes(2);
});

it('treats a rejected or empty support check as unsupported', async () => {
  const isSupported = vi.fn(async (config: VideoEncoderConfig) =>
    config.codec.startsWith('vp09') ? Promise.reject(new Error('boom')) : {},
  ) as unknown as (c: VideoEncoderConfig) => Promise<{ supported?: boolean }>;
  await expect(probeExportFormats(settings, isSupported)).resolves.toEqual({ mp4: false, webm: false });
});

it('resolves all-false when WebCodecs is absent and no check is injected', async () => {
  // node test environment has no VideoEncoder global
  await expect(probeExportFormats(settings)).resolves.toEqual({ mp4: false, webm: false });
});
```

`src/export/waitForIdle.test.ts`:

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { waitForIdle } from './waitForIdle';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function fakeIdleMap() {
  const handlers = new Set<() => void>();
  return {
    once: (_: 'idle', cb: () => void) => handlers.add(cb),
    off: (_: 'idle', cb: () => void) => handlers.delete(cb),
    fireIdle: () => {
      for (const h of [...handlers]) {
        handlers.delete(h);
        h();
      }
    },
    pending: () => handlers.size,
  };
}

it('resolves idle when the event fires before the timeout', async () => {
  const map = fakeIdleMap();
  const p = waitForIdle(map, 10_000);
  map.fireIdle();
  await expect(p).resolves.toBe('idle');
});

it('resolves timeout and detaches the listener when the event never fires', async () => {
  const map = fakeIdleMap();
  const p = waitForIdle(map, 10_000);
  vi.advanceTimersByTime(10_001);
  await expect(p).resolves.toBe('timeout');
  expect(map.pending()).toBe(0); // listener removed, no leak
});

it('cancels the timeout when idle fires first', async () => {
  const map = fakeIdleMap();
  const p = waitForIdle(map, 10_000);
  map.fireIdle();
  await p;
  vi.advanceTimersByTime(20_000); // must not throw or double-settle
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → FAIL, cannot resolve modules.

- [ ] **Step 3: Implement**

`src/export/probe.ts`:

```ts
import type { Settings } from '../engine/types';
import { buildEncoderConfig } from './encoderConfig';

type SupportCheck = (config: VideoEncoderConfig) => Promise<{ supported?: boolean }>;

function defaultCheck(): SupportCheck | null {
  if (typeof VideoEncoder === 'undefined') return null;
  return (config) => VideoEncoder.isConfigSupported(config);
}

export async function probeExportFormats(
  settings: Settings,
  isSupported: SupportCheck | null = defaultCheck(),
): Promise<{ mp4: boolean; webm: boolean }> {
  if (!isSupported) return { mp4: false, webm: false };
  const check = async (format: 'mp4' | 'webm') => {
    try {
      const result = await isSupported(buildEncoderConfig(format, settings));
      return result.supported === true;
    } catch {
      return false;
    }
  };
  const [mp4, webm] = await Promise.all([check('mp4'), check('webm')]);
  return { mp4, webm };
}
```

`src/export/waitForIdle.ts`:

```ts
export interface IdleMap {
  once(ev: 'idle', cb: () => void): void;
  off(ev: 'idle', cb: () => void): void;
}

export function waitForIdle(map: IdleMap, timeoutMs: number): Promise<'idle' | 'timeout'> {
  return new Promise((resolve) => {
    const onIdle = () => {
      clearTimeout(timer);
      resolve('idle');
    };
    const timer = setTimeout(() => {
      map.off('idle', onIdle);
      resolve('timeout');
    }, timeoutMs);
    map.once('idle', onIdle);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass; commit**

Run: `npm test` → PASS (97). Build + lint clean.

```bash
git add src/export/probe.ts src/export/probe.test.ts src/export/waitForIdle.ts src/export/waitForIdle.test.ts
git commit -m "Add export capability probe and idle waiter"
```

---

### Task 3: Export map and frame renderer

**Files:**
- Create: `src/export/renderFrames.ts`

**Interfaces:**
- Consumes: `syncElementLayers`, `applyScene`, `sceneAt`, `computeTimeline`, `frameCount`/`frameTimeMs`, `exportPixelRatio`, `waitForIdle`, `REFERENCE_VIEWPORT`.
- Produces:
  - `ExportStalledError extends Error` (name set; message names the frame index)
  - `createExportMap(project: Project): { map: MapLibreMap; dispose(): void }` — appends a hidden fixed-position container sized to the reference CSS dimensions (`REFERENCE_VIEWPORT[aspect]`), creates a MapLibre map with `pixelRatio: exportPixelRatio(settings)`, `preserveDrawingBuffer: true` (canvas pixels must survive until `VideoFrame` capture), `interactive: false`, compact attribution; `dispose` removes map and container.
  - `renderFrames(map: MapLibreMap, project: Project, hooks: { onFrame(canvas: HTMLCanvasElement, frameIndex: number, total: number): Promise<void> | void; shouldCancel?(): boolean }): Promise<void>` — waits for initial style `load` + `idle`, runs `syncElementLayers` once, then per frame: `applyScene` at `frameTimeMs(i)` → `waitForIdle(map, 10_000)`; on timeout `map.triggerRepaint()` and one more `waitForIdle`; second timeout throws `ExportStalledError`. Calls `await hooks.onFrame(...)` after each settled frame; returns early (resolves) if `shouldCancel()`.

**No unit tests** — this module drives a live WebGL map; the pure pieces it composes are already tested, and Task 6 verifies end-to-end. Suite must stay green and build clean.

- [ ] **Step 1: Implement**

`src/export/renderFrames.ts`:

```ts
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Project } from '../engine/types';
import { REFERENCE_VIEWPORT } from '../engine/viewport';
import { computeTimeline } from '../engine/timeline';
import { sceneAt } from '../engine/scene';
import { applyScene } from '../map/applyScene';
import { syncElementLayers } from '../map/layerSync';
import { exportPixelRatio } from './encoderConfig';
import { frameCount, frameTimeMs } from './timing';
import { waitForIdle } from './waitForIdle';

export class ExportStalledError extends Error {
  constructor(frameIndex: number) {
    super(
      `Map tiles stalled while rendering frame ${frameIndex + 1}. ` +
        'Check your network connection and try the export again.',
    );
    this.name = 'ExportStalledError';
  }
}

export function createExportMap(project: Project): { map: MapLibreMap; dispose(): void } {
  const { width, height } = REFERENCE_VIEWPORT[project.settings.aspect];
  const container = document.createElement('div');
  // offscreen but laid out: MapLibre needs real dimensions to render
  container.style.cssText =
    `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(container);
  const map = new maplibregl.Map({
    container,
    style: project.settings.styleUrl,
    pixelRatio: exportPixelRatio(project.settings),
    interactive: false,
    preserveDrawingBuffer: true, // canvas pixels must survive until VideoFrame capture
    attributionControl: { compact: true }, // exported video carries OSM attribution
  });
  return {
    map,
    dispose: () => {
      map.remove();
      container.remove();
    },
  };
}

export async function renderFrames(
  map: MapLibreMap,
  project: Project,
  hooks: {
    onFrame(canvas: HTMLCanvasElement, frameIndex: number, total: number): Promise<void> | void;
    shouldCancel?(): boolean;
  },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    map.once('load', () => resolve());
    map.once('error', (e) => reject((e as { error?: Error }).error ?? new Error('Map failed to load.')));
  });
  syncElementLayers(map, project);

  const timeline = computeTimeline(project);
  const fps = project.settings.fps;
  const total = frameCount(timeline.totalMs, fps);

  for (let i = 0; i < total; i++) {
    if (hooks.shouldCancel?.()) return;
    applyScene(map, project, sceneAt(project, frameTimeMs(i, fps, timeline.totalMs), timeline));
    let settled = await waitForIdle(map, 10_000);
    if (settled === 'timeout') {
      map.triggerRepaint();
      settled = await waitForIdle(map, 10_000);
    }
    if (settled === 'timeout') throw new ExportStalledError(i);
    await hooks.onFrame(map.getCanvas(), i, total);
  }
}
```

- [ ] **Step 2: Verify and commit**

Run: `npm test` (97 green — nothing new), `npm run build`, `npm run lint` clean.

```bash
git add src/export/renderFrames.ts
git commit -m "Add offscreen export map and frame renderer"
```

---

### Task 4: Encode and mux pipeline

**Files:**
- Create: `src/export/exportVideo.ts`

**Interfaces:**
- Consumes: everything above plus `mp4-muxer` / `webm-muxer`.
- Produces (Task 5 calls this):
  - `ExportTarget = { kind: 'stream'; stream: FileSystemWritableFileStream } | { kind: 'buffer' }`
  - `ExportResult = { blob: Blob | null }` — blob non-null only for buffer targets (`video/mp4` or `video/webm`)
  - `exportVideo(project: Project, options: { format: ExportFormat; target: ExportTarget; onProgress?(frameIndex: number, total: number): void; shouldCancel?(): boolean }): Promise<ExportResult>` — creates the export map, encodes every frame (keyframe every 2 s, backpressure at `encodeQueueSize > 4` via the `dequeue` event, integer µs timestamps), finalizes the muxer, closes/aborts the stream appropriately, ALWAYS disposes the map (finally). On cancel: aborts cleanly (stream target: `stream.abort()` if available else close-and-ignore; buffer: returns `{ blob: null }`). Encoder errors reject.

- [ ] **Step 1: Implement**

`src/export/exportVideo.ts`:

```ts
import * as Mp4Muxer from 'mp4-muxer';
import * as WebmMuxer from 'webm-muxer';
import type { Project } from '../engine/types';
import { buildEncoderConfig, exportDimensions, type ExportFormat } from './encoderConfig';
import { frameTimestampUs } from './timing';
import { createExportMap, renderFrames } from './renderFrames';

export type ExportTarget =
  | { kind: 'stream'; stream: FileSystemWritableFileStream }
  | { kind: 'buffer' };

export interface ExportResult {
  blob: Blob | null;
}

interface VideoMuxer {
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  finalize(): void;
}

function createMuxer(
  format: ExportFormat,
  project: Project,
  target: ExportTarget,
): { muxer: VideoMuxer; takeBuffer: () => ArrayBuffer | null } {
  const { width, height } = exportDimensions(project.settings);
  if (format === 'mp4') {
    const muxTarget =
      target.kind === 'stream'
        ? new Mp4Muxer.FileSystemWritableFileStreamTarget(target.stream)
        : new Mp4Muxer.ArrayBufferTarget();
    const muxer = new Mp4Muxer.Muxer({
      target: muxTarget,
      video: { codec: 'avc', width, height },
      fastStart: target.kind === 'buffer' ? 'in-memory' : false,
      firstTimestampBehavior: 'offset',
    });
    return {
      muxer,
      takeBuffer: () => (muxTarget instanceof Mp4Muxer.ArrayBufferTarget ? muxTarget.buffer : null),
    };
  }
  const muxTarget =
    target.kind === 'stream'
      ? new WebmMuxer.FileSystemWritableFileStreamTarget(target.stream)
      : new WebmMuxer.ArrayBufferTarget();
  const muxer = new WebmMuxer.Muxer({
    target: muxTarget,
    video: { codec: 'V_VP9', width, height, frameRate: project.settings.fps },
    firstTimestampBehavior: 'offset',
  });
  return {
    muxer,
    takeBuffer: () => (muxTarget instanceof WebmMuxer.ArrayBufferTarget ? muxTarget.buffer : null),
  };
}

export async function exportVideo(
  project: Project,
  options: {
    format: ExportFormat;
    target: ExportTarget;
    onProgress?(frameIndex: number, total: number): void;
    shouldCancel?(): boolean;
  },
): Promise<ExportResult> {
  const { format, target, onProgress, shouldCancel } = options;
  const fps = project.settings.fps;
  const { muxer, takeBuffer } = createMuxer(format, project, target);

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });
  encoder.configure(buildEncoderConfig(format, project.settings));

  const exportMap = createExportMap(project);
  let cancelled = false;
  try {
    await renderFrames(exportMap.map, project, {
      shouldCancel: () => {
        cancelled = shouldCancel?.() ?? false;
        return cancelled;
      },
      onFrame: async (canvas, i, total) => {
        if (encoderError) throw encoderError;
        if (encoder.encodeQueueSize > 4) {
          await new Promise<void>((resolve) =>
            encoder.addEventListener('dequeue', () => resolve(), { once: true }),
          );
        }
        const frame = new VideoFrame(canvas, { timestamp: frameTimestampUs(i, fps) });
        try {
          encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        } finally {
          frame.close();
        }
        onProgress?.(i, total);
      },
    });

    if (cancelled) {
      encoder.close();
      if (target.kind === 'stream') await target.stream.abort?.();
      return { blob: null };
    }

    await encoder.flush();
    if (encoderError) throw encoderError;
    encoder.close();
    muxer.finalize();

    if (target.kind === 'stream') {
      await target.stream.close();
      return { blob: null };
    }
    const buffer = takeBuffer();
    return { blob: buffer ? new Blob([buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' }) : null };
  } catch (err) {
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      /* already errored */
    }
    if (target.kind === 'stream') {
      try {
        await target.stream.abort?.();
      } catch {
        /* stream already closed */
      }
    }
    throw err;
  } finally {
    exportMap.dispose();
  }
}
```

- [ ] **Step 2: Verify and commit**

Run: `npm test` (97 green), `npm run build`, `npm run lint` clean. (If the installed muxer `.d.ts` disagrees with any name above — e.g. `firstTimestampBehavior` — adapt minimally and disclose in the report.)

```bash
git add src/export/exportVideo.ts
git commit -m "Add WebCodecs encode and mux export pipeline"
```

---

### Task 5: Export dialog

**Files:**
- Create: `src/editor/ExportDialog.tsx`
- Modify: `src/App.tsx` (mount next to ProjectMenu in the header slot)

**Interfaces:**
- Consumes: `probeExportFormats`, `exportVideo`, `ExportFormat`, `exportDimensions`, store (`project`, `setPlaying`), `errorMessage` from `./errors`.
- Produces: `ExportDialog` — an "Export" button opening a Modal:
  - On open: pauses playback (`setPlaying(false)`), runs the probe for the current settings; radio/SegmentedControl of MP4/WebM with unsupported options disabled ("Not supported by this browser"); neither → explanatory text replaces the Start button ("Video export needs WebCodecs — try Chrome or Edge.").
  - Summary line: `1920×1080 • 30 fps • 12.3s • ~211 frames` (from `exportDimensions`, settings, `computeTimeline`, `frameCount`).
  - Start: if `window.showSaveFilePicker` exists, open it FIRST (user gesture) with suggested name `michigatari.mp4`/`.webm` and matching accept types, then `exportVideo` with the stream target; picker cancel (AbortError) is silent. Otherwise run with the buffer target and download the returned blob via the appended-anchor pattern used in `saveProjectFile`.
  - During export: progress bar frame i/total + elapsed + ETA (`elapsed / (i+1) × (total−i−1)`), Cancel button setting a ref checked by `shouldCancel`; modal close disabled while running.
  - Errors (including `ExportStalledError`) → red notification via `errorMessage`; dialog returns to idle state.
  - Disabled entirely (button tooltip) when the project has zero keyframes.

- [ ] **Step 1: Implement**

`src/editor/ExportDialog.tsx`:

```tsx
import { useRef, useState } from 'react';
import { Button, Group, Modal, Progress, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEditorStore } from './store';
import { errorMessage } from './errors';
import { computeTimeline } from '../engine/timeline';
import { exportDimensions, type ExportFormat } from '../export/encoderConfig';
import { frameCount } from '../export/timing';
import { probeExportFormats } from '../export/probe';
import { exportVideo, type ExportTarget } from '../export/exportVideo';

type Phase =
  | { kind: 'idle' }
  | { kind: 'probing' }
  | { kind: 'ready'; mp4: boolean; webm: boolean }
  | { kind: 'exporting'; frame: number; total: number; startedAt: number };

export function ExportDialog() {
  const hasKeyframes = useEditorStore((s) => s.project.keyframes.length > 0);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const [opened, setOpened] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const cancelRef = useRef(false);

  const open = async () => {
    setPlaying(false);
    setOpened(true);
    setPhase({ kind: 'probing' });
    const { project } = useEditorStore.getState();
    const support = await probeExportFormats(project.settings);
    setFormat(support.mp4 ? 'mp4' : 'webm');
    setPhase({ kind: 'ready', ...support });
  };

  const close = () => {
    if (phase.kind === 'exporting') return; // Cancel first
    setOpened(false);
    setPhase({ kind: 'idle' });
  };

  const start = async () => {
    const { project } = useEditorStore.getState();
    const ext = format === 'mp4' ? 'mp4' : 'webm';
    let target: ExportTarget = { kind: 'buffer' };
    const picker = (window as unknown as {
      showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle>;
    }).showSaveFilePicker;
    try {
      if (picker) {
        const handle = await picker({
          suggestedName: `michigatari.${ext}`,
          types: [{ description: 'Video', accept: { [`video/${ext}`]: [`.${ext}`] } }],
        });
        target = { kind: 'stream', stream: await handle.createWritable() };
      }
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return; // picker cancelled
      notifications.show({ color: 'red', title: 'Export failed', message: errorMessage(err) });
      return;
    }

    cancelRef.current = false;
    setPhase({ kind: 'exporting', frame: 0, total: 1, startedAt: performance.now() });
    try {
      const result = await exportVideo(project, {
        format,
        target,
        shouldCancel: () => cancelRef.current,
        onProgress: (frame, total) =>
          setPhase((p) => (p.kind === 'exporting' ? { ...p, frame, total } : p)),
      });
      if (cancelRef.current) {
        notifications.show({ color: 'yellow', title: 'Export cancelled', message: 'No file was written.' });
      } else {
        if (result.blob) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(result.blob);
          a.download = `michigatari.${ext}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 0);
        }
        notifications.show({ color: 'green', title: 'Export complete', message: `Saved michigatari.${ext}` });
      }
    } catch (err) {
      notifications.show({ color: 'red', title: 'Export failed', message: errorMessage(err) });
    } finally {
      const { project: p } = useEditorStore.getState();
      const support = await probeExportFormats(p.settings);
      setPhase({ kind: 'ready', ...support });
    }
  };

  const project = useEditorStore((s) => s.project);
  const { width, height } = exportDimensions(project.settings);
  const totalMs = project.keyframes.length > 0 ? computeTimeline(project).totalMs : 0;
  const frames = frameCount(totalMs, project.settings.fps);

  return (
    <>
      <Tooltip label="Capture a keyframe first" disabled={hasKeyframes}>
        <Button size="xs" variant="light" disabled={!hasKeyframes} onClick={() => void open()}>
          Export
        </Button>
      </Tooltip>
      <Modal opened={opened} onClose={close} title="Export video" closeOnClickOutside={phase.kind !== 'exporting'} withCloseButton={phase.kind !== 'exporting'}>
        <Stack gap="sm">
          <Text size="sm">
            {width}×{height} • {project.settings.fps} fps • {(totalMs / 1000).toFixed(1)}s • ~{frames} frames
          </Text>
          {phase.kind === 'probing' && <Text size="sm" c="dimmed">Checking encoder support…</Text>}
          {phase.kind === 'ready' && !phase.mp4 && !phase.webm && (
            <Text size="sm" c="red">Video export needs WebCodecs — try Chrome or Edge.</Text>
          )}
          {phase.kind === 'ready' && (phase.mp4 || phase.webm) && (
            <>
              <SegmentedControl
                fullWidth
                data={[
                  { value: 'mp4', label: 'MP4 (H.264)', disabled: !phase.mp4 },
                  { value: 'webm', label: 'WebM (VP9)', disabled: !phase.webm },
                ]}
                value={format}
                onChange={(v) => setFormat(v as ExportFormat)}
              />
              <Button onClick={() => void start()}>Start export</Button>
            </>
          )}
          {phase.kind === 'exporting' && (
            <>
              <Progress value={((phase.frame + 1) / phase.total) * 100} />
              <Group justify="space-between">
                <Text size="xs">
                  Frame {phase.frame + 1} / {phase.total}
                  {' • '}
                  {((performance.now() - phase.startedAt) / 1000).toFixed(0)}s elapsed
                  {phase.frame > 0 &&
                    ` • ~${Math.round(((performance.now() - phase.startedAt) / (phase.frame + 1)) * (phase.total - phase.frame - 1) / 1000)}s left`}
                </Text>
                <Button size="xs" color="red" variant="light" onClick={() => { cancelRef.current = true; }}>
                  Cancel
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
```

`src/App.tsx`: header slot becomes `header={<><ProjectMenu /><ExportDialog /></>}` (import it; keep everything else).

- [ ] **Step 2: Verify and commit**

Run: `npm test` (97), `npm run build`, `npm run lint` clean. Dev server serves.

```bash
git add src/editor/ExportDialog.tsx src/App.tsx
git commit -m "Add export dialog with capability probe, progress, and cancel"
```

---

### Task 6: End-to-end verification and release polish

**Files:**
- Modify: `README.md`

- [ ] **Step 1: End-to-end export verification** (controller-performed in the browser): a 2-keyframe project with a marker and an arc exports via the buffer path; the blob is non-empty, `video/mp4`, starts with an `ftyp` box, and has a plausible size; progress advances; cancel mid-export produces the yellow notification and no file; the WebM path produces a non-empty `video/webm` blob. Fix only breakages found.

- [ ] **Step 2: README release update**

Replace the Status section body with:

```markdown
Feature-complete v1: author keyframe camera animation with animated markers,
labels, routes, and region outlines, preview with scrubbing, and export to
MP4 (H.264) or WebM (VP9) — 1080p/1440p/4K, 30 or 60 fps, widescreen or
vertical. Everything runs in the browser.
```

- [ ] **Step 3: Verify and commit**

`npm test` + `npm run build` + `npm run lint` clean.

```bash
git add README.md
git commit -m "Update README for v1 feature-complete status"
```

---

## Out of Scope for Plan 3

- Resumable pause on tile stall (stop-with-message implemented; documented in Global Constraints).
- Audio, alpha export, per-type style interfaces refactor, layer metadata tagging (post-v1 cleanups tracked in memory).
