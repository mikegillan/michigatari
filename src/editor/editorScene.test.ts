import { expect, it } from 'vitest';
import { allShownStates } from './editorScene';
import type { Element } from '../engine/types';

const els: Element[] = [
  {
    id: 'm1',
    type: 'marker',
    style: {},
    data: { lngLat: [0, 0] },
    enter: { keyframeId: 'gone', animation: 'pop', delayMs: 0, durationMs: 400, easing: 'easeInOut' },
  },
];

it('shows every element fully regardless of bindings', () => {
  expect(allShownStates(els)).toEqual({
    m1: { visible: true, opacity: 1, scale: 1, progress: 1 },
  });
});
