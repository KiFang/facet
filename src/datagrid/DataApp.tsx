import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CircleHelp, Cloud, Database, Download, FileEdit, Loader2, LogOut, Monitor, Plus, RefreshCw, Save, Search, Table2, Trash2, Undo2, Upload,
} from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useSettings } from '@/store/useSettings';
import { useT, useUiLocale } from '@/i18n';
import { desktop } from '@/desktop';
import { cn } from '@/lib/cn';
import { getEntityIcon } from '@/lib/icons';
import { listenWindows, openHelp } from '@/lib/windows';
import { parseCsv } from '@/utils/csv';
import { Button } from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import { Tip } from '@/components/ui/Tooltip';
import { Toaster, toast } from '@/components/ui/Toast';
import type { ClubEntity } from '@/types/schema';
import { draftSource, serverSource, signIn, type ServerAuth } from './sources';
import { dirtyCount, useGrid, type Row } from './store';
import { Grid, type SortState } from './Grid';
import type { CellValue, DataSourceApi, GridColumn, RelationOption, SourceKind } from './types';
import { cellText, clipboardText, parseText, toCsv, unknownLinks } from './values';

const AUTH_KEY = 'facet-os:data-auth';

function storedAuth(): ServerAuth | null {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as ServerAuth) : null;
  } catch {
    return null;
  }
}

