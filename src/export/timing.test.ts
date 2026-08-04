import { expect, it } from 'vitest';
import { frameCount, frameTimeMs, frameTimestampUs } from './timing';

it('counts frames including the final instant', () => {
  expect(frameCount(1000, 30)).toBe(31); // 0..1000ms inclusive
  expect(frameCount(7000, 30)).toBe(211);
  expect(frameCount(0, 30)).toBe(1); // degenerate project: one frame
});

it('clamps the last frame time to the timeline end', () => {
  expect(frameTimeMs(0, 30, 7000)).toBe(0);
  expect(frameTimeMs(210, 30, 7000)).toBe(7000);
  expect(frameTimeMs(209, 30, 7000)).toBeCloseTo(6966.666, 2);
});

it('produces integer microsecond timestamps', () => {
  expect(frameTimestampUs(0, 30)).toBe(0);
  expect(frameTimestampUs(1, 30)).toBe(33333);
  expect(frameTimestampUs(3, 60)).toBe(50000);
});
