import { Card, Group, Image, NumberInput, Select, Stack, Text, ActionIcon, Tooltip } from '@mantine/core';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEditorStore } from './store';
import { cameraFromMap, currentZoomOffset, mapRef } from './mapRef';
import { captureThumbnail } from './captureThumbnail';
import { EASINGS } from '../engine/easing';
import type { EasingName, Keyframe } from '../engine/types';

const EASING_OPTIONS = Object.keys(EASINGS) as EasingName[];

function KeyframeCard({ kf, index, isLast }: { kf: Keyframe; index: number; isLast: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: kf.id });
  const updateKeyframe = useEditorStore((s) => s.updateKeyframe);
  const deleteKeyframe = useEditorStore((s) => s.deleteKeyframe);
  const setThumbnail = useEditorStore((s) => s.setThumbnail);
  const thumbnail = useEditorStore((s) => s.thumbnails[kf.id]);

  const jumpTo = () => {
    mapRef.current?.jumpTo({ ...kf.camera, zoom: kf.camera.zoom - currentZoomOffset() });
  };

  const updateFromView = async () => {
    const camera = cameraFromMap();
    const map = mapRef.current;
    if (!camera || !map) return;
    updateKeyframe(kf.id, { camera });
    setThumbnail(kf.id, await captureThumbnail(map));
  };

  return (
    <Card
      ref={setNodeRef}
      withBorder
      padding="xs"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <div {...attributes} {...listeners} style={{ cursor: 'grab', alignSelf: 'center' }}>⠿</div>
        <Stack gap={6} style={{ flex: 1 }}>
          <Group gap="xs" justify="space-between">
            <Text size="sm" fw={600} style={{ cursor: 'pointer' }} onClick={jumpTo}>
              Keyframe {index + 1}
            </Text>
            <Group gap={4}>
              <Tooltip label="Update from current view">
                <ActionIcon
                  size="sm" variant="subtle" onClick={updateFromView}
                  aria-label="Update from current view"
                >↺</ActionIcon>
              </Tooltip>
              <Tooltip label="Delete keyframe">
                <ActionIcon
                  size="sm" variant="subtle" color="red" onClick={() => deleteKeyframe(kf.id)}
                  aria-label="Delete keyframe"
                >✕</ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          {thumbnail && <Image src={thumbnail} radius="sm" onClick={jumpTo} style={{ cursor: 'pointer' }} />}
          <NumberInput
            label="Hold (ms)" size="xs" min={0} step={100} value={kf.holdMs}
            onChange={(v) => updateKeyframe(kf.id, { holdMs: Number(v) || 0 })}
          />
          {!isLast && (
            <>
              <NumberInput
                label="Transition (ms)" size="xs" min={0} step={100} value={kf.transition.durationMs}
                onChange={(v) =>
                  updateKeyframe(kf.id, { transition: { ...kf.transition, durationMs: Number(v) || 0 } })
                }
              />
              <Select
                label="Easing" size="xs" allowDeselect={false}
                data={EASING_OPTIONS} value={kf.transition.easing}
                onChange={(v) =>
                  v && updateKeyframe(kf.id, { transition: { ...kf.transition, easing: v as EasingName } })
                }
              />
            </>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

export function KeyframePanel() {
  const keyframes = useEditorStore((s) => s.project.keyframes);
  const moveKeyframe = useEditorStore((s) => s.moveKeyframe);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const toIndex = keyframes.findIndex((k) => k.id === over.id);
    moveKeyframe(String(active.id), toIndex);
  };

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">Keyframes</Text>
      {keyframes.length === 0 && (
        <Text size="xs" c="dimmed">Frame a view on the map, then press “Capture keyframe”.</Text>
      )}
      <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={keyframes.map((k) => k.id)} strategy={verticalListSortingStrategy}>
          <Stack gap="xs">
            {keyframes.map((kf, i) => (
              <KeyframeCard key={kf.id} kf={kf} index={i} isLast={i === keyframes.length - 1} />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
    </Stack>
  );
}
