import { SegmentedControl, Stack, Text } from '@mantine/core';
import { useEditorStore } from './store';
import { MapSettingsControls } from './MapSettingsControls';
import type { Settings } from '../engine/types';

// Export-encoding settings (resolution, fps) live in the export dialog; this
// panel is the project baseline: aspect + map look. Keyframes 2+ can override
// the map look from their card.
export function SettingsPanel() {
  const settings = useEditorStore((s) => s.project.settings);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const setDisplayKfIndex = useEditorStore((s) => s.setDisplayKfIndex);

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">Project settings</Text>
      <SegmentedControl
        fullWidth
        data={[{ label: 'Widescreen 16:9', value: '16:9' }, { label: 'Vertical 9:16', value: '9:16' }]}
        value={settings.aspect}
        onChange={(v) => updateSettings({ aspect: v as Settings['aspect'] })}
      />
      <Text fw={600} size="sm">Map settings</Text>
      <MapSettingsControls
        value={{ styleUrl: settings.styleUrl, mapDetail: settings.mapDetail ?? {} }}
        onChange={(next) => {
          setDisplayKfIndex(0); // editing the baseline: show the baseline
          updateSettings({ styleUrl: next.styleUrl, mapDetail: next.mapDetail });
        }}
      />
    </Stack>
  );
}
