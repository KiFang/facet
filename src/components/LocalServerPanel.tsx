import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Copy, ExternalLink, FolderOpen, Loader2, Play, RotateCcw, ShieldCheck, Square, Wifi, Zap,
} from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { desktop, type LocalServerInfo } from '@/desktop';
import { buildInstallBundle, buildUpdateBundle, type ExportBundle } from '@/utils/exporter';
import { validateSchema } from '@/utils/validate';
import { generateSchemaJson } from '@/utils/schemaJson';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { Button } from './ui/Button';
import { Switch } from './ui/Switch';
import { toast } from './ui/Toast';
import { ChangesList } from './ChangesList';

/**
 * Десктоп: система клуба на этом компьютере (PocketBase из установщика, без Docker).
 * Первый запуск — установка, дальше — инкрементальные обновления с копией перед каждым.
 */
export function LocalServerPanel() {
  const t = useT();
  const api = desktop()!.localServer;
  const schema = useClubStore((s) => s.schema);
  const seeds = useClubStore((s) => s.seeds);
  const [info, setInfo] = useState<LocalServerInfo | null>(null);
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptDanger, setAcceptDanger] = useState(false);
  const validation = useMemo(() => validateSchema(schema), [schema]);

  const run = useCallback(async (label: string, fn: () => Promise<LocalServerInfo>) => {
    setBusy(label);
    setError(null);
    try {
      setInfo(await fn());
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void run('info', api.info);
  }, [api, run]);

  // Версия на этом ПК — база для обновления (как club-schema.json на сервере).
  useEffect(() => {
    if (!info) return;
    let alive = true;
    setBundle(null);
    const base = info.schemaRaw ? validateSchema(JSON.parse(info.schemaRaw)) : null;
    const build = base?.ok && base.schema
      ? buildUpdateBundle({ schema: base.schema, raw: info.schemaRaw!, source: 'file', at: '' }, schema, seeds)
      : buildInstallBundle(schema, seeds);
    void build.then((b) => alive && setBundle(b));
    return () => {
      alive = false;
    };
  }, [info?.schemaRaw, schema, seeds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setAcceptDanger(false), [bundle]);

  const hasDanger = !!bundle?.diff.changes.some((c) => c.severity === 'danger');
  // Тема, логотип или вид раздела меняют только файлы портала — их тоже нужно применить.
  const upToDate = bundle?.kind === 'update' && !bundle.seededRows && info?.schemaRaw === generateSchemaJson(schema);

  const apply = async () => {
    if (!bundle) return;
    const ok = await run('apply', () => api.apply({ kind: bundle.kind, files: bundle.files }));
    if (ok) {
      useClubStore.getState().clearSeeds();
      toast('success', t(bundle.kind === 'install' ? 'local.installed' : 'local.updated'));
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast('success', t('common.copied'));
  };

  if (!info) {
    return <div className="grid min-h-[320px] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto px-6 py-5">
      {/* Статус */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-sunken p-4">
        <span className={cn('relative flex h-3 w-3', !info.running && 'opacity-60')}>
          {info.running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />}
          <span className={cn('relative inline-flex h-3 w-3 rounded-full', info.running ? 'bg-success' : info.installed ? 'bg-fg-subtle' : 'bg-line-strong')} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-fg">
            {t(info.running ? 'local.running' : info.installed ? 'local.stopped' : 'local.notInstalled')}
          </div>
          <div className="truncate text-xs text-fg-subtle">{info.running ? info.url : t('local.where', { dir: info.dataDir })}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {info.running && (
            <>
              <Button size="sm" variant="primary" onClick={() => void api.openUrl(`${info.url}/`)}>
                <ExternalLink className="h-3.5 w-3.5" /> {t('local.openPortal')}
              </Button>
              <Button size="sm" onClick={() => void api.openUrl(`${info.url}/_/`)}>
                <ShieldCheck className="h-3.5 w-3.5" /> {t('local.openAdmin')}
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void run('stop', api.stop)}>
                {busy === 'stop' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} {t('local.stop')}
              </Button>
            </>
          )}
          {!info.running && info.installed && (
            <Button size="sm" variant="primary" disabled={!!busy} onClick={() => void run('start', api.start)}>
              {busy === 'start' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {t('local.start')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void api.openFolder()} title={info.dataDir}>
            <FolderOpen className="h-3.5 w-3.5" /> {t('local.folder')}
          </Button>
        </div>
      </div>

      {/* Доступ */}
      {info.installed && (
        <div className="grid gap-3 md:grid-cols-2">
          {info.admin && (
            <div className="rounded-lg border border-line p-4 text-sm">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">{t('local.admin')}</div>
              {[info.admin.email, info.admin.password].map((value, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-fg-subtle">{t(i === 0 ? 'local.login' : 'local.password')}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-fg">{value}</code>
                  <Button size="icon" variant="ghost" aria-label={t('common.copy')} onClick={() => void copy(value)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-line p-4 text-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                <Wifi className="h-3.5 w-3.5" /> {t('local.lan')}
              </span>
              <Switch checked={info.lan} label={t('local.lan')} onChange={(v) => void run('lan', () => api.setLan(v))} />
            </div>
            <p className="text-xs text-fg-subtle">{t('local.lanHint')}</p>
            {info.lanUrls.map((u) => (
              <button key={u} type="button" onClick={() => void copy(u)} className="mt-1 block font-mono text-xs text-accent-text hover:underline">{u}</button>
            ))}
          </div>
        </div>
      )}

      {/* Изменения */}
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          {t(info.installed ? 'local.changes' : 'local.firstInstall')}
        </div>
        {!bundle ? (
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        ) : (
          <>
            {bundle.kind === 'install' ? (
              <p className="text-sm text-fg-muted">{t('local.installHint')}</p>
            ) : upToDate ? (
              <p className="text-sm text-fg-muted">{t('local.upToDate')}</p>
            ) : (
              <ChangesList bundle={bundle} />
            )}
            {hasDanger && (
              <label className="flex cursor-pointer items-start gap-2 text-sm text-danger">
                <input type="checkbox" checked={acceptDanger} onChange={(e) => setAcceptDanger(e.target.checked)} className="mt-1 accent-[rgb(var(--c-danger))]" />
                {t('local.acceptDanger')}
              </label>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={!bundle || !validation.ok || !!busy || upToDate || (hasDanger && !acceptDanger)}
            onClick={() => void apply()}
          >
            {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {t(bundle?.kind === 'update' ? 'local.apply' : 'local.install')}
          </Button>
          {info.backups.length > 0 && (
            <Button variant="ghost" disabled={!!busy} onClick={() => void run('rollback', api.rollback)} title={info.backups[0]}>
              <RotateCcw className="h-4 w-4" /> {t('local.rollback')}
            </Button>
          )}
        </div>
        {!validation.ok && <p className="text-sm text-danger">{t('export.fixSchema')}: {validation.errors.slice(0, 2).join('; ')}</p>}
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> {t('local.error')}</div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono">{error}</pre>
        </div>
      )}
    </div>
  );
}
