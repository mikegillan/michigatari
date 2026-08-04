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