function saveAuth(auth: ServerAuth | null) {
  try {
    if (auth) sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    else sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* приватный режим — вход до закрытия окна */
  }
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'connect' }
  | { kind: 'local'; state: 'none' | 'stopped' | 'noadmin' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

function compare(col: GridColumn, a: CellValue, b: CellValue, rel: Record<string, RelationOption[]>, locale: string): number {
  const ea = a === '' || a === null || (Array.isArray(a) && !a.length);
  const eb = b === '' || b === null || (Array.isArray(b) && !b.length);
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (col.type === 'number' && typeof a === 'number' && typeof b === 'number') return a - b;
  if (col.type === 'date') return String(a).localeCompare(String(b));
  return cellText(col, a, rel, locale).localeCompare(cellText(col, b, rel, locale), locale, { numeric: true });
}

export default function DataApp() {
  const t = useT();
  const locale = useUiLocale();
  const schema = useClubStore((s) => s.schema);
  const seeds = useClubStore((s) => s.seeds);
  const serverSettings = useSettings((s) => s.server);
  const setSettings = useSettings((s) => s.set);
  const rows = useGrid((s) => s.rows);
  const columns = useGrid((s) => s.columns);
  const rel = useGrid((s) => s.relOptions);

  const desk = desktop();
  const [kind, setKind] = useState<SourceKind>(() => (desk ? 'local' : storedAuth() ? 'server' : 'draft'));
  const [auth, setAuth] = useState<ServerAuth | null>(() => storedAuth());
  const [localAuth, setLocalAuth] = useState<ServerAuth | null>(null);
  const [entityId, setEntityId] = useState<string>(() => new URLSearchParams(location.search).get('entity') ?? '');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [tick, setTick] = useState(0);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [cursor, setCursor] = useState<{ row?: Row; col?: GridColumn; count: number; keys: string[] }>({ count: 0, keys: [] });
  const fileInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<{ row: Row; col: GridColumn } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const entity: ClubEntity | undefined = schema.entities.find((e) => e.id === entityId) ?? schema.entities[0];
  const dirty = dirtyCount(rows);

  const source: DataSourceApi | null = useMemo(() => {
    if (kind === 'draft') return draftSource();
    if (kind === 'server') return auth ? serverSource(auth, 'server') : null;
    return localAuth ? serverSource(localAuth, 'local') : null;
  }, [kind, auth, localAuth]);

  /* ----------------------------- local server ------------------------------ */

  const connectLocal = useCallback(async () => {
    if (!desk) return;
    setPhase({ kind: 'loading' });
    try {
      const info = await desk.localServer.info();
      if (!info.installed) return setPhase({ kind: 'local', state: 'none' });
      if (!info.running || !info.url) return setPhase({ kind: 'local', state: 'stopped' });
      if (!info.admin) return setPhase({ kind: 'local', state: 'noadmin' });
      setLocalAuth(await signIn(info.url, info.admin.email, info.admin.password));
    } catch (err) {
      setPhase({ kind: 'error', message: (err as Error).message });
    }
  }, [desk]);

  useEffect(() => {
    if (kind === 'local' && !localAuth) void connectLocal();
    if (kind === 'server' && !auth) setPhase({ kind: 'connect' });
  }, [kind, auth, localAuth, connectLocal]);

  /* --------------------------------- load ---------------------------------- */

  const load = useCallback(async () => {
    if (!source || !entity) return;
    setPhase({ kind: 'loading' });
    setStale(false);
    try {
      const cols = await source.columns(entity);
      const records = await source.load(entity, cols);
      const targets = Array.from(new Set(cols.filter((c) => c.type === 'relation' && c.target).map((c) => c.target!)));
      const options = Object.fromEntries(await Promise.all(targets.map(async (id) => [id, await source.relationOptions(id).catch(() => [])] as const)));
      useGrid.getState().load(cols, records, options);
      setPhase({ kind: 'ready' });
    } catch (err) {
      const message = (err as Error).message;
      useGrid.getState().reset();
      if (message.startsWith('collection-missing')) setPhase({ kind: 'missing' });
      else if ([401, 403].includes((err as { status?: number }).status ?? 0) && source.kind !== 'draft') {
        if (source.kind === 'server') {
          saveAuth(null);
          setAuth(null);
          setPhase({ kind: 'connect' });
        } else {
          setLocalAuth(null);
        }
      } else setPhase({ kind: 'error', message });
    }
  }, [source, entity]);

  useEffect(() => {
    void load();
    // загрузка по смене источника/раздела и по кнопке «Обновить»
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, entity?.id, tick]);

  // Структура или черновик изменились в другом окне.
  const savingRef = useRef(false);
  const firstExternal = useRef(true);
  const draftBatch = entity ? seeds[entity.id] : undefined;
  useEffect(() => {
    if (firstExternal.current) {
      firstExternal.current = false;
      return;
    }
    if (savingRef.current) return;
    if (kind !== 'draft' && phase.kind !== 'ready') return;
    if (dirtyCount(useGrid.getState().rows)) setStale(true);
    else setTick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, kind === 'draft' ? draftBatch : null]);

  /* ------------------------------ navigation ------------------------------- */

  const confirmDiscard = useCallback(() => !dirtyCount(useGrid.getState().rows) || window.confirm(t('grid.confirmDiscard')), [t]);

  const switchEntity = useCallback(
    (id: string) => {
      if (id === entity?.id) return;
      if (!confirmDiscard()) return;
      setEntityId(id);
      setQuery('');
      setSort(null);
      const params = new URLSearchParams(location.search);
      params.set('entity', id);
      history.replaceState(null, '', `${location.pathname}?${params}`);
    },
    [entity?.id, confirmDiscard],
  );

  const switchKind = (next: SourceKind) => {
    if (next === kind || !confirmDiscard()) return;
    useGrid.getState().reset();
    setKind(next);
  };

  useEffect(() => listenWindows((m) => m.type === 'data:entity' && switchEntity(m.entityId)), [switchEntity]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyCount(useGrid.getState().rows)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  useEffect(() => {
    document.title = `${entity ? `${entity.pluralName} — ` : ''}${t('cmd.dataEditor')} — Facet OS`;
  }, [entity, t]);

  /* --------------------------------- view ---------------------------------- */

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? rows.filter((r) => r.status === 'new' || columns.some((c) => cellText(c, r.values[c.key], rel, locale).toLowerCase().includes(q))) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const fresh = list.filter((r) => r.status === 'new');
        const sorted = list.filter((r) => r.status !== 'new').sort((a, b) => compare(col, a.values[col.key], b.values[col.key], rel, locale) * (sort.dir === 'asc' ? 1 : -1));
        list = [...sorted, ...fresh];
      }
    }
    return list;
  }, [rows, columns, rel, locale, query, sort]);

  const onSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  const readOnly = useCallback((c: GridColumn) => !!c.missing || (c.type === 'file' && !source?.files), [source]);

  /* --------------------------------- save ---------------------------------- */

  const save = useCallback(async () => {
    if (!source || !entity || saving) return;
    useGrid.getState().pruneEmpty();
    const grid = useGrid.getState();
    const errors = grid.validate();
    const strict = source.kind !== 'draft';
    const badLinks = strict
      ? useGrid.getState().rows.filter((r) => (r.status === 'new' || r.status === 'modified') && grid.columns.some((c) => unknownLinks(c, r.values[c.key], grid.relOptions).length)).length
      : 0;
    if (errors || badLinks) {
      toast('error', t('grid.fixErrors', { n: errors + badLinks }));
      return;
    }
    const changes = grid.changes();
    if (!changes.created.length && !changes.updated.length && !changes.deleted.length) return;
    setSaving(true);
    savingRef.current = true;
    try {
      const result = await source.save(entity, grid.columns, changes);
      const failedKeys = Object.keys(result.errors);
      const failed = useGrid.getState().rows.filter((r) => failedKeys.includes(r.key));
      await load();
      if (failedKeys.length) {
        useGrid.getState().mergeRows(failed, result.errors);
        toast('error', t('grid.saveFailed', { n: failedKeys.length, saved: result.saved }));
      } else toast('success', source.kind === 'draft' ? t('grid.savedDraft', { n: result.saved }) : t('grid.saved', { n: result.saved }));
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setSaving(false);
      setTimeout(() => (savingRef.current = false), 0);
    }
  }, [source, entity, saving, load, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyS') {
        e.preventDefault();
        void save();
      } else if (e.key === 'F5' || (ctrl && e.code === 'KeyR')) {
        e.preventDefault();
        if (confirmDiscard()) setTick((n) => n + 1);
      } else if (ctrl && e.code === 'KeyF') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F1') {
        e.preventDefault();
        openHelp('data');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, confirmDiscard]);

  /* ------------------------------ files, CSV ------------------------------- */

  const pickFile = (row: Row, col: GridColumn) => {
    fileTarget.current = { row, col };
    fileInput.current?.click();
  };

  const exportCsv = async () => {
    if (!entity) return;
    const { saveAs } = await import('file-saver');
    const csv = toCsv(columns.map((c) => c.label), view.filter((r) => r.status !== 'deleted').map((r) => columns.map((c) => clipboardText(c, r.values[c.key], rel))), locale);
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${entity.id}.csv`);
  };

  const importCsv = async (file: File) => {
    const cells = parseCsv(await file.text());
    if (cells.length < 2) {
      toast('error', t('grid.csvEmpty'));
      return;
    }
    const [header, ...body] = cells;
    const norm = (s: string) => s.trim().toLowerCase();
    const map = header.map((h) => columns.find((c) => !readOnly(c) && c.type !== 'file' && (norm(c.label) === norm(h) || norm(c.key) === norm(h))) ?? null);
    if (!map.some(Boolean)) {
      toast('error', t('grid.csvNoColumns'));
      return;
    }
    const values = body
      .filter((line) => line.some((v) => v.trim()))
      .map((line) => Object.fromEntries(map.map((c, i) => (c ? [c.key, parseText(c, line[i] ?? '', rel)] : null)).filter((x): x is [string, CellValue] => !!x)));
    useGrid.getState().addRows(values.length, undefined, values);
    const skipped = header.filter((_, i) => !map[i]);
    toast('success', t('grid.csvImported', { n: values.length }) + (skipped.length ? ` ${t('grid.csvSkipped', { cols: skipped.join(', ') })}` : ''));
  };

  /* -------------------------------- render --------------------------------- */

  const counts = useMemo(() => {
    const c = { new: 0, modified: 0, deleted: 0, errors: 0 };
    for (const r of rows) {
      if (r.status !== 'clean') c[r.status]++;
      if (Object.keys(r.errors).length) c.errors++;
    }
    return c;
  }, [rows]);

  const sourceLabel = kind === 'draft' ? t('grid.src.draft') : kind === 'local' ? t('grid.src.local') : t('grid.src.server');
  const connectedTo = kind === 'server' ? auth?.url : kind === 'local' ? localAuth?.url : null;
  const selectedRows = cursor.keys;

  return (
    <div className="flex h-screen flex-col bg-app text-fg">
      {/* Заголовок окна */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <Table2 className="h-4 w-4 text-accent" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">{t('cmd.dataEditor')}</div>
          <div className="truncate text-2xs leading-tight text-fg-subtle">{schema.clubName}</div>
        </div>
        <div className="ml-4 flex items-center rounded-md border border-line bg-sunken p-0.5" role="radiogroup" aria-label={t('grid.source')}>
          {([
            ['draft', FileEdit, t('grid.src.draft'), t('grid.src.draftHint')],
            ['server', Cloud, t('grid.src.server'), t('grid.src.serverHint')],
            ...(desk ? [['local', Monitor, t('grid.src.local'), t('grid.src.localHint')] as const] : []),
          ] as const).map(([value, Icon, label, hint]) => (
            <Tip key={value} content={hint}>
              <button
                type="button"
                role="radio"
                aria-checked={kind === value}
                data-testid={`source-${value}`}
                onClick={() => switchKind(value)}
                className={cn('flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium', kind === value ? 'bg-panel text-fg shadow-panel' : 'text-fg-muted hover:text-fg')}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            </Tip>
          ))}
        </div>
        {connectedTo && (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
            <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
            <span className="truncate">{connectedTo}</span>
            {kind === 'server' && (
              <Tip content={t('grid.signOut')}>
                <button
                  type="button"
                  aria-label={t('grid.signOut')}
                  className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
                  onClick={() => {
                    if (!confirmDiscard()) return;
                    saveAuth(null);
                    setAuth(null);
                    useGrid.getState().reset();
                  }}
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </Tip>
            )}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Tip content={t('cmd.help')} shortcut="F1">
            <Button size="sm" variant="ghost" onClick={() => openHelp('data')}>
              <CircleHelp className="h-4 w-4" /> {t('toolbar.help')}
            </Button>
          </Tip>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Таблицы */}
        <nav className="flex w-56 shrink-0 flex-col border-r border-line bg-panel" aria-label={t('grid.tables')}>
          <div className="flex h-8 items-center border-b border-line px-3 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{t('grid.tables')}</div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            {schema.entities.map((e) => {
              const Icon = getEntityIcon(e.icon);
              const draftRows = seeds[e.id]?.rows.length ?? 0;
              return (
                <button
                  key={e.id}
                  type="button"
                  data-testid={`table-${e.id}`}
                  aria-current={entity?.id === e.id ? 'page' : undefined}
                  onClick={() => switchEntity(e.id)}
                  className={cn('flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm', entity?.id === e.id ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-hover')}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  <span className="flex-1 truncate">{e.pluralName}</span>
                  {kind === 'draft' && draftRows > 0 && <span className={cn('text-2xs tabular-nums', entity?.id === e.id ? 'text-accent-fg/80' : 'text-fg-subtle')}>{draftRows}</span>}
                </button>
              );
            })}
            {!schema.entities.length && <p className="p-2 text-xs text-fg-subtle">{t('diagram.empty')}</p>}
          </div>
          <div className="border-t border-line p-3 text-2xs leading-relaxed text-fg-subtle">
            {kind === 'draft' ? t('grid.src.draftNote') : kind === 'local' ? t('grid.src.localNote') : t('grid.src.serverNote')}
          </div>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* Панель инструментов */}
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-panel px-2" role="toolbar" aria-label={t('toolbar.aria')}>
            <Tip content={t('grid.addRow')} shortcut="Insert">
              <Button size="sm" variant="ghost" disabled={phase.kind !== 'ready'} data-testid="grid-add" onClick={() => useGrid.getState().addRows(1)}>
                <Plus className="h-4 w-4" /> {t('grid.add')}
              </Button>
            </Tip>
            <Tip content={t('grid.deleteHint')} shortcut="Ctrl+Delete">
              <Button size="sm" variant="ghost" disabled={phase.kind !== 'ready' || !selectedRows.length} onClick={() => useGrid.getState().toggleDelete(selectedRows)}>
                <Trash2 className="h-4 w-4" /> {t('grid.delete')}
              </Button>
            </Tip>
            <span className="mx-1 h-5 w-px bg-line" />
            <Tip content={t('keys.grid.save')} shortcut="Ctrl+S">
              <Button size="sm" variant="primary" disabled={!dirty || saving} data-testid="grid-save" onClick={() => void save()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('grid.save')}
                {dirty > 0 && <span className="rounded bg-accent-fg/20 px-1 text-2xs tabular-nums">{dirty}</span>}
              </Button>
            </Tip>
            <Tip content={t('grid.discardHint')}>
              <Button size="sm" variant="ghost" disabled={!dirty || saving} onClick={() => window.confirm(t('grid.confirmDiscard')) && useGrid.getState().revert()}>
                <Undo2 className="h-4 w-4" /> {t('grid.discard')}
              </Button>
            </Tip>
            <Tip content={t('grid.refresh')} shortcut="F5">
              <Button size="icon-sm" variant="ghost" aria-label={t('grid.refresh')} disabled={!source || saving} onClick={() => confirmDiscard() && setTick((n) => n + 1)}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </Tip>
            <span className="mx-1 h-5 w-px bg-line" />
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
              <Input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('grid.search')} aria-label={t('grid.search')} className="h-7 pl-7 text-xs" />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Tip content={t('grid.importCsvHint')}>
                <Button size="sm" variant="ghost" disabled={phase.kind !== 'ready'} onClick={() => csvInput.current?.click()}>
                  <Upload className="h-4 w-4" /> {t('grid.csvIn')}
                </Button>
              </Tip>
              <Tip content={t('grid.exportCsv')}>
                <Button size="sm" variant="ghost" disabled={phase.kind !== 'ready' || !rows.length} onClick={() => void exportCsv()}>
                  <Download className="h-4 w-4" /> {t('grid.csvOut')}
                </Button>
              </Tip>
            </div>
          </div>

          {stale && (
            <div className="flex items-center gap-2 border-b border-warning/30 bg-warning-soft px-3 py-1.5 text-xs text-fg">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" /> {t('grid.stale')}
              <Button size="xs" className="ml-auto" onClick={() => confirmDiscard() && setTick((n) => n + 1)}>{t('grid.refresh')}</Button>
            </div>
          )}

          {/* Содержимое */}
          {!entity ? (
            <Empty icon={<Database className="h-6 w-6" />} title={t('grid.noTables')} text={t('grid.noTablesHint')} />
          ) : phase.kind === 'connect' ? (
            <ConnectForm
              initialUrl={serverSettings.url}
              initialEmail={serverSettings.email}
              onConnected={(a) => {
                saveAuth(a);
                setSettings({ server: { url: a.url, email: a.email } });
                setAuth(a);
              }}
            />
          ) : phase.kind === 'local' ? (
            <Empty
              icon={<Monitor className="h-6 w-6" />}
              title={t(phase.state === 'none' ? 'grid.local.none' : phase.state === 'stopped' ? 'grid.local.stopped' : 'grid.local.noadmin')}
              text={t(phase.state === 'none' ? 'grid.local.noneHint' : phase.state === 'stopped' ? 'grid.local.stoppedHint' : 'grid.local.noadminHint')}
              action={
                phase.state === 'stopped' ? (
                  <Button variant="primary" onClick={async () => { await desk?.localServer.start(); void connectLocal(); }}>{t('grid.local.start')}</Button>
                ) : (
                  <Button onClick={() => void connectLocal()}>{t('grid.retry')}</Button>
                )
              }
            />
          ) : phase.kind === 'missing' ? (
            <Empty icon={<AlertTriangle className="h-6 w-6" />} title={t('grid.missing', { name: entity.pluralName })} text={t('grid.missingHint')} action={<Button onClick={() => setTick((n) => n + 1)}>{t('grid.retry')}</Button>} />
          ) : phase.kind === 'error' ? (
            <Empty icon={<AlertTriangle className="h-6 w-6 text-danger" />} title={t('grid.loadError')} text={phase.message} action={<Button onClick={() => setTick((n) => n + 1)}>{t('grid.retry')}</Button>} />
          ) : phase.kind === 'loading' || phase.kind === 'idle' ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('grid.loading')}
            </div>
          ) : (
            <Grid
              rows={view}
              columns={columns}
              locale={locale}
              readOnly={readOnly}
              sort={sort}
              onSort={onSort}
              onPickFile={pickFile}
              strictLinks={kind !== 'draft'}
              fileHref={(row, name) => (entity && source?.fileUrl ? source.fileUrl(entity, { key: row.key, values: row.values, meta: row.meta }, name) : null)}
              onSelectionChange={setCursor}
            />
          )}

          {/* Строка состояния */}
          <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-sunken px-3 text-2xs text-fg-muted" data-testid="grid-status">
            <span className="flex items-center gap-1.5">
              {kind === 'draft' ? <FileEdit className="h-3 w-3" /> : kind === 'local' ? <Monitor className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
              {sourceLabel}
            </span>
            {phase.kind === 'ready' && (
              <>
                <span>{t('grid.rows', { n: rows.filter((r) => r.status !== 'new').length })}{query && ` · ${t('grid.shown', { n: view.length })}`}</span>
                {counts.new > 0 && <span className="text-success">{t('grid.cnt.new', { n: counts.new })}</span>}
                {counts.modified > 0 && <span className="text-accent-text">{t('grid.cnt.modified', { n: counts.modified })}</span>}
                {counts.deleted > 0 && <span className="text-danger">{t('grid.cnt.deleted', { n: counts.deleted })}</span>}
                {counts.errors > 0 && <span className="font-medium text-danger">{t('grid.cnt.errors', { n: counts.errors })}</span>}
                {cursor.row && cursor.col && (
                  <span className="ml-auto truncate">
                    {t('grid.cursor', { row: view.indexOf(cursor.row) + 1, col: cursor.col.label })}
                    {cursor.count > 1 && ` · ${t('grid.selected', { n: cursor.count })}`}
                  </span>
                )}
              </>
            )}
          </footer>
        </main>
      </div>

      <input
        ref={fileInput}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const target = fileTarget.current;
          if (file && target) useGrid.getState().setFile(target.row.key, target.col.key, file);
          e.target.value = '';
        }}
      />
      <input
        ref={csvInput}
        type="file"
        accept=".csv,.tsv,.txt,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importCsv(file);
          e.target.value = '';
        }}
      />
      <Toaster />
    </div>
  );
}

function Empty({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-fg-subtle">{icon}</div>
        <div className="text-base font-semibold text-fg">{title}</div>
        <p className="mt-1 whitespace-pre-line text-sm text-fg-muted">{text}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

function ConnectForm({ initialUrl, initialEmail, onConnected }: { initialUrl: string; initialEmail: string; onConnected: (auth: ServerAuth) => void }) {
  const t = useT();
  const [url, setUrl] = useState(initialUrl);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <form
        className="w-full max-w-sm space-y-3 rounded-lg border border-line bg-panel p-5 shadow-panel"
        data-testid="connect-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            onConnected(await signIn(url.trim(), email.trim(), password));
          } catch (err) {
            setError((err as Error).message === 'Failed to fetch' ? t('grid.connect.unreachable') : (err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-accent" />
          <div className="text-base font-semibold text-fg">{t('grid.connect.title')}</div>
        </div>
        <p className="text-xs text-fg-muted">{t('grid.connect.text')}</p>
        <Field label={t('settings.serverUrl')} htmlFor="c-url">
          <Input id="c-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://club.example.ru" />
        </Field>
        <Field label={t('settings.serverEmail')} htmlFor="c-email">
          <Input id="c-email" required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('grid.connect.password')} htmlFor="c-pass" description={t('grid.connect.passwordHint')}>
          <Input id="c-pass" required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{error}</p>}
        <Button type="submit" variant="primary" className="w-full justify-center" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('grid.connect.submit')}
        </Button>
      </form>
    </div>
  );
}
