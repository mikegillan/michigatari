import type { LineString, MultiPolygon, Polygon } from 'geojson';

export type LngLat = [number, number]; // [lng, lat]

export interface CameraPose {
  center: LngLat;
  zoom: number;
  bearing: number;
  pitch: number;
}

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface Transition {
  durationMs: number;
  easing: EasingName;
}

export interface Keyframe {
  id: string;
  camera: CameraPose;
  holdMs: number;
  transition: Transition; // flight to the NEXT keyframe; ignored on the last
  /** Map settings from this keyframe forward (applies on arrival). Absent on
   * keyframe 1 by convention — the project settings are its baseline. */
  mapSettings?: MapSettingsSnapshot;
}

export type Resolution = '1080p' | '1440p' | '4k';
export type Aspect = '16:9' | '9:16';

export type PlaceLabelDetail = 'all' | 'major' | 'none';

// All fields optional; absent means "show everything" (pre-existing projects).
export interface MapDetail {
  placeLabels?: PlaceLabelDetail;
  poiLabels?: boolean;
  roads?: boolean;
  boundaries?: boolean;
  /** North indicator, bottom-left; rotates with camera bearing. Default off. */
  showCompass?: boolean;
}

/** A keyframe's full map-settings override (snapshot semantics: the nearest
 * snapshot at-or-before a keyframe wins outright; no layering of deltas). */
export interface MapSettingsSnapshot {
  styleUrl: string;
  mapDetail: MapDetail;
}

export interface Settings {
  resolution: Resolution;
  fps: 30 | 60;
  aspect: Aspect;
  styleUrl: string;
  mapDetail?: MapDetail;
}

export type EnterAnimation = 'pop' | 'fade' | 'draw';
export type ExitAnimation = 'fade';

export interface AnimationBinding<A extends string> {
  keyframeId: string;
  animation: A;
  delayMs: number;
  durationMs: number;
  easing: EasingName;
}

export interface MarkerData { lngLat: LngLat }
export interface LabelData { lngLat: LngLat; text: string }
export interface RouteData {
  mode: 'arc' | 'road';
  waypoints: LngLat[];
  geometry: LineString; // baked at author time
}
export interface RegionData {
  query: string;
  osmId?: number;
  osmType?: string;
  geometry: Polygon | MultiPolygon; // baked at author time
}

// Which enter animations make sense per type (pop/fade for points, draw for
// lines) is enforced by the editor UI, not the type system.
interface ElementBase<T extends string, D> {
  id: string;
  type: T;
  style: Record<string, string | number>;
  data: D;
  enter: AnimationBinding<EnterAnimation>;
  exit?: AnimationBinding<ExitAnimation>;
}

export type MarkerElement = ElementBase<'marker', MarkerData>;
export type LabelElement = ElementBase<'label', LabelData>;
export type RouteElement = ElementBase<'route', RouteData>;
export type RegionElement = ElementBase<'region', RegionData>;
export type Element = MarkerElement | LabelElement | RouteElement | RegionElement;

export interface Project {
  version: 1;
  settings: Settings;
  keyframes: Keyframe[];
  elements: Element[];
}
