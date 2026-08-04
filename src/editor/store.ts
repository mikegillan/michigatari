import { create } from 'zustand';
import type { CameraPose, Element, Keyframe, Project, Settings } from '../engine/types';

export const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export function blankProject(): Project {
  return {
    version: 1,
    settings: { resolution: '1080p', fps: 30, aspect: '16:9', styleUrl: DEFAULT_STYLE_URL },
    keyframes: [],
    elements: [],
  };
}

export type EditorMode = 'edit' | 'preview';

interface EditorStore {
  project: Project;
  mode: EditorMode;
  playing: boolean;
  timeMs: number;
  thumbnails: Record<string, string>;

  loadProject(project: Project): void;
  newProject(): void;
  updateSettings(patch: Partial<Settings>): void;
  addKeyframe(camera: CameraPose): string;
  updateKeyframe(id: string, patch: Partial<Omit<Keyframe, 'id'>>): void;
  moveKeyframe(id: string, toIndex: number): void;
  deleteKeyframe(id: string): void;
  setThumbnail(id: string, dataUrl: string): void;
  addElement(element: Element): void;
  updateElement(id: string, patch: Partial<Omit<Element, 'id' | 'type'>>): void;
  deleteElement(id: string): void;
  setMode(mode: EditorMode): void;
  setPlaying(playing: boolean): void;
  setTimeMs(timeMs: number): void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  project: blankProject(),
  mode: 'edit',
  playing: false,
  timeMs: 0,
  thumbnails: {},

  loadProject: (project) => set({ project, mode: 'edit', playing: false, timeMs: 0, thumbnails: {} }),
  newProject: () => set({ project: blankProject(), mode: 'edit', playing: false, timeMs: 0, thumbnails: {} }),

  updateSettings: (patch) =>
    set((s) => ({ project: { ...s.project, settings: { ...s.project.settings, ...patch } } })),

  addKeyframe: (camera) => {
    const id = crypto.randomUUID();
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
  updateElement: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        elements: s.project.elements.map((el) => (el.id === id ? ({ ...el, ...patch } as Element) : el)),
      },
    })),
  deleteElement: (id) =>
    set((s) => ({ project: { ...s.project, elements: s.project.elements.filter((el) => el.id !== id) } })),

  setMode: (mode) => set({ mode }),
  setPlaying: (playing) => set({ playing }),
  setTimeMs: (timeMs) => set({ timeMs }),
}));
