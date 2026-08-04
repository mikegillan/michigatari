import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [137.0, 36.5],
      zoom: 4,
    });
    return () => map.remove();
  }, []);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
