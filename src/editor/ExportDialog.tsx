import { useRef, useState } from 'react';
import { Button, Group, Modal, Progress, SegmentedControl, Stack, Switch, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEditorStore } from './store';
import { appConfig, styleOptionFor } from '../config';
import { errorMessage } from './errors';
import { computeTimeline } from '../engine/timeline';
import { exportDimensions, type ExportFormat } from '../export/encoderConfig';
import { frameCount } from '../export/timing';
import { probeExportFormats } from '../export/probe';
import { exportVideo, type ExportTarget } from '../export/exportVideo';

type Phase =
  | { kind: 'idle' }
  | { kind: 'probing' }
  | { kind: 'ready'; mp4: boolean; webm: boolean }
  | { kind: 'exporting'; frame: number; total: number; startedAt: number };

export function ExportDialog() {
  const hasKeyframes = useEditorStore((s) => s.project.keyframes.length > 0);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const [opened, setOpened] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [burnAttribution, setBurnAttribution] = useState(true);
  const cancelRef = useRef(false);

  const open = async () => {
    setPlaying(false);
    setOpened(true);
    setPhase({ kind: 'probing' });
    const { project } = useEditorStore.getState();
    const support = await probeExportFormats(project.settings);
    setFormat(support.mp4 ? 'mp4' : 'webm');
    setPhase({ kind: 'ready', ...support });
  };

  const close = () => {
    if (phase.kind === 'exporting') return; // Cancel first
    setOpened(false);
    setPhase({ kind: 'idle' });
  };

  const start = async () => {
    const { project } = useEditorStore.getState();
    const ext = format === 'mp4' ? 'mp4' : 'webm';
    let target: ExportTarget = { kind: 'buffer' };
    const picker = (window as unknown as {
      showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle>;
    }).showSaveFilePicker;
    try {
      if (picker) {
        const handle = await picker({
          suggestedName: `michigatari.${ext}`,
          types: [{ description: 'Video', accept: { [`video/${ext}`]: [`.${ext}`] } }],
        });
        target = { kind: 'stream', stream: await handle.createWritable() };
      }
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return; // picker cancelled
      notifications.show({ color: 'red', title: 'Export failed', message: errorMessage(err) });
      return;
    }

    cancelRef.current = false;
    const timeline = computeTimeline(project);
    const total = frameCount(timeline.totalMs, project.settings.fps);
    setPhase({ kind: 'exporting', frame: -1, total, startedAt: performance.now() });
    try {
      const result = await exportVideo(project, {
        format,
        target,
        attribution: appConfig.allowCleanExport ? burnAttribution : true,
        shouldCancel: () => cancelRef.current,
        onProgress: (frame, total) =>
          setPhase((p) => (p.kind === 'exporting' ? { ...p, frame, total } : p)),
      });
      if (!result.completed) {
        notifications.show({ color: 'yellow', title: 'Export cancelled', message: 'No file was written.' });
      } else {
        if (result.blob) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(result.blob);
          a.download = `michigatari.${ext}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 0);
        }
        if (appConfig.allowCleanExport && !burnAttribution) {
          // Attribution still required by the data license — hand the user the
          // credit line for their video description (OSMF video guidance).
          const credit = styleOptionFor(project.settings.styleUrl)?.attribution ?? appConfig.exportAttribution;
          let copied = false;
          try {
            await navigator.clipboard.writeText(credit);
            copied = true;
          } catch { /* clipboard may be unavailable; the notification still shows the line */ }
          notifications.show({
            color: 'green',
            title: 'Export complete',
            autoClose: false,
            message: copied
              ? `Saved michigatari.${ext}. Attribution copied to clipboard — paste "${credit}" into your video description.`
              : `Saved michigatari.${ext}. Add "${credit}" to your video description (attribution is required).`,
          });
        } else {
          notifications.show({ color: 'green', title: 'Export complete', message: `Saved michigatari.${ext}` });
        }
      }
    } catch (err) {
      notifications.show({ color: 'red', title: 'Export failed', message: errorMessage(err) });
    } finally {
      const { project: p } = useEditorStore.getState();
      const support = await probeExportFormats(p.settings);
      setPhase({ kind: 'ready', ...support });
    }
  };

  const project = useEditorStore((s) => s.project);
  const { width, height } = exportDimensions(project.settings);
  const totalMs = project.keyframes.length > 0 ? computeTimeline(project).totalMs : 0;
  const frames = frameCount(totalMs, project.settings.fps);

  return (
    <>
      <Tooltip label="Capture a keyframe first" disabled={hasKeyframes}>
        <span style={{ display: 'inline-block' }}>
          <Button size="xs" variant="light" disabled={!hasKeyframes} onClick={() => void open()}>
            Export
          </Button>
        </span>
      </Tooltip>
      <Modal opened={opened} onClose={close} title="Export video" closeOnClickOutside={phase.kind !== 'exporting'} withCloseButton={phase.kind !== 'exporting'}>
        <Stack gap="sm">
          <Text size="sm">
            {width}×{height} • {project.settings.fps} fps • {(totalMs / 1000).toFixed(1)}s • ~{frames} frames
          </Text>
          {phase.kind === 'probing' && <Text size="sm" c="dimmed">Checking encoder support…</Text>}
          {phase.kind === 'ready' && !phase.mp4 && !phase.webm && (
            <Text size="sm" c="red">Video export needs WebCodecs — try Chrome or Edge.</Text>
          )}
          {phase.kind === 'ready' && (phase.mp4 || phase.webm) && (
            <>
              <SegmentedControl
                fullWidth
                data={[
                  { value: 'mp4', label: 'MP4 (H.264)', disabled: !phase.mp4 },
                  { value: 'webm', label: 'WebM (VP9)', disabled: !phase.webm },
                ]}
                value={format}
                onChange={(v) => setFormat(v as ExportFormat)}
              />
              {appConfig.allowCleanExport && (
                <Switch
                  size="xs"
                  label="Burn attribution into the video"
                  description="If off, the credit line goes in your video description instead"
                  checked={burnAttribution}
                  onChange={(e) => setBurnAttribution(e.currentTarget.checked)}
                />
              )}
              <Button onClick={() => void start()}>Start export</Button>
            </>
          )}
          {phase.kind === 'exporting' && (
            <>
              <Progress value={((phase.frame + 1) / phase.total) * 100} />
              <Group justify="space-between">
                <Text size="xs">
                  Frame {phase.frame + 1} / {phase.total}
                  {' • '}
                  {((performance.now() - phase.startedAt) / 1000).toFixed(0)}s elapsed
                  {phase.frame > 0 &&
                    ` • ~${Math.round(((performance.now() - phase.startedAt) / (phase.frame + 1)) * (phase.total - phase.frame - 1) / 1000)}s left`}
                </Text>
                <Button size="xs" color="red" variant="light" onClick={() => { cancelRef.current = true; }}>
                  Cancel
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
