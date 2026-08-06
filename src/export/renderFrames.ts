import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Project } from '../engine/types';
import { REFERENCE_VIEWPORT } from '../engine/viewport';
import { computeTimeline, keyframeIndexAt } from '../engine/timeline';
import { effectiveMapSettings } from '../engine/mapSettings';
import { sceneAt } from '../engine/scene';
import { applyScene } from '../map/applyScene';
import { applyMapDetail } from '../map/mapDetail';
import { syncElementLayers } from '../map/layerSync';
import { exportDimensions, exportPixelRatio } from './encoderConfig';
import { frameCount, frameTimeMs } from './timing';
import { waitForIdle } from './waitForIdle';

export class ExportStalledError extends Error {
  constructor(frameIndex: number) {
    super(
      `Map tiles stalled or failed while rendering frame ${frameIndex + 1}. ` +
        'Check your network connection and try the export again.',
    );
    this.name = 'ExportStalledError';
  }
}

// Resource errors (failed tile/sprite/glyph fetches) carry `tile` or
// `sourceId`; anything else is a fatal style error.
function isResourceError(e: unknown): boolean {
  const payload = e as { tile?: unknown; sourceId?: unknown };
  return payload.tile !== undefined || payload.sourceId !== undefined;
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
    style: effectiveMapSettings(project, 0).styleUrl,
    pixelRatio: exportPixelRatio(project.settings),
    interactive: false,
    fadeDuration: 0, // export determinism/throughput: no cross-fade to wait out
    canvasContextAttributes: { preserveDrawingBuffer: true }, // canvas pixels must survive until VideoFrame capture
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

export interface FrameInfo {
  /** Camera bearing at this frame (for the compass burn-in). */
  bearing: number;
  /** Active basemap at this frame (attribution must credit it). */
  styleUrl: string;
  showCompass: boolean;
}

// Mid-export style swap: setStyle destroys all layers; waits for the new
// style, then the caller must rebuild element layers and detail visibility.
function swapStyle(map: MapLibreMap, styleUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      map.off('style.load', onLoad);
      reject(new Error('Map style did not load within 20 seconds during export.'));
    }, 20_000);
    const onLoad = () => {
      clearTimeout(timer);
      resolve();
    };
    map.once('style.load', onLoad);
    map.setStyle(styleUrl);
  });
}

export async function renderFrames(
  map: MapLibreMap,
  project: Project,
  hooks: {
    onFrame(canvas: HTMLCanvasElement, frameIndex: number, total: number, info: FrameInfo): Promise<void> | void;
    shouldCancel?(): boolean;
  },
): Promise<void> {
  let resourceErrorSinceFrameStart = false;
  const onError = (e: unknown) => {
    if (isResourceError(e)) resourceErrorSinceFrameStart = true;
  };
  map.on('error', onError);

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoad = () => {
        clearTimeout(timer);
        map.off('error', onFatalError);
        resolve();
      };
      const onFatalError = (e: unknown) => {
        if (isResourceError(e)) return; // resource errors don't fail the initial load; keep listening
        clearTimeout(timer);
        map.off('load', onLoad);
        map.off('error', onFatalError);
        const payload = e as { error?: { message: string } };
        reject(payload.error ?? new Error('Map failed to load.'));
      };
      const timer = setTimeout(() => {
        map.off('load', onLoad);
        map.off('error', onFatalError);
        reject(
          new Error('Map style did not load within 20 seconds. Check the style URL and your network connection.'),
        );
      }, 20_000);
      map.once('load', onLoad);
      // `.on`, not `.once`: resource errors must not consume this listener
      // before a later fatal error arrives within the load window.
      map.on('error', onFatalError);
    });

    const canvas = map.getCanvas();
    const { width, height } = exportDimensions(project.settings);
    if (canvas.width !== width || canvas.height !== height) {
      throw new Error(
        `Export canvas is ${canvas.width}x${canvas.height}px, expected ${width}x${height}px.`,
      );
    }

    let activeStyleUrl = effectiveMapSettings(project, 0).styleUrl;
    let appliedDetailJson = ''; // forces the first applyMapDetail
    rebuildElementLayers(map, project, activeStyleUrl);

    const timeline = computeTimeline(project);
    const fps = project.settings.fps;
    const total = frameCount(timeline.totalMs, fps);

    for (let i = 0; i < total; i++) {
      if (hooks.shouldCancel?.()) return;
      resourceErrorSinceFrameStart = false;
      const timeMs = frameTimeMs(i, fps, timeline.totalMs);
      const effective = effectiveMapSettings(project, keyframeIndexAt(timeline, timeMs));

      // Keyframe overrides: swap the basemap on arrival frames, re-apply
      // detail visibility whenever it changes. Frame times are monotonic, so
      // each swap happens exactly once.
      if (effective.styleUrl !== activeStyleUrl) {
        await swapStyle(map, effective.styleUrl);
        activeStyleUrl = effective.styleUrl;
        appliedDetailJson = '';
        rebuildElementLayers(map, project, activeStyleUrl);
      }
      const detailJson = JSON.stringify(effective.mapDetail);
      if (detailJson !== appliedDetailJson) {
        applyMapDetail(map, effective.mapDetail);
        appliedDetailJson = detailJson;
      }

      const scene = sceneAt(project, timeMs, timeline);
      applyScene(map, project, scene);
      let settled = await waitForIdle(map, 10_000);
      if (settled === 'idle' && resourceErrorSinceFrameStart) settled = 'timeout';
      if (settled === 'timeout') {
        resourceErrorSinceFrameStart = false;
        map.triggerRepaint();
        settled = await waitForIdle(map, 10_000);
        if (settled === 'idle' && resourceErrorSinceFrameStart) settled = 'timeout';
      }
      if (settled === 'timeout') throw new ExportStalledError(i);
      await hooks.onFrame(map.getCanvas(), i, total, {
        bearing: scene.camera.bearing,
        styleUrl: activeStyleUrl,
        showCompass: effective.mapDetail.showCompass ?? false,
      });
    }
  } finally {
    map.off('error', onError);
  }
}

// Element layers + their transition-kill, needed fresh after every style
// (re)load: exported frames are sampled at exact scene times, so cross-fade
// transitions would blur/lag them.
function rebuildElementLayers(map: MapLibreMap, project: Project, activeStyleUrl: string): void {
  syncElementLayers(map, project, activeStyleUrl);
  for (const el of project.elements) {
    const layerId = `el-${el.id}`;
    if (map.getLayer(layerId)) {
      switch (el.type) {
        case 'marker':
          map.setPaintProperty(layerId, 'circle-opacity-transition', { duration: 0, delay: 0 });
          map.setPaintProperty(layerId, 'circle-stroke-opacity-transition', { duration: 0, delay: 0 });
          map.setPaintProperty(layerId, 'circle-radius-transition', { duration: 0, delay: 0 });
          break;
        case 'label':
          map.setPaintProperty(layerId, 'text-opacity-transition', { duration: 0, delay: 0 });
          break;
        case 'route':
        case 'region':
          map.setPaintProperty(layerId, 'line-opacity-transition', { duration: 0, delay: 0 });
          break;
      }
    }
    if (el.type === 'region') {
      const fillLayerId = `${layerId}-fill`;
      if (map.getLayer(fillLayerId)) {
        map.setPaintProperty(fillLayerId, 'fill-opacity-transition', { duration: 0, delay: 0 });
      }
    }
  }
}
