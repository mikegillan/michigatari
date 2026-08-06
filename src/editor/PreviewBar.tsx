import { ActionIcon, Button, Group, Slider, Text } from '@mantine/core';
import { useEditorStore } from './store';
import { applyPreviewFrame, usePlayback } from './usePlayback';
import { syncElementLayers } from '../map/layerSync';
import { applyElements } from '../map/applyScene';
import { allShownStates } from './editorScene';
import { mapRef } from './mapRef';

function fmt(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

export function PreviewBar() {
  const timeline = usePlayback();
  const mode = useEditorStore((s) => s.mode);
  const playing = useEditorStore((s) => s.playing);
  const timeMs = useEditorStore((s) => s.timeMs);
  const setMode = useEditorStore((s) => s.setMode);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const setTimeMs = useEditorStore((s) => s.setTimeMs);

  if (!timeline) {
    return <Text size="sm" c="dimmed">Capture a keyframe to enable preview.</Text>;
  }

  const marks = [...timeline.arrivalMs.values()].map((ms) => ({ value: ms }));

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    setMode('preview');
    if (timeMs >= timeline.totalMs) setTimeMs(0);
    setPlaying(true);
  };

  const scrub = (value: number) => {
    setMode('preview');
    setPlaying(false);
    setTimeMs(value);
    applyPreviewFrame(value);
  };

  const exitPreview = () => {
    setPlaying(false);
    setMode('edit');
    const map = mapRef.current;
    const { project } = useEditorStore.getState();
    if (map && map.isStyleLoaded()) {
      syncElementLayers(map, project);
      applyElements(map, project, allShownStates(project.elements));
    }
  };

  return (
    <Group gap="md" wrap="nowrap">
      <ActionIcon size="lg" variant="filled" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </ActionIcon>
      <Slider
        style={{ flex: 1 }}
        min={0}
        max={timeline.totalMs}
        step={1000 / 60}
        value={Math.min(timeMs, timeline.totalMs)}
        onChange={scrub}
        marks={marks}
        label={fmt}
      />
      <Text size="xs" w={90} ta="right">{fmt(Math.min(timeMs, timeline.totalMs))} / {fmt(timeline.totalMs)}</Text>
      {mode === 'preview' && (
        <Button size="xs" onClick={exitPreview}>Exit preview</Button>
      )}
    </Group>
  );
}
