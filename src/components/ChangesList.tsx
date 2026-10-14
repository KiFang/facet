import { AlertOctagon, AlertTriangle, Check, CircleCheck, Database } from 'lucide-react';
import type { ExportBundle } from '@/utils/exporter';
import { describeChange } from '@/utils/migrations/describe';
import type { SchemaChange } from '@/utils/migrations/diff';
import { useT, useUiLocale } from '@/i18n';
import { cn } from '@/lib/cn';

const SEVERITY_STYLE: Record<SchemaChange['severity'], { icon: typeof Check; cls: string }> = {
  safe: { icon: CircleCheck, cls: 'text-emerald-300' },
  warning: { icon: AlertTriangle, cls: 'text-amber-300' },
  danger: { icon: AlertOctagon, cls: 'text-rose-300' },
};

/** Что изменится в базе: безопасно / предупреждение / удаление данных. */
export function ChangesList({ bundle }: { bundle: ExportBundle }) {
  const t = useT();
  const locale = useUiLocale();
  const changes = bundle.diff.changes;
  return (
    <div className="max-h-48 space-y-1 overflow-auto rounded-xl border border-zinc-800 p-3 text-sm">
      {changes.length === 0 && !bundle.seededRows && <p className="text-zinc-400">{t('update.noChanges')}</p>}
      {changes.map((c, i) => {
        const { icon: Icon, cls } = SEVERITY_STYLE[c.severity];
        return (
          <div key={i} className={cn('flex items-start gap-2', cls)}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{describeChange(c, locale)}</span>
          </div>
        );
      })}
      {bundle.seededRows > 0 && (
        <div className="flex items-start gap-2 text-emerald-300">
          <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t('export.seeded', { n: bundle.seededRows })}</span>
        </div>
      )}
    </div>
  );
}

