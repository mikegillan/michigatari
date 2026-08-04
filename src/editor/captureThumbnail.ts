import type { Map as MapLibreMap } from 'maplibre-gl';

// WebGL canvases are cleared after compositing, so the pixels must be read
// inside a render callback; triggerRepaint guarantees one arrives.
export function captureThumbnail(map: MapLibreMap, width = 192): Promise<string> {
  return new Promise((resolve) => {
    map.once('render', () => {
      const src = map.getCanvas();
      const height = Math.max(1, Math.round((width * src.height) / src.width));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(src, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    });
    map.triggerRepaint();
  });
}
