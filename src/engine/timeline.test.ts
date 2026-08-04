import { expect, it } from 'vitest';
import { computeTimeline, segmentAt } from './timeline';
import type { Keyframe, Project } from './types';

function kf(id: string, holdMs: number, transitionMs: number): Keyframe {
  return {
    id,
    camera: { center: [0, 0], zoom: 5, bearing: 0, pitch: 0 },
    holdMs,
    transition: { durationMs: transitionMs, easing: 'linear' },
  };
}

function proj(keyframes: Keyframe[]): Project {
  return {
    version: 1,
    settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: '' },
    keyframes,
    elements: [],
  };
}

// hold(kf1)=2000 → transition=3000 → hold(kf2)=1000; kf2's own transition ignored
const two = proj([kf('kf1', 2000, 3000), kf('kf2', 1000, 9999)]);

it('lays out hold → transition → hold and sums total', () => {
  const tl = computeTimeline(two);
  expect(tl.totalMs).toBe(6000);
  expect(tl.segments).toEqual([
    { kind: 'hold', keyframeIndex: 0, startMs: 0, endMs: 2000 },
    { kind: 'transition', fromIndex: 0, toIndex: 1, startMs: 2000, endMs: 5000, easing: 'linear' },
    { kind: 'hold', keyframeIndex: 1, startMs: 5000, endMs: 6000 },
  ]);
});

it('records arrival times (hold start) per keyframe id', () => {
  const tl = computeTimeline(two);
  expect(tl.arrivalMs.get('kf1')).toBe(0);
  expect(tl.arrivalMs.get('kf2')).toBe(5000);
});

it('ignores the last keyframe transition entirely', () => {
  const tl = computeTimeline(proj([kf('only', 1500, 9999)]));
  expect(tl.totalMs).toBe(1500);
  expect(tl.segments).toHaveLength(1);
});

it('segmentAt finds the right segment and clamps the edges', () => {
  const tl = computeTimeline(two);
  expect(segmentAt(tl, 0).kind).toBe('hold');
  expect(segmentAt(tl, 1999).kind).toBe('hold');
  expect(segmentAt(tl, 2000).kind).toBe('transition');
  expect(segmentAt(tl, 4999).kind).toBe('transition');
  expect(segmentAt(tl, 5000)).toMatchObject({ kind: 'hold', keyframeIndex: 1 });
  expect(segmentAt(tl, 6000)).toMatchObject({ kind: 'hold', keyframeIndex: 1 }); // t == total
  expect(segmentAt(tl, -50).kind).toBe('hold');
  expect(segmentAt(tl, 99999)).toMatchObject({ kind: 'hold', keyframeIndex: 1 });
});
