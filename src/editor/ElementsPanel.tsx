import { Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useEditorStore, type PlacingState } from './store';

type ArmSpec = { label: string; make: () => NonNullable<PlacingState> };

const ADD_BUTTONS: ArmSpec[] = [
  { label: 'Marker', make: () => ({ kind: 'marker' }) },
  { label: 'Label', make: () => ({ kind: 'label' }) },
  { label: 'Arc route', make: () => ({ kind: 'route', mode: 'arc', waypoints: [] }) },
  { label: 'Road route', make: () => ({ kind: 'route', mode: 'road', waypoints: [] }) },
];

export function ElementsPanel() {
  const hasKeyframes = useEditorStore((s) => s.project.keyframes.length > 0);
  const mode = useEditorStore((s) => s.mode);
  const placing = useEditorStore((s) => s.placing);
  const setPlacing = useEditorStore((s) => s.setPlacing);
  const disabled = !hasKeyframes || mode === 'preview';

  const isArmed = (spec: ArmSpec): boolean => {
    if (!placing) return false;
    const target = spec.make();
    if (placing.kind !== target.kind) return false;
    return placing.kind !== 'route' || target.kind !== 'route' || placing.mode === target.mode;
  };

  return (
    <Stack gap="sm">
      <Tooltip label="Capture a keyframe first — element animations bind to keyframes" disabled={hasKeyframes}>
        <Group gap={6}>
          {ADD_BUTTONS.map((b) => (
            <Button
              key={b.label}
              size="compact-xs"
              variant={isArmed(b) ? 'filled' : 'default'}
              disabled={disabled}
              onClick={() => setPlacing(b.make())}
            >
              {b.label}
            </Button>
          ))}
        </Group>
      </Tooltip>
      {placing && (
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {placing.kind === 'route' && placing.mode === 'arc'
              ? placing.waypoints.length === 0 ? 'Click the start point on the map.' : 'Click the end point.'
              : placing.kind === 'route'
                ? `Click waypoints on the map (${placing.waypoints.length} so far).`
                : 'Click the map to place it.'}
          </Text>
          <Button size="compact-xs" variant="subtle" onClick={() => setPlacing(null)}>Cancel</Button>
        </Group>
      )}
    </Stack>
  );
}
