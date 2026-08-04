import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Project } from '../engine/types';
import { REFERENCE_VIEWPORT } from '../engine/viewport';
import { computeTimeline } from '../engine/timeline';
import { sceneAt } from '../engine/scene';
import { applyScene } from '../map/applyScene';
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
    style: project.settings.styleUrl,
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

export async function renderFrames(
  map: MapLibreMap,
  project: Project,
  hooks: {
    onFrame(canvas: HTMLCanvasElement, frameIndex: number, total: number): Promise<void> | void;
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

    syncElementLayers(map, project);

    // Kill paint transitions the applier animates: exported frames are
    // sampled at exact scene times, so cross-fades would blur/lag them.
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

    const timeline = computeTimeline(project);
    const fps = project.settings.fps;
    const total = frameCount(timeline.totalMs, fps);

    for (let i = 0; i < total; i++) {
      if (hooks.shouldCancel?.()) return;
      resourceErrorSinceFrameStart = false;
      applyScene(map, project, sceneAt(project, frameTimeMs(i, fps, timeline.totalMs), timeline));
      let settled = await waitForIdle(map, 10_000);
      if (settled === 'idle' && resourceErrorSinceFrameStart) settled = 'timeout';
      if (settled === 'timeout') {
        resourceErrorSinceFrameStart = false;
        map.triggerRepaint();
        settled = await waitForIdle(map, 10_000);
        if (settled === 'idle' && resourceErrorSinceFrameStart) settled = 'timeout';
      }
      if (settled === 'timeout') throw new ExportStalledError(i);
      await hooks.onFrame(map.getCanvas(), i, total);
    }
  } finally {
    map.off('error', onError);
  }
}
