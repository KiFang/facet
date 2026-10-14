import { useMemo, useRef, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { AlertTriangle, ClipboardPaste, FileSpreadsheet, Globe, Loader2, Upload } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import type { ClubEntity, EntityField, FieldType } from '@/types/schema';
import { useT, type TKey } from '@/i18n';
import {
  autoMap, fieldFromColumn, googleSheetCsvUrl, importTargets, MAX_IMPORT_ROWS, parseCsv, toTable, type CsvTable,
} from '@/utils/csv';
import { slugify, uniqueId } from '@/lib/id';
import { RESERVED_COLLECTIONS, RESERVED_FIELDS } from '@/utils/validate';
import { cn } from '@/lib/cn';
import { Button } from './ui/Button';
import { DialogContent } from './ui/Dialog';
import { Input, Label, Select, Textarea } from './ui/Input';
import { Switch } from './ui/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/Tabs';
import { toast } from './ui/Toast';

const PLAIN_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'status'];

interface NewColumn {
  include: boolean;
  name: string;
  field: EntityField;
}

/**
 * Импорт строк из CSV / вставки / Google Таблицы.
 * С entityId — в существующий раздел; без — создаёт новый раздел по колонкам таблицы.
 * Строки попадают в следующий экспорт (миграция наполнения) и сразу видны в превью.
 */
