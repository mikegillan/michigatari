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

it('coalesces edits in one window into a single write of the latest state', () => {
  vi.useFakeTimers();
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  const stop = startAutosave();
  useEditorStore.getState().updateSettings({ fps: 60 });
  vi.advanceTimersByTime(500);
  useEditorStore.getState().updateSettings({ resolution: '4k' }); // second edit, same window
  vi.advanceTimersByTime(1600); // total 2100ms from first edit
  const saved = readAutosave();
  expect(saved?.settings.fps).toBe(60);
  expect(saved?.settings.resolution).toBe('4k'); // latest state won
  expect(setItemSpy.mock.calls.filter(([k]) => k === AUTOSAVE_KEY)).toHaveLength(1); // one write
  stop();
  setItemSpy.mockRestore();
  vi.useRealTimers();
});
