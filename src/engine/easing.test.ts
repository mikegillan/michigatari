import { expect, it } from 'vitest';
import { EASINGS, ease } from './easing';
import type { EasingName } from './types';

const names = Object.keys(EASINGS) as EasingName[];

it('every easing maps 0→0 and 1→1', () => {
  for (const name of names) {
    expect(EASINGS[name](0)).toBeCloseTo(0);
    expect(EASINGS[name](1)).toBeCloseTo(1);
  }
});

it('every easing is monotonically non-decreasing', () => {
  for (const name of names) {
    let prev = EASINGS[name](0);
    for (let i = 1; i <= 100; i++) {
      const v = EASINGS[name](i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  }
});

it('easeInOut is symmetric about the midpoint', () => {
  expect(EASINGS.easeInOut(0.5)).toBeCloseTo(0.5);
  expect(EASINGS.easeInOut(0.25) + EASINGS.easeInOut(0.75)).toBeCloseTo(1);
});

it('ease clamps out-of-range t', () => {
  expect(ease('linear', -1)).toBe(0);
  expect(ease('linear', 2)).toBe(1);
});
