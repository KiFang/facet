import { Braces, Monitor, Network } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useWorkbench, type WorkspaceTab } from '@/store/useWorkbench';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { LivePreview } from '../LivePreview';
import { SchemaEditor } from '../SchemaEditor';
import { SchemaDiagram } from './SchemaDiagram';

/** Центральная область: вкладки документа как в IDE. */
export function Workspace() {
  const t = useT();
  const tab = useWorkbench((s) => s.tab);
  const setTab = useWorkbench((s) => s.setTab);
  const mode = useClubStore((s) => s.schema.editorMode);
  const tabs: { id: WorkspaceTab; label: string; icon: typeof Monitor; key: string }[] = [
    { id: 'portal', label: t('workspace.portal'), icon: Monitor, key: 'Ctrl+1' },
    { id: 'diagram', label: t('workspace.diagram'), icon: Network, key: 'Ctrl+2' },
    ...(mode === 'pro' ? [{ id: 'json' as const, label: t('workspace.json'), icon: Braces, key: 'Ctrl+3' }] : []),
  ];
  const current = tabs.some((x) => x.id === tab) ? tab : 'portal';

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-8 shrink-0 items-end gap-px border-b border-line bg-sunken px-1.5" role="tablist" aria-label={t('workspace.aria')}>
        {tabs.map(({ id, label, icon: Icon, key }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={current === id}
            title={`${label} (${key})`}
            onClick={() => setTab(id)}
            className={cn(
              '-mb-px flex h-7 items-center gap-1.5 rounded-t-md border border-b-0 px-3 text-xs font-medium transition-colors',
              current === id ? 'border-line bg-app text-fg' : 'border-transparent text-fg-muted hover:bg-hover hover:text-fg',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 bg-app">
        {current === 'portal' && <LivePreview />}
        {current === 'diagram' && <SchemaDiagram />}
        {current === 'json' && <div className="h-full overflow-auto p-4"><SchemaEditor /></div>}
      </div>
    </div>
  );
}
