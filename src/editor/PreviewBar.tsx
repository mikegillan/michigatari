import { ActionIcon, Button, Group, Slider, Text } from '@mantine/core';
import { useEditorStore } from './store';
import { applyPreviewFrame, usePlayback } from './usePlayback';
import { keyframeIndexAt } from '../engine/timeline';

function fmt(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

export function PreviewBar() {
  const timeline = usePlayback();
  const mode = useEditorStore((s) => s.mode);
  const playing = useEditorStore((s) => s.playing);
  const timeMs = useEditorStore((s) => s.timeMs);
  const keyframes = useEditorStore((s) => s.project.keyframes);
  const setMode = useEditorStore((s) => s.setMode);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const setTimeMs = useEditorStore((s) => s.setTimeMs);

  if (!timeline) {
    return <Text size="sm" c="dimmed">Capture a keyframe to enable preview.</Text>;
  }

  const marks = [...timeline.arrivalMs.values()].map((ms) => ({ value: ms }));

  // Playhead annotation: while editing, time since the current keyframe's
  // arrival (the number element delay/duration controls speak); during
  // preview, just which keyframe the video is on.
  const playheadLabel = (v: number): string => {
    const idx = keyframeIndexAt(timeline, v);
    if (mode === 'preview') return `Keyframe ${idx + 1}`;
    const arrival = timeline.arrivalMs.get(keyframes[idx]?.id) ?? 0;
    return `${Math.round((v - arrival) / 100) * 100}ms`;
  };

  // Play = overall preview: collapse the panels and run the whole timeline.
  const startPreview = () => {
    setMode('preview');
    setTimeMs(0);
    applyPreviewFrame(0);
    setPlaying(true);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (mode === 'edit') {
      startPreview();
      return;
    }
    if (timeMs >= timeline.totalMs) setTimeMs(0);
    setPlaying(true);
  };

  // Scrubbing stays in the current mode — in edit, controls remain live so
  // element timing can be tuned against the playhead.
  const scrub = (value: number) => {
    setPlaying(false);
    setTimeMs(value);
    applyPreviewFrame(value);
  };

  const exitPreview = () => {
    setPlaying(false);
    setMode('edit');
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
        step={mode === 'edit' ? 100 : 1000 / 60}
        value={Math.min(timeMs, timeline.totalMs)}
        onChange={scrub}
        marks={marks}
        label={playheadLabel}
        labelAlwaysOn
      />
      <Text size="xs" w={90} ta="right">{fmt(Math.min(timeMs, timeline.totalMs))} / {fmt(timeline.totalMs)}</Text>
      {mode === 'preview' && (
        <Button size="xs" onClick={exitPreview}>Exit preview</Button>
      )}
    </Group>
  );
}
