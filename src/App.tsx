import { EditorShell } from './editor/AppShell';
import { SettingsPanel } from './editor/SettingsPanel';
import { MapView } from './editor/MapView';
import { KeyframePanel } from './editor/KeyframePanel';
import { PreviewBar } from './editor/PreviewBar';

export default function App() {
  return (
    <EditorShell
      navbar={<KeyframePanel />}
      aside={<SettingsPanel />}
      main={<MapView />}
      footer={<PreviewBar />}
    />
  );
}
