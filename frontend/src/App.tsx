import { useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useStatusSync } from './hooks/useStatusSync';
import { TopBar } from './components/Layout/TopBar';
import { Sidebar } from './components/Layout/Sidebar';
import { BottomPanel } from './components/Layout/BottomPanel';
import { Workspace } from './components/Workspace/Workspace';
import { useLayoutStore } from './store/layoutStore';

export function App() {
  useStatusSync();
  useWebSocket();

  const sidebarOpen   = useLayoutStore((s) => s.sidebarOpen);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const hasBottom     = useLayoutStore((s) => s.panes.bottom.length > 0);

  // Ctrl+B toggles the sidebar (same shortcut as VS Code)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  return (
    <div className={`app-shell${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      <TopBar />
      <Sidebar />
      <Workspace />
      {hasBottom && <BottomPanel />}
    </div>
  );
}
