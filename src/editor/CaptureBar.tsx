import { Button, Group } from '@mantine/core';
import { useEditorStore } from './store';
import { cameraFromMap, mapRef } from './mapRef';
import { captureThumbnail } from './captureThumbnail';

export function CaptureBar() {
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const setThumbnail = useEditorStore((s) => s.setThumbnail);
  const mode = useEditorStore((s) => s.mode);

  const capture = async () => {
    const camera = cameraFromMap();
    const map = mapRef.current;
    if (!camera || !map) return;
    const id = addKeyframe(camera);
    // the new keyframe is now the one being worked on
    const { project, setDisplayKfIndex } = useEditorStore.getState();
    setDisplayKfIndex(project.keyframes.length - 1);
    setThumbnail(id, await captureThumbnail(map));
  };

  return (
    <Group className="capture-bar" gap="xs">
      <Button size="xs" onClick={capture} disabled={mode === 'preview'}>
        Capture keyframe
      </Button>
    </Group>
  );
}
