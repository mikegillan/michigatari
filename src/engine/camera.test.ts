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
