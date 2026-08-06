import { SegmentedControl, Select, Stack, Switch, Text } from '@mantine/core';
import { appConfig } from '../config';
import type { MapDetail, MapSettingsSnapshot } from '../engine/types';

/** Style + map-detail controls, shared by the project settings panel and
 * per-keyframe overrides — one source of truth for what "map settings" means. */
export function MapSettingsControls({
  value,
  onChange,
}: {
  value: MapSettingsSnapshot;
  onChange(next: MapSettingsSnapshot): void;
}) {
  const detail = value.mapDetail;
  const patchDetail = (patch: Partial<MapDetail>) =>
    onChange({ ...value, mapDetail: { ...detail, ...patch } });

  // A styleUrl outside the configured list (hand-edited file, or saved under a
  // build with more styles) stays selectable.
  const styleData = appConfig.styles.map((s) => ({ value: s.url, label: s.label }));
  if (!styleData.some((d) => d.value === value.styleUrl)) {
    styleData.unshift({ value: value.styleUrl, label: 'Custom' });
  }

  return (
    <Stack gap="xs">
      {styleData.length > 1 && (
        <Select
          label="Map style" size="xs"
          data={styleData}
          value={value.styleUrl}
          onChange={(v) => v && onChange({ ...value, styleUrl: v })}
          allowDeselect={false}
        />
      )}
      <Stack gap={4}>
        <Text size="xs">Place labels</Text>
        <SegmentedControl
          fullWidth size="xs"
          data={[{ label: 'All', value: 'all' }, { label: 'Major', value: 'major' }, { label: 'None', value: 'none' }]}
          value={detail.placeLabels ?? 'all'}
          onChange={(v) => patchDetail({ placeLabels: v as MapDetail['placeLabels'] })}
        />
      </Stack>
      <Switch
        size="xs" label="POI labels"
        checked={detail.poiLabels ?? true}
        onChange={(e) => patchDetail({ poiLabels: e.currentTarget.checked })}
      />
      <Switch
        size="xs" label="Roads"
        checked={detail.roads ?? true}
        onChange={(e) => patchDetail({ roads: e.currentTarget.checked })}
      />
      <Switch
        size="xs" label="Borders"
        checked={detail.boundaries ?? true}
        onChange={(e) => patchDetail({ boundaries: e.currentTarget.checked })}
      />
      <Switch
        size="xs" label="Show compass"
        checked={detail.showCompass ?? false}
        onChange={(e) => patchDetail({ showCompass: e.currentTarget.checked })}
      />
    </Stack>
  );
}
