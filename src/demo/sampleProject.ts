import { greatCircleArc } from '../engine/geometry';
import type { Project } from '../engine/types';

const TOKYO: [number, number] = [139.77, 35.68];
const OSAKA: [number, number] = [135.5, 34.69];

export const sampleProject: Project = {
  version: 1,
  settings: {
    resolution: '1080p',
    fps: 30,
    aspect: '16:9',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  },
  keyframes: [
    {
      id: 'kf-japan',
      camera: { center: [137.5, 36.2], zoom: 4.6, bearing: 0, pitch: 0 },
      holdMs: 2000,
      transition: { durationMs: 3000, easing: 'easeInOut' },
    },
    {
      id: 'kf-osaka',
      camera: { center: OSAKA, zoom: 8.5, bearing: -15, pitch: 45 },
      holdMs: 3000,
      transition: { durationMs: 0, easing: 'linear' },
    },
  ],
  elements: [
    {
      id: 'marker-tokyo',
      type: 'marker',
      style: { color: '#d63031' },
      data: { lngLat: TOKYO },
      enter: { keyframeId: 'kf-japan', animation: 'pop', delayMs: 300, durationMs: 400, easing: 'linear' },
    },
    {
      id: 'label-tokyo',
      type: 'label',
      style: { color: '#2d3436', size: 18 },
      data: { lngLat: [141.2, 35.68], text: 'Tokyo' },
      enter: { keyframeId: 'kf-japan', animation: 'fade', delayMs: 600, durationMs: 400, easing: 'easeInOut' },
    },
    {
      id: 'route-flight',
      type: 'route',
      style: { color: '#0984e3', width: 3 },
      data: { mode: 'arc', waypoints: [TOKYO, OSAKA], geometry: greatCircleArc(TOKYO, OSAKA) },
      enter: { keyframeId: 'kf-japan', animation: 'draw', delayMs: 1100, durationMs: 1500, easing: 'easeInOut' },
    },
  ],
};
