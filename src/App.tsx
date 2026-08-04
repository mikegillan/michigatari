import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { computeTimeline } from './engine/timeline';
import { sceneAt } from './engine/scene';
import { applyScene, ensureElementLayers } from './map/applyScene';
import { sampleProject } from './demo/sampleProject';

// ponytail: App IS the looping demo for now — Plan 2 replaces this with the editor.
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: sampleProject.settings.styleUrl,
      center: sampleProject.keyframes[0].camera.center,
      zoom: sampleProject.keyframes[0].camera.zoom,
      interactive: false,
    });

    let raf = 0;
    let cancelled = false;
    map.on('load', () => {
      if (cancelled) return;
      ensureElementLayers(map, sampleProject);
      const timeline = computeTimeline(sampleProject);
      const start = performance.now();
      const frame = (now: number) => {
        const t = (now - start) % timeline.totalMs;
        applyScene(map, sampleProject, sceneAt(sampleProject, t, timeline));
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      map.remove();
    };
  }, []);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
