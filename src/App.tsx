import { EditorShell } from './editor/AppShell';
import { SettingsPanel } from './editor/SettingsPanel';

export default function App() {
  return <EditorShell aside={<SettingsPanel />} />;
}
