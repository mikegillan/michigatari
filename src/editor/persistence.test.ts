// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { AUTOSAVE_KEY, clearAutosave, readAutosave, startAutosave, writeAutosave } from './persistence';
import { blankProject, useEditorStore } from './store';

beforeEach(() => {
  localStorage.clear();
  useEditorStore.getState().loadProject(blankProject());
});

it('round-trips a project through autosave storage', () => {
  const project = blankProject();
  project.settings.fps = 60;
  writeAutosave(project);
  expect(readAutosave()).toEqual(project);
});

it('returns null for absent or corrupt autosaves', () => {
  expect(readAutosave()).toBeNull();
  localStorage.setItem(AUTOSAVE_KEY, 'not json');
  expect(readAutosave()).toBeNull();
});

it('clearAutosave removes the entry', () => {
  writeAutosave(blankProject());
  clearAutosave();
  expect(readAutosave()).toBeNull();
});

it('startAutosave writes after edits, throttled', () => {
  vi.useFakeTimers();
  const stop = startAutosave();
  useEditorStore.getState().updateSettings({ fps: 60 });
  expect(readAutosave()).toBeNull(); // trailing throttle: nothing yet
  vi.advanceTimersByTime(2100);
  expect(readAutosave()?.settings.fps).toBe(60);
  stop();
  vi.useRealTimers();
});
