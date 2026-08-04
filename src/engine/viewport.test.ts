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
