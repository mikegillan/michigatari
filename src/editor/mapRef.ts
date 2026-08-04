import type { Map as MapLibreMap } from 'maplibre-gl';
import { canvasZoomOffset } from '../engine/viewport';
import { useEditorStore } from './store';
import type { CameraPose } from '../engine/types';

// Single live editor map instance. A module ref (not React state) because
// imperative tools — keyframe capture, the preview loop — need synchronous
// access outside the React tree.
export const mapRef: { current: MapLibreMap | null } = { current: null };

/** Zoom offset between the live editor canvas and the reference viewport. */
export function currentZoomOffset(): number {
  const map = mapRef.current;
  if (!map) return 0;
  const aspect = useEditorStore.getState().project.settings.aspect;
  return canvasZoomOffset(map.getContainer().clientWidth, aspect);
}

export function cameraFromMap(): CameraPose | null {
  const map = mapRef.current;
  if (!map) return null;
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom() + currentZoomOffset(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}
