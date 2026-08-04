import { EditorShell } from './editor/AppShell';
import { AsidePanel } from './editor/AsidePanel';
import { MapView } from './editor/MapView';
import { KeyframePanel } from './editor/KeyframePanel';
import { PreviewBar } from './editor/PreviewBar';
import { ProjectMenu } from './editor/ProjectMenu';

export default function App() {
  return (
    <EditorShell
      header={<ProjectMenu />}
      navbar={<KeyframePanel />}
      aside={<AsidePanel />}
      main={<MapView />}
      footer={<PreviewBar />}
    />
  );
}
