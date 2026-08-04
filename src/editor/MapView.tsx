import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './MapView.css';
import { useEditorStore } from './store';
import { mapRef } from './mapRef';
import { syncElementLayers } from '../map/layerSync';
import { applyElements } from '../map/applyScene';
import { allShownStates } from './editorScene';

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
    map.on('load', () => {
      if (cancelled) return;
      mapRef.current = map;
      const { project } = useEditorStore.getState();
      const resync = () => {
        const { project: p } = useEditorStore.getState();
        syncElementLayers(map, p);
        applyElements(map, p, allShownStates(p.elements));
      };
      if (project.settings.styleUrl !== initialStyleRef.current) {
        map.setStyle(project.settings.styleUrl);
        map.once('style.load', resync);
      } else {
        resync();
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
        syncElementLayers(map, state.project);
        if (state.mode === 'edit') {
          applyElements(map, state.project, allShownStates(state.project.elements));
        }
      }),
    [],
  );

  // Style URL changes rebuild element layers after the new style loads.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(styleUrl);
    const handler = () => {
      const { project } = useEditorStore.getState();
      syncElementLayers(map, project);
      applyElements(map, project, allShownStates(project.elements));
    };
    map.once('style.load', handler);
    return () => {
      map.off('style.load', handler);
    };
  }, [styleUrl]);

  // Aspect changes resize the letterbox.
  useEffect(() => {
    mapRef.current?.resize();
  }, [aspect]);

  return (
    <div className="map-stage">
      <div className="map-frame" data-aspect={aspect}>
        <div ref={containerRef} className="map-canvas" />
        {mode === 'preview' && <div className="map-block-overlay" />}
      </div>
    </div>
  );
}
