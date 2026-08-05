import { SegmentedControl, Select, Stack, Switch, Text } from '@mantine/core';
import { useEditorStore } from './store';
import { appConfig } from '../config';
import type { MapDetail, Settings } from '../engine/types';

export function SettingsPanel() {
  const settings = useEditorStore((s) => s.project.settings);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const detail = settings.mapDetail ?? {};
  const updateDetail = (patch: Partial<MapDetail>) =>
    updateSettings({ mapDetail: { ...detail, ...patch } });

  // A project may carry a styleUrl outside the configured list (hand-edited
  // file, or saved under a build with more styles); keep it selectable.
  const styleData = appConfig.styles.map((s) => ({ value: s.url, label: s.label }));
  if (!styleData.some((d) => d.value === settings.styleUrl)) {
    styleData.unshift({ value: settings.styleUrl, label: 'Custom' });
  }

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">Project settings</Text>
      {styleData.length > 1 && (
        <Select
          label="Map style"
          data={styleData}
          value={settings.styleUrl}
          onChange={(v) => v && updateSettings({ styleUrl: v })}
          allowDeselect={false}
        />
      )}
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
      <Text fw={600} size="sm">Map detail</Text>
      <Stack gap={4}>
        <Text size="xs">Place labels</Text>
        <SegmentedControl
          fullWidth size="xs"
          data={[{ label: 'All', value: 'all' }, { label: 'Major', value: 'major' }, { label: 'None', value: 'none' }]}
          value={detail.placeLabels ?? 'all'}
          onChange={(v) => updateDetail({ placeLabels: v as MapDetail['placeLabels'] })}
        />
      </Stack>
      <Switch
        size="xs" label="POI labels"
        checked={detail.poiLabels ?? true}
        onChange={(e) => updateDetail({ poiLabels: e.currentTarget.checked })}
      />
      <Switch
        size="xs" label="Roads"
        checked={detail.roads ?? true}
        onChange={(e) => updateDetail({ roads: e.currentTarget.checked })}
      />
      <Switch
        size="xs" label="Borders"
        checked={detail.boundaries ?? true}
        onChange={(e) => updateDetail({ boundaries: e.currentTarget.checked })}
      />
    </Stack>
  );
}
