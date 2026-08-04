import type { AnimationBinding, Element } from './types';
import { ease } from './easing';
import type { Timeline } from './timeline';

export interface ElementScene {
  visible: boolean;
  opacity: number; // 0–1
  scale: number; // pop entrance; 1 otherwise
  progress: number; // draw/trace entrance; 1 once fully drawn
}

const HIDDEN: ElementScene = { visible: false, opacity: 0, scale: 0, progress: 0 };
const SHOWN: ElementScene = { visible: true, opacity: 1, scale: 1, progress: 1 };

// easeOutBack: starts at 0, overshoots to ~1.1, settles at exactly 1.
// The overshoot is inherent to pop (spec §3.4), separate from the easing preset.
function popScale(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function windowOf(
  binding: AnimationBinding<string>,
  timeline: Timeline,
): [start: number, end: number] | null {
  const arrival = timeline.arrivalMs.get(binding.keyframeId);
  if (arrival === undefined) return null; // keyframe was deleted
  const start = arrival + binding.delayMs;
  return [start, start + binding.durationMs];
}

export function evaluateElement(element: Element, timeline: Timeline, timeMs: number): ElementScene {
  const enterWindow = windowOf(element.enter, timeline);
  if (enterWindow === null) return HIDDEN;
  const [enterStart, enterEnd] = enterWindow;
  if (timeMs < enterStart) return HIDDEN;

  if (element.exit) {
    const exitWindow = windowOf(element.exit, timeline);
    if (exitWindow !== null) {
      const [exitStart, exitEnd] = exitWindow;
      if (timeMs >= exitEnd) return HIDDEN;
      if (timeMs >= exitStart) {
        const t = ease(element.exit.easing, (timeMs - exitStart) / (exitEnd - exitStart));
        return { visible: true, opacity: 1 - t, scale: 1, progress: 1 };
      }
    }
  }

  if (timeMs >= enterEnd) return SHOWN;

  const t = ease(element.enter.easing, (timeMs - enterStart) / (enterEnd - enterStart));
  switch (element.enter.animation) {
    case 'fade':
      return { visible: true, opacity: t, scale: 1, progress: 1 };
    case 'pop':
      // opacity ramps in over the first 30% so the overshoot happens fully visible
      return { visible: true, opacity: Math.min(1, t / 0.3), scale: popScale(t), progress: 1 };
    case 'draw':
      return { visible: true, opacity: 1, scale: 1, progress: t };
  }
}
