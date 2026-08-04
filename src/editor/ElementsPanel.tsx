import { Stack, Text } from '@mantine/core';

export function ElementsPanel() {
  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">Elements</Text>
      <Text size="xs" c="dimmed">Marker, label, route, and region tools arrive in the next tasks.</Text>
    </Stack>
  );
}
