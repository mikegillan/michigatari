import type { Element } from '../engine/types';
import type { ElementScene } from '../engine/elements';

// Edit mode shows everything at full visibility so the author can see and
// style elements without scrubbing to their animation window.
export function allShownStates(elements: Element[]): Record<string, ElementScene> {
  const states: Record<string, ElementScene> = {};
  for (const el of elements) {
    states[el.id] = { visible: true, opacity: 1, scale: 1, progress: 1 };
  }
  return states;
}
