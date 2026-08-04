import { notifications } from '@mantine/notifications';
import type { Project } from '../engine/types';
import { parseProject, serializeProject } from '../engine/project';
import { useEditorStore } from './store';

export const AUTOSAVE_KEY = 'michigatari-autosave';

export function writeAutosave(project: Project): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(project));
  } catch {
    try {
      notifications.show({
        color: 'red',
        title: 'Autosave failed',
        message: 'The project is too large for browser storage. Use Save to keep a copy on disk.',
      });
    } catch {
      /* headless */
    }
  }
}

export function readAutosave(): Project | null {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (raw === null) return null;
  try {
    return parseProject(raw);
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}

// Trailing-edge throttle: at most one write per 2s, always capturing the
// latest project state at fire time.
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = useEditorStore.subscribe((state, prev) => {
    if (state.project === prev.project || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      writeAutosave(useEditorStore.getState().project);
    }, 2000);
  });
  return () => {
    if (timer !== null) clearTimeout(timer);
    unsubscribe();
  };
}

export async function saveProjectFile(project: Project): Promise<void> {
  const json = serializeProject(project);
  const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> })
    .showSaveFilePicker;
  if (picker) {
    const handle = await picker({
      suggestedName: 'michigatari-project.json',
      types: [{ description: 'Michigatari project', accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'michigatari-project.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

export async function openProjectFile(file: File): Promise<Project> {
  return parseProject(await file.text()); // throws ProjectFormatError on bad files
}
