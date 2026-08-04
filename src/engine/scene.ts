import type { CameraPose, Project } from './types';
import { computeTimeline, type Timeline } from './timeline';
import { cameraAt } from './camera';
import { evaluateElement, type ElementScene } from './elements';
import { viewportForSettings } from './viewport';

export interface SceneState {
  timeMs: number;
  camera: CameraPose;
  elements: Record<string, ElementScene>;
}

/**
 * Throws if the project has no keyframes — callers with possibly-empty
 * projects (e.g. a fresh editor session) must guard before calling.
 */
export function sceneAt(
  project: Project,
  timeMs: number,
  timeline: Timeline = computeTimeline(project),
): SceneState {
  const viewport = viewportForSettings(project.settings);
  const elements: Record<string, ElementScene> = {};
  for (const el of project.elements) {
    elements[el.id] = evaluateElement(el, timeline, timeMs);
  }
  return { timeMs, camera: cameraAt(project, timeline, timeMs, viewport), elements };
}
