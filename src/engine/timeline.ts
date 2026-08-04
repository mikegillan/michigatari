import type { EasingName, Project } from './types';

export interface HoldSegment {
  kind: 'hold';
  keyframeIndex: number;
  startMs: number;
  endMs: number;
}

export interface TransitionSegment {
  kind: 'transition';
  fromIndex: number;
  toIndex: number;
  startMs: number;
  endMs: number;
  easing: EasingName;
}

export type Segment = HoldSegment | TransitionSegment;

export interface Timeline {
  totalMs: number;
  segments: Segment[];
  arrivalMs: Map<string, number>; // keyframe id → ms its hold starts
}

export function computeTimeline(project: Project): Timeline {
  const segments: Segment[] = [];
  const arrivalMs = new Map<string, number>();
  let cursor = 0;
  project.keyframes.forEach((keyframe, i) => {
    arrivalMs.set(keyframe.id, cursor);
    segments.push({ kind: 'hold', keyframeIndex: i, startMs: cursor, endMs: cursor + keyframe.holdMs });
    cursor += keyframe.holdMs;
    if (i < project.keyframes.length - 1) {
      segments.push({
        kind: 'transition',
        fromIndex: i,
        toIndex: i + 1,
        startMs: cursor,
        endMs: cursor + keyframe.transition.durationMs,
        easing: keyframe.transition.easing,
      });
      cursor += keyframe.transition.durationMs;
    }
  });
  return { totalMs: cursor, segments, arrivalMs };
}

export function segmentAt(timeline: Timeline, timeMs: number): Segment {
  const t = Math.min(Math.max(timeMs, 0), timeline.totalMs);
  // zero-duration segments (holdMs 0) never match t >= start && t < end, so
  // they are skipped — which is the behavior we want.
  const seg = timeline.segments.find((s) => t >= s.startMs && t < s.endMs);
  return seg ?? timeline.segments[timeline.segments.length - 1];
}
