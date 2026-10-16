import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Cloud, Database, Languages, Monitor, Moon, Plug, Sun } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useSettings } from '@/store/useSettings';
import { useWorkbench } from '@/store/useWorkbench';
import { useT, useUiStore } from '@/i18n';
import { validateSchema } from '@/utils/validate';
import { desktop, type LocalServerInfo } from '@/desktop';
import { FACET_VERSION } from '@/version';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/cn';

function Cell({ children, onClick, title, className }: { children: React.ReactNode; onClick?: () => void; title?: string; className?: string }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={cn('flex h-full items-center gap-1.5 px-2.5 text-2xs text-fg-muted', onClick && 'hover:bg-hover hover:text-fg', className)}
    >
      {children}
    </Tag>
  );
}

export function StatusBar() {
  const t = useT();
  const schema = useClubStore((s) => s.schema);
  const seeds = useClubStore((s) => s.seeds);
  const baseline = useClubStore((s) => s.baseline);
  const theme = useSettings((s) => s.theme);
  const setSettings = useSettings((s) => s.set);
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const open = useWorkbench((s) => s.open);
  const validation = useMemo(() => validateSchema(schema), [schema]);
  const fields = schema.entities.reduce((n, e) => n + e.fields.length, 0);
  const seeded = Object.values(seeds).reduce((n, b) => n + b.rows.length, 0);
  const plugins = (schema.plugins ?? []).filter((p) => p.enabled).length;
  const [local, setLocal] = useState<LocalServerInfo | null>(null);

  useEffect(() => {
    const api = desktop()?.localServer;
    if (!api) return;
    const poll = () => void api.info().then(setLocal).catch(() => setLocal(null));
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="flex h-6 shrink-0 items-stretch divide-x divide-line border-t border-line bg-sunken" role="status">
      {validation.ok ? (
        <Cell className="text-success"><CheckCircle2 className="h-3 w-3" /> {t('status.valid')}</Cell>
      ) : (
        <Popover.Root>
          <Popover.Trigger asChild>
            <button type="button" className="flex h-full items-center gap-1.5 px-2.5 text-2xs font-medium text-danger hover:bg-hover">
              <CircleAlert className="h-3 w-3" /> {t('status.errors', { n: validation.errors.length })}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="top" align="start" sideOffset={4} className="z-60 max-h-72 w-[440px] overflow-auto rounded-md border border-line-strong bg-raised p-3 text-xs shadow-pop">
              <div className="mb-1 font-semibold text-fg">{t('status.problems')}</div>
              <ul className="list-disc space-y-0.5 pl-4 font-mono text-danger">{validation.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      <Cell>{t('status.counts', { modules: schema.entities.length, fields })}</Cell>
      {seeded > 0 && <Cell className="text-success" title={t('export.seedsNote', { n: seeded })}><Database className="h-3 w-3" /> {t('status.seeded', { n: seeded })}</Cell>}
      <Cell onClick={() => open('export', 'update')} title={t('status.baselineHint')}>
        <Cloud className="h-3 w-3" />
        {baseline ? t('status.baseline', { date: new Date(baseline.at).toLocaleDateString(locale) }) : t('status.noBaseline')}
      </Cell>
      {local && (
        <Cell onClick={() => open('export', 'local')}>
          <Monitor className="h-3 w-3" />
          <span className={cn('h-1.5 w-1.5 rounded-full', local.running ? 'bg-success' : 'bg-fg-subtle')} />
          {t(local.running ? 'status.localRunning' : local.installed ? 'status.localStopped' : 'status.localNone')}
        </Cell>
      )}
      <span className="flex-1" />
      <Cell onClick={() => open('plugins')}><Plug className="h-3 w-3" /> {t('status.plugins', { n: plugins })}</Cell>
      <Cell onClick={() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })} title={t('menu.theme')}>
        {theme === 'dark' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
      </Cell>
      <Cell onClick={() => setLocale(locale === 'ru' ? 'en' : 'ru')} title={t('lang.switch')}>
        <Languages className="h-3 w-3" /> {locale.toUpperCase()}
      </Cell>
      <Cell>Facet OS {FACET_VERSION}</Cell>
    </footer>
  );
}
