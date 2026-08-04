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
