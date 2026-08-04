import { SegmentedControl, Select, Stack, Text } from '@mantine/core';
import { useEditorStore } from './store';
import type { Settings } from '../engine/types';

export function SettingsPanel() {
  const settings = useEditorStore((s) => s.project.settings);
  const updateSettings = useEditorStore((s) => s.updateSettings);

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">Project settings</Text>
      <SegmentedControl
        fullWidth
        data={[{ label: 'Widescreen 16:9', value: '16:9' }, { label: 'Vertical 9:16', value: '9:16' }]}
        value={settings.aspect}
        onChange={(v) => updateSettings({ aspect: v as Settings['aspect'] })}
      />
      <Select
        label="Export resolution"
        data={[{ value: '1080p', label: '1080p' }, { value: '1440p', label: '1440p' }, { value: '4k', label: '4K' }]}
        value={settings.resolution}
        onChange={(v) => v && updateSettings({ resolution: v as Settings['resolution'] })}
        allowDeselect={false}
      />
      <SegmentedControl
        fullWidth
        data={[{ label: '30 fps', value: '30' }, { label: '60 fps', value: '60' }]}
        value={String(settings.fps)}
        onChange={(v) => updateSettings({ fps: Number(v) as Settings['fps'] })}
      />
    </Stack>
  );
}
