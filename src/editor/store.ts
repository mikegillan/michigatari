import { create } from 'zustand';
import { appConfig } from '../config';
import type { CameraPose, Element, Keyframe, LngLat, Project, Settings } from '../engine/types';

// crypto.randomUUID requires a secure context; plain-HTTP LAN hosting gets the fallback.
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function blankProject(): Project {
  return {
    version: 1,
    settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: appConfig.defaultStyleUrl },
    keyframes: [],
    elements: [],
  };
}

export type EditorMode = 'edit' | 'preview';

export type PlacingState =
  | { kind: 'marker' }
  | { kind: 'label' }
  | { kind: 'route'; mode: 'arc' | 'road'; waypoints: LngLat[] }
  | null;

interface EditorStore {
  project: Project;
  mode: EditorMode;
  playing: boolean;
  timeMs: number;
  thumbnails: Record<string, string>;
  placing: PlacingState;
  /** Keyframe whose effective map settings the map currently displays
   * (ephemeral, not persisted): set by jumping to a keyframe, editing its
   * override, or playback crossing into its hold. */
  displayKfIndex: number;
  /** Live camera bearing of the editor map (ephemeral; drives the compass). */
  mapBearing: number;

  loadProject(project: Project): void;
  newProject(): void;
  updateSettings(patch: Partial<Settings>): void;
  addKeyframe(camera: CameraPose): string;
  updateKeyframe(id: string, patch: Partial<Omit<Keyframe, 'id'>>): void;
  moveKeyframe(id: string, toIndex: number): void;
  deleteKeyframe(id: string): void;
  setThumbnail(id: string, dataUrl: string): void;
  addElement(element: Element): void;
  updateElement(id: string, update: (el: Element) => Element): void;
  deleteElement(id: string): void;
  setDisplayKfIndex(index: number): void;
  setMapBearing(bearing: number): void;
  setMode(mode: EditorMode): void;
  setPlaying(playing: boolean): void;
  setTimeMs(timeMs: number): void;
  setPlacing(placing: PlacingState): void;
  appendPlacingWaypoint(lngLat: LngLat): void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  project: blankProject(),
  mode: 'edit',
  playing: false,
  timeMs: 0,
  thumbnails: {},
  placing: null,
  displayKfIndex: 0,
  mapBearing: 0,

  loadProject: (project) =>
    set({ project, mode: 'edit', playing: false, timeMs: 0, thumbnails: {}, placing: null, displayKfIndex: 0 }),
  newProject: () =>
    set({ project: blankProject(), mode: 'edit', playing: false, timeMs: 0, thumbnails: {}, placing: null, displayKfIndex: 0 }),

  updateSettings: (patch) =>
    set((s) => ({ project: { ...s.project, settings: { ...s.project.settings, ...patch } } })),

  addKeyframe: (camera) => {
    const id = newId();
    set((s) => ({
      project: {
        ...s.project,
        keyframes: [
          ...s.project.keyframes,
          { id, camera, holdMs: 2000, transition: { durationMs: 3000, easing: 'easeInOut' } },
        ],
      },
    }));
    return id;
  },

  updateKeyframe: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        keyframes: s.project.keyframes.map((k) => (k.id === id ? { ...k, ...patch } : k)),
      },
    })),

  moveKeyframe: (id, toIndex) =>
    set((s) => {
      const keyframes = [...s.project.keyframes];
      const from = keyframes.findIndex((k) => k.id === id);
      if (from === -1) return s;
      const [kf] = keyframes.splice(from, 1);
      keyframes.splice(toIndex, 0, kf);
      return { project: { ...s.project, keyframes } };
    }),

  deleteKeyframe: (id) =>
    set((s) => {
      const keyframes = s.project.keyframes.filter((k) => k.id !== id);
      const fallback = keyframes[0]?.id;
      const elements = s.project.elements.map((el) => {
        let next = el;
        if (el.enter.keyframeId === id && fallback !== undefined) {
          next = { ...next, enter: { ...next.enter, keyframeId: fallback } };
        }
        if (next.exit?.keyframeId === id) {
          next = { ...next, exit: undefined };
        }
        return next;
      });
      const thumbnails = { ...s.thumbnails };
      delete thumbnails[id];
      return { project: { ...s.project, keyframes, elements }, thumbnails };
    }),

  setThumbnail: (id, dataUrl) => set((s) => ({ thumbnails: { ...s.thumbnails, [id]: dataUrl } })),

  addElement: (element) =>
    set((s) => ({ project: { ...s.project, elements: [...s.project.elements, element] } })),
  updateElement: (id, update) =>
    set((s) => ({
      project: {
        ...s.project,
        elements: s.project.elements.map((el) => (el.id === id ? update(el) : el)),
      },
    })),
  deleteElement: (id) =>
    set((s) => ({ project: { ...s.project, elements: s.project.elements.filter((el) => el.id !== id) } })),

  setDisplayKfIndex: (displayKfIndex) => set({ displayKfIndex }),
  setMapBearing: (mapBearing) => set({ mapBearing }),
  setMode: (mode) => set({ mode, ...(mode === 'preview' ? { placing: null } : {}) }),
  setPlaying: (playing) => set({ playing }),
  setTimeMs: (timeMs) => set({ timeMs }),
  setPlacing: (placing) => set({ placing }),
  appendPlacingWaypoint: (lngLat) =>
    set((s) =>
      s.placing?.kind === 'route'
        ? { placing: { ...s.placing, waypoints: [...s.placing.waypoints, lngLat] } }
        : s,
    ),
}));