export function ImportDialog({ entityId, onClose }: { entityId?: string; onClose: () => void }) {
  const t = useT();
  const schema = useClubStore((s) => s.schema);
  const entity = entityId ? schema.entities.find((e) => e.id === entityId) : undefined;
  const [table, setTable] = useState<CsvTable | null>(null);
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paste, setPaste] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const targets = useMemo(() => (entity ? importTargets(schema, entity) : []), [schema, entity]);
  const [mapping, setMapping] = useState<(string | null)[]>([]);
  const [columns, setColumns] = useState<NewColumn[]>([]);
  const [names, setNames] = useState({ plural: '', single: '' });

  const accept = (text: string, from: string) => {
    const cells = parseCsv(text);
    if (cells.length < 2) {
      setError(t('import.empty'));
      return;
    }
    const tbl = toTable(cells);
    if (tbl.rows.length > MAX_IMPORT_ROWS) tbl.rows = tbl.rows.slice(0, MAX_IMPORT_ROWS);
    setError(null);
    setTable(tbl);
    setSource(from);
    if (entity) setMapping(autoMap(tbl.headers, targets));
    else {
      const taken: string[] = [...RESERVED_FIELDS];
      setColumns(
        tbl.headers.map((h, i) => {
          const id = uniqueId(h, taken);
          taken.push(id);
          return { include: true, name: h, field: fieldFromColumn(h, tbl.rows.map((r) => r[i]), id, i === 0) };
        }),
      );
      const base = from.replace(/\.(csv|tsv|txt)$/i, '').replace(/^https?:\/\/.*/, '') || t('import.newSection');
      setNames({ plural: base, single: base });
    }
  };

  const loadSheet = async () => {
    const url = googleSheetCsvUrl(sheetUrl);
    if (!url) {
      setError(t('import.badSheetUrl'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (/^\s*<!doctype html/i.test(text)) throw new Error('HTML');
      accept(text, 'Google Sheets');
    } catch {
      setError(t('import.sheetFailed'));
    } finally {
      setLoading(false);
    }
  };

  const mappedCount = mapping.filter(Boolean).length;
  const missingRequired = entity
    ? entity.fields.filter((f) => f.required && f.type !== 'file' && !mapping.includes(f.id)).map((f) => f.name)
    : [];

  const confirm = () => {
    if (!table) return;
    const { addEntity, setSeeds, schema: current } = useClubStore.getState();
    if (entity) {
      const rows = table.rows.map((r) => Object.fromEntries(mapping.flatMap((key, i) => (key && r[i] ? [[key, r[i]]] : []))));
      setSeeds({ entityId: entity.id, rows, source, importedAt: new Date().toISOString() });
      toast('success', t('import.done', { n: rows.length, name: entity.pluralName }));
    } else {
      const included = columns.map((c, i) => ({ ...c, index: i })).filter((c) => c.include);
      if (!included.length) return;
      const fields = included.map((c, k) => ({ ...c.field, name: c.name || c.field.name, required: k === 0 }));
      const id = uniqueId(names.plural || 'section', [...current.entities.map((e) => e.id), ...RESERVED_COLLECTIONS]);
      const created: ClubEntity = {
        id,
        name: names.single || names.plural,
        pluralName: names.plural || names.single,
        icon: 'Box',
        fields,
        relations: [],
      };
      addEntity(created);
      const rows = table.rows.map((r) => Object.fromEntries(included.flatMap((c, k) => (r[c.index] ? [[fields[k].id, r[c.index]]] : []))));
      setSeeds({ entityId: id, rows, source, importedAt: new Date().toISOString() });
      toast('success', t('import.created', { name: created.pluralName, n: rows.length }));
    }
    onClose();
  };

  const preview = table?.rows.slice(0, 5) ?? [];

  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={entity ? t('import.titleInto', { name: entity.pluralName }) : t('import.titleNew')}
        description={t('import.description')}
        className="w-[min(860px,calc(100vw-32px))]"
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-6">
          {!table ? (
            <Tabs defaultValue="file">
              <TabsList className="px-0">
                <TabsTrigger value="file"><Upload className="h-3.5 w-3.5" /> {t('import.file')}</TabsTrigger>
                <TabsTrigger value="paste"><ClipboardPaste className="h-3.5 w-3.5" /> {t('import.paste')}</TabsTrigger>
                <TabsTrigger value="sheets"><Globe className="h-3.5 w-3.5" /> Google Sheets</TabsTrigger>
              </TabsList>
              <TabsContent value="file" className="pt-4">
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) accept(await f.text(), f.name);
                  }} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 p-10 text-sm text-zinc-400 transition-colors hover:border-violet-500 hover:text-zinc-200">
                  <FileSpreadsheet className="h-8 w-8 text-emerald-400" />
                  {t('import.pickFile')}
                  <span className="text-xs text-zinc-500">{t('import.fileHint')}</span>
                </button>
              </TabsContent>
              <TabsContent value="paste" className="space-y-2 pt-4">
                <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} className="min-h-[200px] font-mono text-xs" placeholder={t('import.pastePlaceholder')} aria-label={t('import.paste')} />
                <Button variant="primary" disabled={!paste.trim()} onClick={() => accept(paste, t('import.paste'))}>{t('import.next')}</Button>
              </TabsContent>
              <TabsContent value="sheets" className="space-y-3 pt-4">
                <div>
                  <Label htmlFor="sheet-url">{t('import.sheetUrl')}</Label>
                  <Input id="sheet-url" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
                </div>
                <p className="text-xs text-zinc-500">{t('import.sheetHint')}</p>
                <Button variant="primary" disabled={!sheetUrl.trim() || loading} onClick={() => void loadSheet()}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />} {t('import.load')}
                </Button>
              </TabsContent>
            </Tabs>
          ) : entity ? (
            <>
              <p className="text-sm text-zinc-400">{t('import.mapHint', { rows: table.rows.length, source })}</p>
              <div className="overflow-auto rounded-xl border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900">
                    <tr>
                      {table.headers.map((h, i) => (
                        <th key={i} className="min-w-[150px] border-b border-zinc-800 p-2 align-top font-medium text-zinc-300">
                          <div className="mb-1.5 truncate">{h}</div>
                          <Select value={mapping[i] ?? ''} aria-label={t('import.mapTo', { column: h })} className="h-8 text-xs"
                            onChange={(e) => setMapping(mapping.map((m, j) => (j === i ? e.target.value || null : m === e.target.value ? null : m)))}>
                            <option value="">{t('import.skip')}</option>
                            {targets.map((tg) => <option key={tg.key} value={tg.key}>{tg.label}{tg.kind === 'link' ? ' ↔' : ''}</option>)}
                          </Select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, ri) => (
                      <tr key={ri} className="border-b border-zinc-800/60 last:border-0">
                        {r.map((c, ci) => <td key={ci} className={cn('max-w-[220px] truncate p-2', mapping[ci] ? 'text-zinc-200' : 'text-zinc-600')}>{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {missingRequired.length > 0 && (
                <p className="flex items-start gap-2 text-xs text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('import.missingRequired', { fields: missingRequired.join(', ') })}
                </p>
              )}
              <p className="text-xs text-zinc-500">{t('import.formatsHint')}</p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="new-plural">{t('entity.plural')}</Label>
                  <Input id="new-plural" value={names.plural} onChange={(e) => setNames({ ...names, plural: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="new-single">{t('entity.single')}</Label>
                  <Input id="new-single" value={names.single} onChange={(e) => setNames({ ...names, single: e.target.value })} />
                </div>
              </div>
              <p className="text-sm text-zinc-400">{t('import.columnsHint', { rows: table.rows.length })}</p>
              <div className="space-y-1.5">
                {columns.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
                    <Switch checked={c.include} label={t('import.include')} onChange={(v) => setColumns(columns.map((x, j) => (j === i ? { ...x, include: v } : x)))} />
                    <Input value={c.name} aria-label={t('field.name')} className="h-8 flex-1 text-xs"
                      onChange={(e) => setColumns(columns.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <Select value={c.field.type} aria-label={t('field.type')} className="h-8 w-[120px] text-xs"
                      onChange={(e) => {
                        const type = e.target.value as FieldType;
                        const values = Array.from(new Set(table.rows.map((r) => r[i]).filter(Boolean))).slice(0, 20);
                        setColumns(columns.map((x, j) => (j === i ? { ...x, field: { ...x.field, type, options: type === 'select' || type === 'status' ? (x.field.options ?? values) : undefined } } : x)));
                      }}>
                      {PLAIN_TYPES.map((type) => <option key={type} value={type}>{t(`fieldType.${type}` as TKey)}</option>)}
                    </Select>
                    <span className="w-28 truncate font-mono text-[11px] text-zinc-500" title={c.field.id}>{c.field.id}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {error && <p className="flex items-start gap-2 text-sm text-rose-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-6 py-4">
          <span className="text-xs text-zinc-500">{table ? t('import.footer') : ''}</span>
          <div className="flex gap-2">
            {table && <Button variant="ghost" onClick={() => setTable(null)}>{t('common.back')}</Button>}
            <Button
              variant="primary"
              disabled={!table || (entity ? mappedCount === 0 || missingRequired.length > 0 : !columns.some((c) => c.include) || !slugify(names.plural))}
              onClick={confirm}
            >
              {entity ? t('import.confirm', { n: table?.rows.length ?? 0 }) : t('import.create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </RadixDialog.Root>
  );
}
