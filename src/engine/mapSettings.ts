import type { MapSettingsSnapshot, Project } from './types';

/** Map settings in effect at a keyframe: the nearest override snapshot
 * at-or-before it, else the project settings. */
export function effectiveMapSettings(project: Project, keyframeIndex: number): MapSettingsSnapshot {
  for (let i = Math.min(keyframeIndex, project.keyframes.length - 1); i >= 0; i--) {
    const snapshot = project.keyframes[i].mapSettings;
    if (snapshot) return snapshot;
  }
  return { styleUrl: project.settings.styleUrl, mapDetail: project.settings.mapDetail ?? {} };
}
