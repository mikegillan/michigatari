import { useState } from 'react';
import { ActionIcon, Card, ColorInput, Group, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEditorStore } from './store';
import { BindingEditor } from './BindingEditor';
import { roadRoute } from '../providers/osrm';
import type { Element } from '../engine/types';

function rowTitle(el: Element): string {
  switch (el.type) {
    case 'marker': return 'Marker';
    case 'label': return 'Label';
    case 'route': return el.data.mode === 'arc' ? 'Route (arc)' : 'Route (road)';
    case 'region': return el.data.query;
  }
}

export function ElementRow({ element }: { element: Element }) {
  const [refreshing, setRefreshing] = useState(false);
  const updateElement = useEditorStore((s) => s.updateElement);
  const deleteElement = useEditorStore((s) => s.deleteElement);
  const sizeKey = element.type === 'marker' || element.type === 'label' ? 'size' : 'width';
  const sizeDefault = element.type === 'marker' ? 8 : element.type === 'label' ? 16 : element.type === 'route' ? 3 : 2.5;

  const refreshRoad = async () => {
    if (element.type !== 'route') return;
    setRefreshing(true);
    try {
      const geometry = await roadRoute(element.data.waypoints);
      updateElement(element.id, (el) =>
        el.type === 'route' ? { ...el, data: { ...el.data, geometry } } : el,
      );
    } catch (err) {
      notifications.show({ color: 'red', title: 'Routing failed', message: String((err as Error).message) });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card withBorder padding="xs">
      <Stack gap={6}>
        <Group justify="space-between" gap="xs">
          <Text size="sm" fw={600} lineClamp={1}>{rowTitle(element)}</Text>
          <Group gap={6}>
            {element.type === 'route' && element.data.mode === 'road' && (
              <ActionIcon size="sm" variant="subtle" aria-label="Refresh road geometry" loading={refreshing}
                onClick={refreshRoad}>↻</ActionIcon>
            )}
            <ActionIcon size="sm" variant="subtle" color="red" aria-label="Delete element"
              onClick={() => deleteElement(element.id)}>✕</ActionIcon>
          </Group>
        </Group>
        {element.type === 'label' && (
          <TextInput
            size="xs" label="Text" value={element.data.text}
            onChange={(e) => {
              const text = e.currentTarget.value;
              updateElement(element.id, (el) =>
                el.type === 'label' ? { ...el, data: { ...el.data, text } } : el,
              );
            }}
          />
        )}
        <Group gap="xs" grow>
          <ColorInput
            size="xs" label="Color" value={String(element.style.color ?? '#d63031')} format="hex"
            onChange={(color) => updateElement(element.id, (el) => ({ ...el, style: { ...el.style, color } }))}
          />
          <NumberInput
            size="xs" label={sizeKey === 'size' ? 'Size' : 'Width'} min={1} step={0.5}
            value={Number(element.style[sizeKey] ?? sizeDefault)}
            onChange={(v) =>
              updateElement(element.id, (el) => ({ ...el, style: { ...el.style, [sizeKey]: Number(v) || sizeDefault } }))
            }
          />
        </Group>
        <BindingEditor element={element} />
      </Stack>
    </Card>
  );
}
