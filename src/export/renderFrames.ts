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
