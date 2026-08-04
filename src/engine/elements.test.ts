import { expect, it } from 'vitest';
import { evaluateElement } from './elements';
import { computeTimeline } from './timeline';
import type { AnimationBinding, EnterAnimation, ExitAnimation, MarkerElement, Project } from './types';

// timeline: kf1 hold 0–2000, transition 2000–5000, kf2 hold 5000–6000
const p: Project = {
  version: 1,
  settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: '' },
  keyframes: [
    { id: 'kf1', camera: { center: [0, 0], zoom: 5, bearing: 0, pitch: 0 }, holdMs: 2000, transition: { durationMs: 3000, easing: 'linear' } },
    { id: 'kf2', camera: { center: [10, 0], zoom: 5, bearing: 0, pitch: 0 }, holdMs: 1000, transition: { durationMs: 0, easing: 'linear' } },
  ],
  elements: [],
};
const tl = computeTimeline(p);

function marker(
  enter: AnimationBinding<EnterAnimation>,
  exit?: AnimationBinding<ExitAnimation>,
): MarkerElement {
  return { id: 'm1', type: 'marker', style: {}, data: { lngLat: [0, 0] }, enter, exit };
}

const popEnter: AnimationBinding<EnterAnimation> = {
  keyframeId: 'kf2', animation: 'pop', delayMs: 500, durationMs: 400, easing: 'linear',
};

it('is hidden before the enter window opens', () => {
  // kf2 arrival 5000 + delay 500 = window opens at 5500
  const s = evaluateElement(marker(popEnter), tl, 5499);
  expect(s.visible).toBe(false);
  expect(s.opacity).toBe(0);
});

it('animates inside the enter window', () => {
  const s = evaluateElement(marker(popEnter), tl, 5700); // t = 0.5
  expect(s.visible).toBe(true);
  expect(s.opacity).toBeGreaterThan(0);
  expect(s.scale).toBeGreaterThan(0);
});

it('pop starts at scale 0 and settles at exactly 1', () => {
  expect(evaluateElement(marker(popEnter), tl, 5500).scale).toBeCloseTo(0);
  expect(evaluateElement(marker(popEnter), tl, 5900).scale).toBe(1);
});

it('pop overshoots past 1 mid-animation', () => {
  // easeOutBack peaks around t≈0.7
  const s = evaluateElement(marker(popEnter), tl, 5780); // t = 0.7
  expect(s.scale).toBeGreaterThan(1);
});

it('is fully shown after the enter window with no exit', () => {
  const s = evaluateElement(marker(popEnter), tl, 999999);
  expect(s).toEqual({ visible: true, opacity: 1, scale: 1, progress: 1 });
});

it('draw entrance ramps progress 0→1', () => {
  const draw = marker({ keyframeId: 'kf1', animation: 'draw', delayMs: 0, durationMs: 1000, easing: 'linear' });
  expect(evaluateElement(draw, tl, 0).progress).toBeCloseTo(0);
  expect(evaluateElement(draw, tl, 500).progress).toBeCloseTo(0.5);
  expect(evaluateElement(draw, tl, 1000).progress).toBe(1);
});

it('a delayed animation can run past its hold into the transition', () => {
  // kf1 hold ends at 2000; delay 1500 + duration 1000 → window 1500–2500
  const late = marker({ keyframeId: 'kf1', animation: 'fade', delayMs: 1500, durationMs: 1000, easing: 'linear' });
  const s = evaluateElement(late, tl, 2250); // inside the transition, t = 0.75
  expect(s.opacity).toBeCloseTo(0.75);
});

it('exit fades out and then hides', () => {
  const exiting = marker(
    { keyframeId: 'kf1', animation: 'fade', delayMs: 0, durationMs: 100, easing: 'linear' },
    { keyframeId: 'kf2', animation: 'fade', delayMs: 0, durationMs: 300, easing: 'linear' },
  );
  expect(evaluateElement(exiting, tl, 5150).opacity).toBeCloseTo(0.5); // mid-fade
  expect(evaluateElement(exiting, tl, 5300).visible).toBe(false);
});

it('zero-duration enter shows instantly at its start time', () => {
  const instant = marker({ keyframeId: 'kf1', animation: 'fade', delayMs: 100, durationMs: 0, easing: 'linear' });
  expect(evaluateElement(instant, tl, 99).visible).toBe(false);
  expect(evaluateElement(instant, tl, 100)).toEqual({ visible: true, opacity: 1, scale: 1, progress: 1 });
});

it('hides elements whose enter keyframe no longer exists', () => {
  const dangling = marker({ keyframeId: 'gone', animation: 'fade', delayMs: 0, durationMs: 100, easing: 'linear' });
  expect(evaluateElement(dangling, tl, 1000).visible).toBe(false);
});

it('is fully shown between the enter and exit windows', () => {
  const exiting = marker(
    { keyframeId: 'kf1', animation: 'fade', delayMs: 0, durationMs: 100, easing: 'linear' },
    { keyframeId: 'kf2', animation: 'fade', delayMs: 0, durationMs: 300, easing: 'linear' },
  );
  expect(evaluateElement(exiting, tl, 2000)).toEqual({ visible: true, opacity: 1, scale: 1, progress: 1 });
});
