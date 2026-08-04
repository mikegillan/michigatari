import { Tabs } from '@mantine/core';
import { ElementsPanel } from './ElementsPanel';
import { SettingsPanel } from './SettingsPanel';

export function AsidePanel() {
  return (
    <Tabs defaultValue="elements" keepMounted={false}>
      <Tabs.List grow>
        <Tabs.Tab value="elements">Elements</Tabs.Tab>
        <Tabs.Tab value="settings">Settings</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="elements" pt="sm"><ElementsPanel /></Tabs.Panel>
      <Tabs.Panel value="settings" pt="sm"><SettingsPanel /></Tabs.Panel>
    </Tabs>
  );
}
