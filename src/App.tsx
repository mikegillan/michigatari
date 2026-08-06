import { EditorShell } from './editor/AppShell';
import { AsidePanel } from './editor/AsidePanel';
import { MapView } from './editor/MapView';
import { KeyframePanel } from './editor/KeyframePanel';
import { PreviewBar } from './editor/PreviewBar';
import { ProjectMenu } from './editor/ProjectMenu';
import { ExportDialog } from './editor/ExportDialog';
import { useEditorStore } from './editor/store';

export default function App() {
  const previewing = useEditorStore((s) => s.mode === 'preview');
  return (
    <EditorShell
      header={<><ProjectMenu /><ExportDialog /></>}
      navbar={<KeyframePanel />}
      aside={<AsidePanel />}
      main={<MapView />}
      footer={<PreviewBar />}
      panelsCollapsed={previewing}
    />
  );
}
