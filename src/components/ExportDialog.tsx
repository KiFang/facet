import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon, AlertTriangle, Check, CircleCheck, Copy, Database, Download, FileCode2, FolderTree, Loader2, Package,
  PackagePlus, RefreshCcw, ServerCog, Upload,
} from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { buildInstallBundle, buildUpdateBundle, exportFolderName, generateSchemaJson, type ExportBundle } from '@/utils/exporter';
import { downloadBundle, downloadSingleFile } from '@/utils/download';
import { validateSchema } from '@/utils/validate';
import { describeChange } from '@/utils/migrations/describe';
import type { SchemaChange } from '@/utils/migrations/diff';
import { useT, useUiLocale } from '@/i18n';
import { cn } from '@/lib/cn';
import { Button } from './ui/Button';
import { DialogContent } from './ui/Dialog';
import { Segmented } from './ui/Segmented';
import { toast } from './ui/Toast';

type Kind = ExportBundle['kind'];

const SEVERITY_STYLE: Record<SchemaChange['severity'], { icon: typeof Check; cls: string }> = {
  safe: { icon: CircleCheck, cls: 'text-emerald-300' },
  warning: { icon: AlertTriangle, cls: 'text-amber-300' },
  danger: { icon: AlertOctagon, cls: 'text-rose-300' },
};

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
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <ServerCog className="h-5 w-5 shrink-0 text-violet-400" />
      <div className="min-w-0 flex-1 text-sm">
        {baseline ? (
          <>
            <div className="font-medium text-zinc-100">{t('update.baseline')}: {baseline.schema.clubName}</div>
            <div className="text-xs text-zinc-500">
              {t(baseline.source === 'export' ? 'update.fromExport' : 'update.fromFile', {
                date: new Date(baseline.at).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
              })}
            </div>
          </>
        ) : (
          <>
            <div className="font-medium text-zinc-100">{t('update.noBaseline')}</div>
            <div className="text-xs text-zinc-500">{t('update.noBaselineHint')}</div>
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

function ChangesList({ bundle }: { bundle: ExportBundle }) {
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

/** Содержимое диалога «Экспорт в Self-Host». Монтируется при открытии. */
export function ExportDialogContent({ onDone }: { onDone: () => void }) {
  const t = useT();
  const schema = useClubStore((s) => s.schema);
  const seeds = useClubStore((s) => s.seeds);
  const baseline = useClubStore((s) => s.baseline);
  const validation = useMemo(() => validateSchema(schema), [schema]);
  const [kind, setKind] = useState<Kind>(baseline ? 'update' : 'install');
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acceptDanger, setAcceptDanger] = useState(false);

  useEffect(() => {
    let alive = true;
    setBundle(null);
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
    <DialogContent title={t('export.title')} description={t(kind === 'install' ? 'export.descInstall' : 'export.descUpdate')}>
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-6 py-3">
        <Segmented<Kind>
          ariaLabel={t('export.kind')}
          className="w-auto"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'install', label: <><PackagePlus className="h-3.5 w-3.5" /> {t('export.install')}</> },
            { value: 'update', label: <><RefreshCcw className="h-3.5 w-3.5" /> {t('export.update')}</> },
          ]}
        />
        {seededTotal > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-300">
            <Database className="h-3.5 w-3.5" /> {t('export.seedsNote', { n: seededTotal })}
          </span>
        )}
      </div>

      {kind === 'update' && (
        <div className="space-y-3 border-b border-zinc-800 px-6 py-4">
          <BaselinePanel />
          {baseline && bundle && <ChangesList bundle={bundle} />}
          {baseline && hasDanger && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-rose-200">
              <input type="checkbox" checked={acceptDanger} onChange={(e) => setAcceptDanger(e.target.checked)} className="mt-1 accent-rose-500" />
              {t('update.acceptDanger')}
            </label>
          )}
        </div>
      )}
      {kind === 'install' && baseline && (
        <p className="flex items-start gap-2 border-b border-zinc-800 px-6 py-3 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('export.installWarning')}
        </p>
      )}

      {!bundle ? (
        <div className="grid min-h-[280px] flex-1 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_1fr]">
          <aside className="max-h-[38vh] min-h-0 overflow-auto border-b border-zinc-800 p-3 md:max-h-none md:border-b-0 md:border-r">
            <div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
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
                      className={cn('w-full rounded-lg px-2 py-1.5 text-left transition-colors', f.path === file?.path ? 'bg-violet-500/15 text-white' : 'text-zinc-300 hover:bg-zinc-800')}
                      style={{ paddingLeft: 8 + depth * 10 }}
                    >
                      <span className="flex items-center gap-2 font-mono text-xs">
                        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                        <span className="truncate">{f.path.split('/').pop()}</span>
                      </span>
                      <span className="mt-0.5 block truncate pl-[22px] text-[11px] text-zinc-500">{f.description}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2">
              <span className="truncate font-mono text-xs text-zinc-400">{file?.path}</span>
              <div className="flex gap-1">
                {file?.encoding !== 'base64' && (
                  <Button size="sm" variant="ghost" onClick={() => void copy()}>
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
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
              <div className="grid min-h-[260px] flex-1 place-items-center bg-zinc-950 p-4">
                <img src={`data:image/${file.path.endsWith('svg') ? 'svg+xml' : file.path.split('.').pop()};base64,${file.content}`} alt="" className="max-h-40" />
              </div>
            ) : (
              <pre className="min-h-[260px] flex-1 overflow-auto bg-zinc-950 p-4 font-mono text-[12px] leading-relaxed text-zinc-300">
                {file && file.content.length > 60_000 ? `${file.content.slice(0, 60_000)}\n…` : file?.content}
              </pre>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-6 py-4">
        {validation.ok ? (
          <p className="min-w-0 truncate font-mono text-xs text-zinc-300">{command}</p>
        ) : (
          <p className="text-sm text-rose-300">{t('export.fixSchema')}: {validation.errors.slice(0, 2).join('; ')}</p>
        )}
        <Button variant="primary" disabled={!canDownload} onClick={() => void download()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
          {t(kind === 'install' ? 'export.downloadInstall' : 'export.downloadUpdate', { n: files.length })}
        </Button>
      </div>
    </DialogContent>
  );
}
