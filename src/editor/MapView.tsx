import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { notifications } from '@mantine/notifications';
import './MapView.css';
import { useEditorStore } from './store';
import { mapRef } from './mapRef';
import { syncElementLayers } from '../map/layerSync';
import { applyElements } from '../map/applyScene';
import { applyMapDetail } from '../map/mapDetail';
import { allShownStates } from './editorScene';
import { applyPreviewFrame } from './usePlayback';
import { CaptureBar } from './CaptureBar';
import { createArcRoute, createLabel, createMarker } from './elementDefaults';

// Rebuild style-dependent state after a style (re)load: detail visibility,
// element layers, and the current display — all-shown in edit mode, the
// current preview frame in preview mode (a swap mid-preview must not stomp it).
function resyncStyleState(map: maplibregl.Map): void {
  const { project, mode, timeMs } = useEditorStore.getState();
  applyMapDetail(map, project.settings.mapDetail);
  syncElementLayers(map, project);
  if (mode === 'edit') {
    applyElements(map, project, allShownStates(project.elements));
  } else {
    applyPreviewFrame(timeMs);
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const aspect = useEditorStore((s) => s.project.settings.aspect);
  const styleUrl = useEditorStore((s) => s.project.settings.styleUrl);
  const mode = useEditorStore((s) => s.mode);
  const initialStyleRef = useRef(useEditorStore.getState().project.settings.styleUrl);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: initialStyleRef.current,
      center: [137.0, 36.5],
      zoom: 3.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    let errorShown = false;
    map.on('error', (e) => {
      if (errorShown || cancelled) return;
      errorShown = true;
      notifications.show({
        color: 'red',
        title: 'Map failed to load',
        message: String((e as { error?: Error }).error?.message ?? 'Check the style URL and your network connection.'),
      });
    });
    map.on('click', (e) => {
      const { placing, mode: m, project, addElement, setPlacing, appendPlacingWaypoint } = useEditorStore.getState();
      if (!placing || m === 'preview') return;
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const firstKf = project.keyframes[0]?.id;
      if (!firstKf) return; // add buttons are disabled without keyframes; belt and suspenders
      if (placing.kind === 'marker') {
        addElement(createMarker(lngLat, firstKf));
        setPlacing(null);
      } else if (placing.kind === 'label') {
        addElement(createLabel(lngLat, firstKf));
        setPlacing(null);
      } else if (placing.kind === 'route' && placing.mode === 'arc') {
        if (placing.waypoints.length === 0) {
          appendPlacingWaypoint(lngLat);
        } else {
          addElement(createArcRoute(placing.waypoints[0], lngLat, firstKf));
          setPlacing(null);
        }
      } else if (placing.kind === 'route' && placing.mode === 'road') {
        appendPlacingWaypoint(lngLat); // Finish button in the panel completes it (Task 6)
      }
    });
    map.on('load', () => {
      if (cancelled) return;
      mapRef.current = map;
      const { project } = useEditorStore.getState();
      if (project.settings.styleUrl !== initialStyleRef.current) {
        map.setStyle(project.settings.styleUrl);
        map.once('style.load', () => resyncStyleState(map));
      } else {
        resyncStyleState(map);
      }
    });
    return () => {
      cancelled = true;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Structural sync + edit-mode display on every project change.
  useEffect(
    () =>
      useEditorStore.subscribe((state, prev) => {
        const map = mapRef.current;
        if (!map || state.project === prev.project) return;
        if (!map.isStyleLoaded()) return; // initial sync happens in the load handler
        if (state.project.settings.mapDetail !== prev.project.settings.mapDetail) {
          applyMapDetail(map, state.project.settings.mapDetail);
        }
        syncElementLayers(map, state.project);
        if (state.mode === 'edit') {
          applyElements(map, state.project, allShownStates(state.project.elements));
        }
      }),
    [],
  );

  // Style URL changes rebuild detail visibility and element layers after the new style loads.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(styleUrl);
    const handler = () => resyncStyleState(map);
    map.once('style.load', handler);
    return () => {
      map.off('style.load', handler);
    };
  }, [styleUrl]);

  // Aspect changes resize the letterbox.
  useEffect(() => {
    mapRef.current?.resize();
  }, [aspect]);

  const placing = useEditorStore((s) => s.placing);
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = placing ? 'crosshair' : '';
  }, [placing]);

  return (
    <div className="map-stage">
      <div className="map-frame" data-aspect={aspect}>
        <div ref={containerRef} className="map-canvas" />
        {mode === 'preview' && <div className="map-block-overlay" />}
        <CaptureBar />
      </div>
    </div>
  );
}
