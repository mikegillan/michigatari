import type { ReactNode } from 'react';
import { AppShell, Group, Text } from '@mantine/core';

interface EditorShellProps {
  header?: ReactNode;
  navbar?: ReactNode;
  aside?: ReactNode;
  main?: ReactNode;
  footer?: ReactNode;
}

export function EditorShell({ header, navbar, aside, main, footer }: EditorShellProps) {
  return (
    <AppShell
      header={{ height: 48 }}
      navbar={{ width: 280, breakpoint: 0 }}
      aside={{ width: 300, breakpoint: 0 }}
      footer={{ height: 72 }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700}>Michigatari</Text>
          <Group gap="xs">{header}</Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">{navbar}</AppShell.Navbar>
      <AppShell.Aside p="sm">{aside}</AppShell.Aside>
      <AppShell.Main style={{ display: 'flex', height: 'calc(100dvh - 48px - 72px)' }}>
        {main}
      </AppShell.Main>
      <AppShell.Footer p="sm">{footer}</AppShell.Footer>
    </AppShell>
  );
}
