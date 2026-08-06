import { useState } from 'react';
import { Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { activeKeyframeId, useEditorStore, type PlacingState } from './store';
import { ElementRow } from './ElementRow';
import { RegionSearch } from './RegionSearch';
import { appConfig } from '../config';
import { createRoadRoute } from './elementDefaults';
import { errorMessage } from './errors';

type ArmSpec = { label: string; make: () => NonNullable<PlacingState> };

const ADD_BUTTONS: ArmSpec[] = [
  { label: 'Marker', make: () => ({ kind: 'marker' }) },
  { label: 'Label', make: () => ({ kind: 'label' }) },
  { label: 'Arc route', make: () => ({ kind: 'route', mode: 'arc', waypoints: [] }) },
  { label: 'Road route', make: () => ({ kind: 'route', mode: 'road', waypoints: [] }) },
];

export function ElementsPanel() {
  const [fetching, setFetching] = useState(false);
  const hasKeyframes = useEditorStore((s) => s.project.keyframes.length > 0);
  const mode = useEditorStore((s) => s.mode);
  const placing = useEditorStore((s) => s.placing);
  const setPlacing = useEditorStore((s) => s.setPlacing);
  const elements = useEditorStore((s) => s.project.elements);
  const disabled = !hasKeyframes || mode === 'preview';

  const isArmed = (spec: ArmSpec): boolean => {
    if (!placing) return false;
    const target = spec.make();
    if (placing.kind !== target.kind) return false;
    return placing.kind !== 'route' || target.kind !== 'route' || placing.mode === target.mode;
  };

  const finishRoad = async () => {
    const before = useEditorStore.getState().placing;
    const kfId = activeKeyframeId(useEditorStore.getState());
    if (!before || before.kind !== 'route' || before.mode !== 'road' || !kfId) return;
    setFetching(true);
    try {
      const geometry = await appConfig.roadRoute(before.waypoints);
      const now = useEditorStore.getState().placing;
      if (now === null) return; // user cancelled mid-fetch: honor it, drop the result
      if (now !== before) {
        // waypoints changed mid-fetch: don't commit a partial route. Only warn
        // if the user is still mid-road-route placement — if they switched
        // tools, dropping the result silently is correct.
        if (now?.kind === 'route' && now.mode === 'road') {
          notifications.show({
            color: 'yellow',
            title: 'Waypoints changed',
            message: 'The route was updated while routing — press Finish again to include the new points.',
          });
        }
        return;
      }
      useEditorStore.getState().addElement(createRoadRoute(before.waypoints, geometry, kfId));
      useEditorStore.getState().setPlacing(null);
    } catch (err) {
      notifications.show({ color: 'red', title: 'Routing failed', message: errorMessage(err) });
      // keep placing state so the user can retry or cancel
    } finally {
      setFetching(false);
    }
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
          {placing.kind === 'route' && placing.mode === 'road' && (
            <Button
              size="compact-xs"
              loading={fetching}
              disabled={placing.waypoints.length < 2}
              onClick={finishRoad}
            >
              Finish ({placing.waypoints.length})
            </Button>
          )}
          <Button size="compact-xs" variant="subtle" onClick={() => setPlacing(null)}>Cancel</Button>
        </Group>
      )}
      <RegionSearch />
      {elements.map((el) => <ElementRow key={el.id} element={el} />)}
      {elements.length === 0 && <Text size="xs" c="dimmed">No elements yet.</Text>}
    </Stack>
  );
}
