import { beforeEach, expect, it } from 'vitest';
import { blankProject, newId, useEditorStore } from './store';
import type { MarkerElement } from '../engine/types';

beforeEach(() => {
  useEditorStore.getState().loadProject(blankProject());
});

const CAM = { center: [135.5, 34.7] as [number, number], zoom: 8, bearing: 0, pitch: 0 };

function marker(enterKf: string, exitKf?: string): MarkerElement {
  return {
    id: 'm1',
    type: 'marker',
    style: {},
    data: { lngLat: [135.5, 34.7] },
    enter: { keyframeId: enterKf, animation: 'pop', delayMs: 0, durationMs: 400, easing: 'easeInOut' },
    exit: exitKf
      ? { keyframeId: exitKf, animation: 'fade', delayMs: 0, durationMs: 300, easing: 'easeInOut' }
      : undefined,
  };
}

it('addKeyframe appends with timing defaults and a unique id', () => {
  const s = useEditorStore.getState();
  const a = s.addKeyframe(CAM);
  const b = useEditorStore.getState().addKeyframe(CAM);
  const kfs = useEditorStore.getState().project.keyframes;
  expect(kfs).toHaveLength(2);
  expect(a).not.toBe(b);
  expect(kfs[0]).toMatchObject({ id: a, holdMs: 2000, transition: { durationMs: 3000, easing: 'easeInOut' } });
});

it('updateKeyframe shallow-merges a patch', () => {
  const id = useEditorStore.getState().addKeyframe(CAM);
  useEditorStore.getState().updateKeyframe(id, { holdMs: 500 });
  const kf = useEditorStore.getState().project.keyframes[0];
  expect(kf.holdMs).toBe(500);
  expect(kf.transition.durationMs).toBe(3000); // untouched
});

it('moveKeyframe reorders', () => {
  const s = useEditorStore.getState();
  const a = s.addKeyframe(CAM);
  const b = useEditorStore.getState().addKeyframe(CAM);
  const c = useEditorStore.getState().addKeyframe(CAM);
  useEditorStore.getState().moveKeyframe(c, 0);
  expect(useEditorStore.getState().project.keyframes.map((k) => k.id)).toEqual([c, a, b]);
});

it('deleteKeyframe rebinds enters to the first remaining keyframe and drops exits', () => {
  const s = useEditorStore.getState();
  const a = s.addKeyframe(CAM);
  const b = useEditorStore.getState().addKeyframe(CAM);
  useEditorStore.getState().addElement(marker(b, b));
  useEditorStore.getState().deleteKeyframe(b);
  const el = useEditorStore.getState().project.elements[0];
  expect(el.enter.keyframeId).toBe(a);
  expect(el.exit).toBeUndefined();
});

it('deleting the last keyframe leaves bindings dangling (hidden by engine contract)', () => {
  const a = useEditorStore.getState().addKeyframe(CAM);
  useEditorStore.getState().addElement(marker(a));
  useEditorStore.getState().deleteKeyframe(a);
  const st = useEditorStore.getState();
  expect(st.project.keyframes).toHaveLength(0);
  expect(st.project.elements[0].enter.keyframeId).toBe(a); // dangling, engine hides it
});

it('newId produces unique ids', () => {
  const ids = new Set(Array.from({ length: 100 }, () => newId()));
  expect(ids.size).toBe(100);
});

it('newProject resets project and playback state', () => {
  useEditorStore.getState().addKeyframe(CAM);
  useEditorStore.getState().setTimeMs(1234);
  useEditorStore.getState().newProject();
  const st = useEditorStore.getState();
  expect(st.project).toEqual(blankProject());
  expect(st.timeMs).toBe(0);
  expect(st.mode).toBe('edit');
});

it('placing state arms, appends route waypoints, and clears', () => {
  const s = useEditorStore.getState();
  s.setPlacing({ kind: 'route', mode: 'road', waypoints: [] });
  useEditorStore.getState().appendPlacingWaypoint([1, 2]);
  useEditorStore.getState().appendPlacingWaypoint([3, 4]);
  let placing = useEditorStore.getState().placing;
  expect(placing).toEqual({ kind: 'route', mode: 'road', waypoints: [[1, 2], [3, 4]] });
  useEditorStore.getState().appendPlacingWaypoint([5, 6]);
  useEditorStore.getState().setPlacing(null);
  expect(useEditorStore.getState().placing).toBeNull();
});

it('appendPlacingWaypoint is a no-op outside route placing', () => {
  useEditorStore.getState().setPlacing({ kind: 'marker' });
  useEditorStore.getState().appendPlacingWaypoint([1, 2]);
  expect(useEditorStore.getState().placing).toEqual({ kind: 'marker' });
});
