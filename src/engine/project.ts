import type { Project } from './types';

export class ProjectFormatError extends Error {}

// ponytail: shallow shape check, not full schema validation — the only
// files we load are ones we wrote. Tighten if imports from elsewhere appear.
export function parseProject(json: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ProjectFormatError('Not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new ProjectFormatError('Not a project file.');
  }
  const p = raw as Partial<Project>;
  if (p.version !== 1) {
    throw new ProjectFormatError(
      `Unsupported project version: ${String(p.version)}. This app supports version 1.`,
    );
  }
  if (!p.settings || !Array.isArray(p.keyframes) || !Array.isArray(p.elements)) {
    throw new ProjectFormatError('Project file is missing settings, keyframes, or elements.');
  }
  return p as Project;
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}
