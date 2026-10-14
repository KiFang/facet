import { HelpCircle } from 'lucide-react';
import { useT } from '@/i18n';
import { openHelp } from '@/lib/windows';
import { Tip } from '../ui/Tooltip';

/** Шапка панели свойств: значок, заголовок, подзаголовок и ссылка на раздел справки. */
export function PropertyPage({ icon, title, subtitle, help, actions, children }: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  help?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start gap-2.5 border-b border-line bg-sunken px-4 py-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-accent">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-fg">{title}</h2>
          {subtitle && <p className="truncate text-2xs text-fg-subtle">{subtitle}</p>}
        </div>
        {actions}
        {help && (
          <Tip content={t('help.contextual')} shortcut="F1">
            <button type="button" onClick={() => openHelp(help)} className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg" aria-label={t('help.contextual')}>
              <HelpCircle className="h-4 w-4" />
            </button>
          </Tip>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-auto px-4 py-4">{children}</div>
    </div>
  );
}
