import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Copy, Database, Download, FileCode2, FolderTree, Loader2, Package,
  Monitor, PackagePlus, RefreshCcw, ServerCog, Upload,
} from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { buildInstallBundle, buildUpdateBundle, exportFolderName, generateSchemaJson, type ExportBundle } from '@/utils/exporter';
import { downloadBundle, downloadSingleFile } from '@/utils/download';
import { validateSchema } from '@/utils/validate';
import { useT, useUiLocale } from '@/i18n';
import { desktop } from '@/desktop';
import { LocalServerPanel } from './LocalServerPanel';
import { ChangesList } from './ChangesList';
import { cn } from '@/lib/cn';
import { Button } from './ui/Button';
import { DialogContent } from './ui/Dialog';
import { Segmented } from './ui/Segmented';
import { toast } from './ui/Toast';

type Kind = ExportBundle['kind'] | 'local';

function BaselinePanel() {
  const t = useT();
  const baseline = useClubStore((s) => s.baseline);
  const setBaseline = useClubStore((s) => s.setBaseline);
  const ref = useRef<HTMLInputElement>(null);
  const locale = useUiLocale();

  const upload = async (file: File) => {
    const raw = await file.text();
    try {
      const result = validateSchema(JSON.parse(raw));
      if (!result.ok || !result.schema) throw new Error(result.errors.slice(0, 2).join('; '));
      setBaseline({ schema: result.schema, raw, source: 'file', at: new Date().toISOString() });
      toast('success', t('update.baselineLoaded', { name: result.schema.clubName }));
    } catch (err) {
      toast('error', `${t('update.baselineFailed')}: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-sunken p-3">
      <ServerCog className="h-5 w-5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1 text-sm">
        {baseline ? (
          <>
            <div className="font-medium text-fg">{t('update.baseline')}: {baseline.schema.clubName}</div>
            <div className="text-xs text-fg-subtle">
              {t(baseline.source === 'export' ? 'update.fromExport' : 'update.fromFile', {
                date: new Date(baseline.at).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
              })}
            </div>
          </>
        ) : (
          <>
            <div className="font-medium text-fg">{t('update.noBaseline')}</div>
            <div className="text-xs text-fg-subtle">{t('update.noBaselineHint')}</div>
          </>
        )}
      </div>
      <input ref={ref} type="file" accept="application/json,.json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
      <Button size="sm" onClick={() => ref.current?.click()} title={t('update.uploadHint')}>
        <Upload className="h-3.5 w-3.5" /> {t('update.upload')}
      </Button>
    </div>
  );
}

/** Содержимое диалога «Экспорт в Self-Host». Монтируется при открытии. */
export function ExportDialogContent({ onDone, initialKind }: { onDone: () => void; initialKind?: 'install' | 'update' | 'local' }) {
  const t = useT();
  const schema = useClubStore((s) => s.schema);
  const seeds = useClubStore((s) => s.seeds);
  const baseline = useClubStore((s) => s.baseline);
  const validation = useMemo(() => validateSchema(schema), [schema]);
  const onDesktop = !!desktop();
  const [kind, setKind] = useState<Kind>(
    initialKind && (initialKind !== 'local' || onDesktop) ? initialKind : onDesktop ? 'local' : baseline ? 'update' : 'install',
  );
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acceptDanger, setAcceptDanger] = useState(false);

  useEffect(() => {
    let alive = true;
    setBundle(null);
    if (kind === 'local') return;
    const build = kind === 'update' && baseline ? buildUpdateBundle(baseline, schema, seeds) : buildInstallBundle(schema, seeds);
    void build.then((b) => alive && setBundle(b));
    return () => {
      alive = false;
    };
  }, [kind, schema, seeds, baseline]);

  useEffect(() => setAcceptDanger(false), [bundle?.diff.changes.length, kind]);

  const files = bundle?.files ?? [];
  const file = files.find((f) => f.path === selected) ?? files[0];
  const hasDanger = !!bundle?.diff.changes.some((c) => c.severity === 'danger');
  const seededTotal = Object.values(seeds).reduce((n, b) => n + b.rows.length, 0);
  const canDownload = !!bundle && validation.ok && !busy && (kind === 'install' || (!!baseline && (!hasDanger || acceptDanger)));

  const copy = async () => {
    if (!file) return;
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = async () => {
    if (!bundle) return;
    setBusy(true);
    try {
      await downloadBundle(bundle);
      const { setBaseline, clearSeeds } = useClubStore.getState();
      // Скачанная версия — теперь «версия на сервере»: следующее обновление считается от неё.
      setBaseline({ schema, raw: generateSchemaJson(schema), source: 'export', at: new Date().toISOString() });
      clearSeeds();
      toast('success', t(kind === 'install' ? 'export.doneInstall' : 'export.doneUpdate'));
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const command = kind === 'install'
    ? `unzip ${bundle?.folder ?? '…'}.zip && cd ${bundle?.folder ?? '…'} && sudo ./install.sh`
    : `cd ${bundle?.folder ?? '…'} && ./apply-update.sh /opt/${exportFolderName(schema)}`;

  return (
    <DialogContent
      title={t('export.title')}
      description={t(kind === 'local' ? 'local.desc' : kind === 'install' ? 'export.descInstall' : 'export.descUpdate')}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3">
        <Segmented<Kind>
          ariaLabel={t('export.kind')}
          className="w-auto"
          value={kind}
          onChange={setKind}
          options={[
            ...(onDesktop ? [{ value: 'local' as const, label: <><Monitor className="h-3.5 w-3.5" /> {t('local.tab')}</> }] : []),
            { value: 'install', label: <><PackagePlus className="h-3.5 w-3.5" /> {t('export.install')}</> },
            { value: 'update', label: <><RefreshCcw className="h-3.5 w-3.5" /> {t('export.update')}</> },
          ]}
        />
        {seededTotal > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-success">
            <Database className="h-3.5 w-3.5" /> {t('export.seedsNote', { n: seededTotal })}
          </span>
        )}
      </div>

      {kind === 'local' ? (
        <LocalServerPanel />
      ) : (
      <>
      {kind === 'update' && (
        <div className="space-y-3 border-b border-line px-6 py-4">
          <BaselinePanel />
          {baseline && bundle && <ChangesList bundle={bundle} />}
          {baseline && hasDanger && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-danger">
              <input type="checkbox" checked={acceptDanger} onChange={(e) => setAcceptDanger(e.target.checked)} className="mt-1 accent-[rgb(var(--c-danger))]" />
              {t('update.acceptDanger')}
            </label>
          )}
        </div>
      )}
      {kind === 'install' && baseline && (
        <p className="flex items-start gap-2 border-b border-line px-6 py-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('export.installWarning')}
        </p>
      )}

      {!bundle ? (
        <div className="grid min-h-[280px] flex-1 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_1fr]">
          <aside className="max-h-[38vh] min-h-0 overflow-auto border-b border-line p-3 md:max-h-none md:border-b-0 md:border-r">
            <div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              <FolderTree className="h-3.5 w-3.5" /> <span className="truncate">{bundle.folder}/</span>
            </div>
            <ul className="space-y-0.5">
              {files.map((f) => {
                const depth = f.path.split('/').length - 1;
                return (
                  <li key={f.path}>
                    <button
                      type="button"
                      onClick={() => setSelected(f.path)}
                      className={cn('w-full rounded-lg px-2 py-1.5 text-left transition-colors', f.path === file?.path ? 'bg-accent-soft text-fg' : 'text-fg hover:bg-hover')}
                      style={{ paddingLeft: 8 + depth * 10 }}
                    >
                      <span className="flex items-center gap-2 font-mono text-xs">
                        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-accent" />
                        <span className="truncate">{f.path.split('/').pop()}</span>
                      </span>
                      <span className="mt-0.5 block truncate pl-[22px] text-[11px] text-fg-subtle">{f.description}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
              <span className="truncate font-mono text-xs text-fg-muted">{file?.path}</span>
              <div className="flex gap-1">
                {file?.encoding !== 'base64' && (
                  <Button size="sm" variant="ghost" onClick={() => void copy()}>
                    {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? t('common.copied') : t('common.copy')}
                  </Button>
                )}
                {file && (
                  <Button size="sm" variant="ghost" onClick={() => void downloadSingleFile(file)}>
                    <Download className="h-3.5 w-3.5" /> {t('export.file')}
                  </Button>
                )}
              </div>
            </div>
            {file?.encoding === 'base64' ? (
              <div className="grid min-h-[260px] flex-1 place-items-center bg-app p-4">
                <img src={`data:image/${file.path.endsWith('svg') ? 'svg+xml' : file.path.split('.').pop()};base64,${file.content}`} alt="" className="max-h-40" />
              </div>
            ) : (
              <pre className="min-h-[260px] flex-1 overflow-auto bg-app p-4 font-mono text-[12px] leading-relaxed text-fg">
                {file && file.content.length > 60_000 ? `${file.content.slice(0, 60_000)}\n…` : file?.content}
              </pre>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
        {validation.ok ? (
          <p className="min-w-0 truncate font-mono text-xs text-fg">{command}</p>
        ) : (
          <p className="text-sm text-danger">{t('export.fixSchema')}: {validation.errors.slice(0, 2).join('; ')}</p>
        )}
        <Button variant="primary" disabled={!canDownload} onClick={() => void download()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
          {t(kind === 'install' ? 'export.downloadInstall' : 'export.downloadUpdate', { n: files.length })}
        </Button>
      </div>
      </>
      )}
    </DialogContent>
  );
}
