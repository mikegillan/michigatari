import type { ReactNode } from 'react';
import { AppShell, Group } from '@mantine/core';

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
    <AppShell header={{ height: 64 }} navbar={{ width: 280, breakpoint: 0, collapsed }} aside={{ width: 300, breakpoint: 0, collapsed }} footer={{ height: 72 }} padding={0}>
      <AppShell.Header>
        <Group h='100%' px='md' justify='space-between'>
          <Group gap='xs'>
            {/* cream plate matches the logo's native background (sampled from icon.png) */}
            <div style={{ background: '#F9F1E4', borderRadius: 8, padding: '0px 4px', flexShrink: 0 }}>
              <img src='/wide-logo.png' alt='michigatari' style={{ height: 54, display: 'block' }} />
            </div>
          </Group>
          <Group gap='xs'>{header}</Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p='sm' style={{ overflowY: 'auto' }}>
        {navbar}
      </AppShell.Navbar>
      <AppShell.Aside p='sm' style={{ overflowY: 'auto' }}>
        {aside}
      </AppShell.Aside>
      <AppShell.Main style={{ display: 'flex', height: 'calc(100dvh - 48px - 72px)' }}>{main}</AppShell.Main>
      {/* above navbar/aside (z 101) so the playhead label isn't clipped by the panels */}
      <AppShell.Footer p='sm' style={{ zIndex: 102 }}>
        {footer}
      </AppShell.Footer>
    </AppShell>
  );
}
