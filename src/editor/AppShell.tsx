import type { ReactNode } from 'react';
import { AppShell, Group, Text } from '@mantine/core';

interface EditorShellProps {
  header?: ReactNode;
  navbar?: ReactNode;
  aside?: ReactNode;
  main?: ReactNode;
  footer?: ReactNode;
  /** Hide both side panels (preview mode: editing is disabled anyway, and
   * collapsing makes that obvious instead of showing greyed-out controls). */
  panelsCollapsed?: boolean;
}

export function EditorShell({ header, navbar, aside, main, footer, panelsCollapsed = false }: EditorShellProps) {
  const collapsed = { desktop: panelsCollapsed, mobile: panelsCollapsed };
  return (
    <AppShell
      header={{ height: 48 }}
      navbar={{ width: 280, breakpoint: 0, collapsed }}
      aside={{ width: 300, breakpoint: 0, collapsed }}
      footer={{ height: 72 }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            {/* overflow crop hides the icon's white matte on the dark header */}
            <div style={{ width: 28, height: 28, borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
              <img
                src="/icon.png"
                alt=""
                style={{ width: 36, height: 36, margin: -4, display: 'block' }}
              />
            </div>
            <Text fw={700}>Michigatari</Text>
          </Group>
          <Group gap="xs">{header}</Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm" style={{ overflowY: 'auto' }}>{navbar}</AppShell.Navbar>
      <AppShell.Aside p="sm" style={{ overflowY: 'auto' }}>{aside}</AppShell.Aside>
      <AppShell.Main style={{ display: 'flex', height: 'calc(100dvh - 48px - 72px)' }}>
        {main}
      </AppShell.Main>
      {/* above navbar/aside (z 101) so the playhead label isn't clipped by the panels */}
      <AppShell.Footer p="sm" style={{ zIndex: 102 }}>{footer}</AppShell.Footer>
    </AppShell>
  );
}
