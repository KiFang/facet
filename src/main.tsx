import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from './components/ui/Tooltip';
import { useApplyTheme } from './store/useSettings';
import { useCrossWindowSync } from './lib/sync';
import { currentWindow } from './lib/windows';
import './index.css';

const kind = currentWindow();
const Root = lazy(() =>
  kind === 'help' ? import('./help/HelpApp') : kind === 'data' ? import('./datagrid/DataApp') : import('./App'),
);

function Shell() {
  useApplyTheme();
  useCrossWindowSync();
  return (
    <TooltipProvider>
      <Suspense fallback={<div className="h-screen bg-app" />}>
        <Root />
      </Suspense>
    </TooltipProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
