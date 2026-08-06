import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { notifications } from '@mantine/notifications';
import './MapView.css';
import { useEditorStore } from './store';
import { mapRef } from './mapRef';
import { captureThumbnail } from './captureThumbnail';
import { syncElementLayers } from '../map/layerSync';
import { applyElements } from '../map/applyScene';
import { applyMapDetail } from '../map/mapDetail';
import { effectiveMapSettings } from '../engine/mapSettings';
import { allShownStates } from './editorScene';
import { applyPreviewFrame } from './usePlayback';
import { CaptureBar } from './CaptureBar';
import { createArcRoute, createLabel, createMarker } from './elementDefaults';

// Rebuild style-dependent state after a style (re)load: detail visibility,
// element layers, and the current display — all-shown in edit mode, the
// current preview frame in preview mode (a swap mid-preview must not stomp it).
function resyncStyleState(map: maplibregl.Map): void {
  const { project, mode, timeMs, displayKfIndex } = useEditorStore.getState();
  const effective = effectiveMapSettings(project, displayKfIndex);
  applyMapDetail(map, effective.mapDetail);
  syncElementLayers(map, project, effective.styleUrl);
  if (mode === 'edit') {
    applyElements(map, project, allShownStates(project.elements));
  } else {
    applyPreviewFrame(timeMs);
  }
}

// North indicator, bottom-left; rotates so it always points at map-north.
function CompassOverlay() {
  const show = useEditorStore(
    (s) => effectiveMapSettings(s.project, s.displayKfIndex).mapDetail.showCompass ?? false,
  );
  const bearing = useEditorStore((s) => s.mapBearing);
  if (!show) return null;
  return (
    <div className="map-compass" style={{ transform: `rotate(${-bearing}deg)` }}>
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <circle cx="20" cy="20" r="19" fill="rgba(255,255,255,0.75)" />
        <polygon points="20,4 15,20 25,20" fill="#d63031" />
        <polygon points="15,20 25,20 20,36" fill="#8a8f98" />
      </svg>
    </div>
  );
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const aspect = useEditorStore((s) => s.project.settings.aspect);
  // Effective style for the displayed keyframe context — per-keyframe
  // overrides swap the basemap just like a project-level change would.
  const styleUrl = useEditorStore((s) => effectiveMapSettings(s.project, s.displayKfIndex).styleUrl);
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
    map.on('rotate', () => useEditorStore.getState().setMapBearing(map.getBearing()));
    map.on('load', () => {
      if (cancelled) return;
      mapRef.current = map;
      const { project, displayKfIndex } = useEditorStore.getState();
      const effectiveUrl = effectiveMapSettings(project, displayKfIndex).styleUrl;
      if (effectiveUrl !== initialStyleRef.current) {
        map.setStyle(effectiveUrl);
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

  // Structural sync + edit-mode display on every project change; effective
  // detail re-applies when the project or the displayed keyframe changes.
  useEffect(
    () =>
      useEditorStore.subscribe((state, prev) => {
        const map = mapRef.current;
        const projectChanged = state.project !== prev.project;
        if (!map || (!projectChanged && state.displayKfIndex === prev.displayKfIndex)) return;
        if (!map.isStyleLoaded()) return; // initial sync happens in the load handler
        const effective = effectiveMapSettings(state.project, state.displayKfIndex);
        const prevDetail = effectiveMapSettings(prev.project, prev.displayKfIndex).mapDetail;
        if (JSON.stringify(effective.mapDetail) !== JSON.stringify(prevDetail)) {
          applyMapDetail(map, effective.mapDetail);
        }
        if (!projectChanged) return;
        syncElementLayers(map, state.project, effective.styleUrl);
        if (state.mode === 'edit') {
          applyElements(map, state.project, allShownStates(state.project.elements));
        }
      }),
    [],
  );

  // Style URL changes rebuild detail visibility and element layers after the
  // new style loads. A full-res snapshot of the outgoing style is overlaid and
  // faded out once the new style has settled, so the swap isn't abrupt.
  const [fadeSnapshot, setFadeSnapshot] = useState<string | null>(null);
  const [fadingOut, setFadingOut] = useState(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    let removeTimer = 0;
    const onStyleLoad = () => {
      resyncStyleState(map);
      map.once('idle', onIdle);
    };
    const onIdle = () => {
      if (cancelled) return;
      setFadingOut(true); // CSS opacity transition does the fade
      removeTimer = window.setTimeout(() => {
        setFadeSnapshot(null);
        setFadingOut(false);
      }, 600);
    };
    void captureThumbnail(map, map.getCanvas().width).then((snapshot) => {
      if (cancelled) return;
      setFadeSnapshot(snapshot);
      setFadingOut(false);
      map.setStyle(styleUrl);
      map.once('style.load', onStyleLoad);
    });
    return () => {
      cancelled = true;
      clearTimeout(removeTimer);
      map.off('style.load', onStyleLoad);
      map.off('idle', onIdle);
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
        {fadeSnapshot && (
          <img className={`map-style-fade${fadingOut ? ' out' : ''}`} src={fadeSnapshot} alt="" />
        )}
        <CompassOverlay />
        {mode === 'preview' && <div className="map-block-overlay" />}
        <CaptureBar />
      </div>
    </div>
  );
}
