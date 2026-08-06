import { expect, it } from 'vitest';
import { computeTimeline, keyframeIndexAt } from './timeline';
import { effectiveMapSettings } from './mapSettings';
import type { Keyframe, Project } from './types';

const CAM = { center: [135, 35] as [number, number], zoom: 5, bearing: 0, pitch: 0 };

function kf(id: string, extra: Partial<Keyframe> = {}): Keyframe {
  return {
    id, camera: CAM, holdMs: 1000,
    transition: { durationMs: 2000, easing: 'linear' },
    ...extra,
  };
}

function project(keyframes: Keyframe[]): Project {
  return {
    version: 1,
    settings: {
      resolution: '1080p', fps: 30, aspect: '16:9',
      styleUrl: 'https://example.com/base.json',
      mapDetail: { placeLabels: 'all' },
    },
    keyframes,
    elements: [],
  };
}

// Timeline: kf0 hold 0-1000, transition 1000-3000, kf1 hold 3000-4000, ...
it('keyframeIndexAt: holds own their keyframe; transitions keep the departure keyframe', () => {
  const tl = computeTimeline(project([kf('a'), kf('b'), kf('c')]));
  expect(keyframeIndexAt(tl, 500)).toBe(0); // kf0 hold
  expect(keyframeIndexAt(tl, 2000)).toBe(0); // in transition to kf1: settings pop on ARRIVAL
  expect(keyframeIndexAt(tl, 3000)).toBe(1); // kf1 hold starts
  expect(keyframeIndexAt(tl, 99999)).toBe(2); // past the end: last keyframe
});

// Snapshot semantics: the nearest override at-or-before wins outright;
// no override anywhere before → the project settings apply verbatim.
it('effectiveMapSettings: nearest snapshot at-or-before wins, else project settings', () => {
  const override = { styleUrl: 'https://example.com/sat.json', mapDetail: { roads: false } };
  const p = project([kf('a'), kf('b', { mapSettings: override }), kf('c')]);
  expect(effectiveMapSettings(p, 0)).toEqual({
    styleUrl: 'https://example.com/base.json',
    mapDetail: { placeLabels: 'all' },
  });
  expect(effectiveMapSettings(p, 1)).toEqual(override);
  expect(effectiveMapSettings(p, 2)).toEqual(override); // carries forward
});

it('effectiveMapSettings: project without mapDetail resolves to empty detail', () => {
  const p = project([kf('a')]);
  delete p.settings.mapDetail;
  expect(effectiveMapSettings(p, 0).mapDetail).toEqual({});
});
