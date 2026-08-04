import { Button, Group } from '@mantine/core';
import { useEditorStore } from './store';
import { currentZoomOffset, mapRef } from './mapRef';
import { captureThumbnail } from './captureThumbnail';
import type { CameraPose } from '../engine/types';

export function cameraFromMap(): CameraPose | null {
  const map = mapRef.current;
  if (!map) return null;
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom() + currentZoomOffset(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

export function CaptureBar() {
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const setThumbnail = useEditorStore((s) => s.setThumbnail);
  const mode = useEditorStore((s) => s.mode);

  const capture = async () => {
    const camera = cameraFromMap();
    const map = mapRef.current;
    if (!camera || !map) return;
    const id = addKeyframe(camera);
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
