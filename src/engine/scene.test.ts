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
