import { expect, it } from 'vitest';
import { planLayerSync } from './layerSync';
import type { Project } from '../engine/types';

function proj(ids: string[]): Project {
  return {
    version: 1,
    settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: '' },
    keyframes: [],
    elements: ids.map((id) => ({
      id,
      type: 'marker',
      style: {},
      data: { lngLat: [0, 0] },
      enter: { keyframeId: 'kf1', animation: 'pop', delayMs: 0, durationMs: 400, easing: 'easeInOut' },
    })),
  };
}

it('creates missing, removes orphaned, restyles surviving elements', () => {
  const plan = planLayerSync(proj(['a', 'b']), ['b', 'c']);
  expect(plan.create).toEqual(['a']);
  expect(plan.remove).toEqual(['c']);
  expect(plan.restyle).toEqual(['b']);
});

it('is empty-safe in both directions', () => {
  expect(planLayerSync(proj([]), [])).toEqual({ create: [], remove: [], restyle: [] });
  expect(planLayerSync(proj([]), ['x']).remove).toEqual(['x']);
  expect(planLayerSync(proj(['x']), []).create).toEqual(['x']);
});
