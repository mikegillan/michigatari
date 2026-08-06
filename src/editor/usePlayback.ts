import { useEffect, useMemo, useRef } from 'react';
import { useEditorStore } from './store';
import { computeTimeline, keyframeIndexAt } from '../engine/timeline';
import { sceneAt } from '../engine/scene';
import { currentZoomOffset, mapRef } from './mapRef';
import { applyElements } from '../map/applyScene';

/** Element states at timeMs without touching the camera — edit-mode display
 * follows the playhead, but project edits must not yank the user's framing. */
export function applySceneElements(timeMs: number): void {
  const map = mapRef.current;
  const { project } = useEditorStore.getState();
  if (!map || project.keyframes.length === 0) return; // sceneAt throws on empty projects
  applyElements(map, project, sceneAt(project, timeMs).elements);
}

export function applyPreviewFrame(timeMs: number): void {
  const map = mapRef.current;
  const { project, displayKfIndex, setDisplayKfIndex } = useEditorStore.getState();
  if (!map || project.keyframes.length === 0) return; // sceneAt throws on empty projects
  const timeline = computeTimeline(project);
  // Crossing into a new keyframe's hold applies its map-settings override
  // (MapView reacts to displayKfIndex: detail flips, style swaps, compass).
  const idx = keyframeIndexAt(timeline, timeMs);
  if (idx !== displayKfIndex) setDisplayKfIndex(idx);
  const scene = sceneAt(project, timeMs, timeline);
  map.jumpTo({
    center: scene.camera.center,
    zoom: scene.camera.zoom - currentZoomOffset(),
    bearing: scene.camera.bearing,
    pitch: scene.camera.pitch,
  });
  applyElements(map, project, scene.elements);
}

export function usePlayback() {
  const playing = useEditorStore((s) => s.playing);
  const keyframes = useEditorStore((s) => s.project.keyframes);
  const timeline = useMemo(() => {
    const project = useEditorStore.getState().project;
    return keyframes.length > 0 ? computeTimeline(project) : null;
  }, [keyframes]);

  const rafRef = useRef(0);
  useEffect(() => {
    if (!playing || !timeline) return;
    let last = performance.now();
    const frame = (now: number) => {
      const store = useEditorStore.getState();
      const next = store.timeMs + (now - last);
      last = now;
      if (next >= timeline.totalMs) {
        store.setTimeMs(timeline.totalMs);
        store.setPlaying(false);
        applyPreviewFrame(timeline.totalMs);
        return;
      }
      store.setTimeMs(next);
      applyPreviewFrame(next);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, timeline]);

  return timeline;
}
