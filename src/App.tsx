import { EditorShell } from './editor/AppShell';
import { SettingsPanel } from './editor/SettingsPanel';
import { MapView } from './editor/MapView';

export default function App() {
  return <EditorShell aside={<SettingsPanel />} main={<MapView />} />;
}
