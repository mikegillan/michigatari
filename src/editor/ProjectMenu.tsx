import { useEffect, useRef, useState } from 'react';
import { Button, Group, Modal, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEditorStore } from './store';
import {
  clearAutosave, openProjectFile, readAutosave, saveProjectFile, startAutosave,
} from './persistence';
import { ProjectFormatError } from '../engine/project';

export function ProjectMenu() {
  const loadProject = useEditorStore((s) => s.loadProject);
  const newProject = useEditorStore((s) => s.newProject);
  const fileInput = useRef<HTMLInputElement>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  useEffect(() => {
    if (readAutosave() !== null) setRestoreOpen(true);
    return startAutosave();
  }, []);

  const restore = () => {
    const saved = readAutosave();
    if (saved) loadProject(saved);
    setRestoreOpen(false);
  };

  const discardRestore = () => {
    clearAutosave();
    setRestoreOpen(false);
  };

  const onOpenFile = async (file: File | null) => {
    if (!file) return;
    try {
      loadProject(await openProjectFile(file));
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Could not open project',
        message: err instanceof ProjectFormatError ? err.message : 'Unexpected error reading the file.',
      });
    }
  };

  const save = async () => {
    try {
      await saveProjectFile(useEditorStore.getState().project);
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return; // user cancelled the picker
      notifications.show({ color: 'red', title: 'Save failed', message: String(err) });
    }
  };

  return (
    <Group gap="xs">
      <Button size="xs" variant="default" onClick={() => { clearAutosave(); newProject(); }}>New</Button>
      <Button size="xs" variant="default" onClick={() => fileInput.current?.click()}>Open</Button>
      <Button size="xs" onClick={save}>Save</Button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void onOpenFile(e.currentTarget.files?.[0] ?? null);
          e.currentTarget.value = '';
        }}
      />
      <Modal opened={restoreOpen} onClose={() => setRestoreOpen(false)} title="Restore unsaved work?">
        <Text size="sm" mb="md">An autosaved project from a previous session was found.</Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={discardRestore}>Discard</Button>
          <Button onClick={restore}>Restore</Button>
        </Group>
      </Modal>
    </Group>
  );
}
