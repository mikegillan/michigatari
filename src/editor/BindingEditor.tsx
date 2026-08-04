import { Group, NumberInput, Select, Stack, Switch, Text } from '@mantine/core';
import { useEditorStore } from './store';
import { EASINGS } from '../engine/easing';
import type { AnimationBinding, EasingName, Element, EnterAnimation, ExitAnimation } from '../engine/types';

const EASING_OPTIONS = Object.keys(EASINGS) as EasingName[];

const ENTER_CHOICES: Record<Element['type'], EnterAnimation[]> = {
  marker: ['pop', 'fade'],
  label: ['fade'],
  route: ['draw'],
  region: ['draw'],
};

export function BindingEditor({ element }: { element: Element }) {
  const keyframes = useEditorStore((s) => s.project.keyframes);
  const updateElement = useEditorStore((s) => s.updateElement);
  const kfOptions = keyframes.map((k, i) => ({ value: k.id, label: `Keyframe ${i + 1}` }));
  const choices = ENTER_CHOICES[element.type];

  const patchEnter = (patch: Partial<AnimationBinding<EnterAnimation>>) =>
    updateElement(element.id, (el) => ({ ...el, enter: { ...el.enter, ...patch } }));
  const patchExit = (patch: Partial<AnimationBinding<ExitAnimation>>) =>
    updateElement(element.id, (el) => (el.exit ? { ...el, exit: { ...el.exit, ...patch } } : el));

  const toggleExit = (on: boolean) => {
    const lastKf = keyframes[keyframes.length - 1]?.id;
    if (on && lastKf === undefined) return; // all keyframes deleted: nothing to bind to
    updateElement(element.id, (el) =>
      on
        ? {
            ...el,
            exit: {
              keyframeId: lastKf!,
              animation: 'fade',
              delayMs: 0,
              durationMs: 300,
              easing: 'easeInOut',
            },
          }
        : { ...el, exit: undefined },
    );
  };

  return (
    <Stack gap={6}>
      <Text size="xs" fw={600}>Enter</Text>
      <Group gap="xs" grow>
        <Select
          size="xs" label="At keyframe" data={kfOptions} allowDeselect={false}
          value={element.enter.keyframeId}
          onChange={(v) => v && patchEnter({ keyframeId: v })}
        />
        {choices.length > 1 ? (
          <Select
            size="xs" label="Animation" data={choices} allowDeselect={false}
            value={element.enter.animation}
            onChange={(v) => v && patchEnter({ animation: v as EnterAnimation })}
          />
        ) : (
          <Stack gap={2}><Text size="xs" c="dimmed">Animation</Text><Text size="xs">{choices[0]}</Text></Stack>
        )}
      </Group>
      <Group gap="xs" grow>
        <NumberInput size="xs" label="Delay (ms)" min={0} step={100} value={element.enter.delayMs}
          onChange={(v) => patchEnter({ delayMs: Number(v) || 0 })} />
        <NumberInput size="xs" label="Duration (ms)" min={0} step={100} value={element.enter.durationMs}
          onChange={(v) => patchEnter({ durationMs: Number(v) || 0 })} />
        <Select size="xs" label="Easing" data={EASING_OPTIONS} allowDeselect={false}
          value={element.enter.easing} onChange={(v) => v && patchEnter({ easing: v as EasingName })} />
      </Group>
      <Switch
        size="xs" label="Fade out"
        checked={element.exit !== undefined}
        onChange={(e) => toggleExit(e.currentTarget.checked)}
      />
      {element.exit && (
        <Group gap="xs" grow>
          <Select size="xs" label="At keyframe" data={kfOptions} allowDeselect={false}
            value={element.exit.keyframeId} onChange={(v) => v && patchExit({ keyframeId: v })} />
          <NumberInput size="xs" label="Delay (ms)" min={0} step={100} value={element.exit.delayMs}
            onChange={(v) => patchExit({ delayMs: Number(v) || 0 })} />
          <NumberInput size="xs" label="Duration (ms)" min={0} step={100} value={element.exit.durationMs}
            onChange={(v) => patchExit({ durationMs: Number(v) || 0 })} />
          <Select size="xs" label="Easing" data={EASING_OPTIONS} allowDeselect={false}
            value={element.exit.easing} onChange={(v) => v && patchExit({ easing: v as EasingName })} />
        </Group>
      )}
    </Stack>
  );
}
