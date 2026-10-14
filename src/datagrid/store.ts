import { create } from 'zustand';
import { validateCell } from './sources';
import type { CellValue, GridColumn, GridRecord, RelationOption, SaveChanges } from './types';

export type RowStatus = 'clean' | 'new' | 'modified' | 'deleted';

export interface Row {
  key: string;
  original: Record<string, CellValue>;
  values: Record<string, CellValue>;
  status: RowStatus;
  /** Ошибки по колонкам; `_row` — общая ошибка сервера. */
  errors: Record<string, string>;
  /** Новые файлы (null — удалить файл). */
  files: Record<string, File | null>;
  meta?: GridRecord['meta'];
}

const norm = (v: CellValue | undefined) => (v === undefined || v === null ? '' : v);
export const sameValue = (a: CellValue | undefined, b: CellValue | undefined) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
export const isEmpty = (v: CellValue | undefined) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

const emptyValue = (c: GridColumn): CellValue => (c.type === 'relation' || c.type === 'file' ? [] : '');

function settle(row: Row, columns: GridColumn[]): Row {
  if (row.status === 'new' || row.status === 'deleted') return row;
  const dirty = Object.keys(row.files).length > 0 || columns.some((c) => !sameValue(row.values[c.key], row.original[c.key]));
  return { ...row, status: dirty ? 'modified' : 'clean' };
}

let seq = 0;
const newKey = () => `new-${Date.now().toString(36)}-${++seq}`;

interface GridState {
  columns: GridColumn[];
  rows: Row[];
  relOptions: Record<string, RelationOption[]>;
  widths: Record<string, number>;
  load: (columns: GridColumn[], records: GridRecord[], relOptions: Record<string, RelationOption[]>) => void;
  reset: () => void;
  setCell: (key: string, col: string, value: CellValue) => void;
  setCells: (updates: { key: string; col: string; value: CellValue }[]) => void;
  setFile: (key: string, col: string, file: File | null) => void;
  /** Вставляет пустые строки после строки `afterKey` (или в конец) и возвращает их ключи. */
  addRows: (count: number, afterKey?: string, values?: Record<string, CellValue>[]) => string[];
  toggleDelete: (keys: string[]) => void;
  revert: (keys?: string[]) => void;
  setWidth: (col: string, width: number) => void;
  /** Убирает новые строки, в которые ничего не ввели (как пустые строки в Excel). */
  pruneEmpty: () => void;
  /** Проверяет изменённые строки. Возвращает количество ошибок. */
  validate: () => number;
  applyServerErrors: (errors: Record<string, Record<string, string>>) => void;
  /** Возвращает в таблицу строки, которые не удалось сохранить (после перезагрузки с сервера). */
  mergeRows: (rows: Row[], errors: Record<string, Record<string, string>>) => void;
  changes: () => SaveChanges;
}

export const useGrid = create<GridState>((set, get) => ({
  columns: [],
  rows: [],
  relOptions: {},
  widths: {},
  load: (columns, records, relOptions) =>
    set({
      columns,
      relOptions,
      rows: records.map((r) => ({ key: r.key, original: r.values, values: r.values, status: 'clean', errors: {}, files: {}, meta: r.meta })),
    }),
  reset: () => set({ columns: [], rows: [], relOptions: {} }),
  setCell: (key, col, value) => get().setCells([{ key, col, value }]),
  setCells: (updates) =>
    set((s) => {
      const byKey = new Map<string, { col: string; value: CellValue }[]>();
      for (const u of updates) byKey.set(u.key, [...(byKey.get(u.key) ?? []), u]);
      return {
        rows: s.rows.map((row) => {
          const list = byKey.get(row.key);
          if (!list || row.status === 'deleted') return row;
          const values = { ...row.values };
          const errors = { ...row.errors };
          delete errors._row;
          for (const { col, value } of list) {
            const column = s.columns.find((c) => c.key === col);
            if (!column || column.missing) continue;
            values[col] = value;
            const problem = validateCell(column, value);
            if (problem) errors[col] = problem;
            else delete errors[col];
          }
          return settle({ ...row, values, errors }, s.columns);
        }),
      };
    }),
  setFile: (key, col, file) =>
    set((s) => ({
      rows: s.rows.map((row) => {
        if (row.key !== key || row.status === 'deleted') return row;
        const files = { ...row.files, [col]: file };
        const values = { ...row.values, [col]: file ? [file.name] : [] };
        const errors = { ...row.errors };
        delete errors[col];
        return settle({ ...row, files, values, errors }, s.columns);
      }),
    })),
  addRows: (count, afterKey, values) => {
    const { columns } = get();
    const keys: string[] = [];
    const fresh: Row[] = Array.from({ length: count }, (_, i) => {
      const key = newKey();
      keys.push(key);
      const base = Object.fromEntries(columns.map((c) => [c.key, emptyValue(c)]));
      const v = { ...base, ...(values?.[i] ?? {}) };
      const errors: Record<string, string> = {};
      if (values?.[i]) for (const c of columns) {
        const p = validateCell(c, v[c.key]);
        if (p && !(p === 'required' && isEmpty(v[c.key]))) errors[c.key] = p;
      }
      return { key, original: base, values: v, status: 'new', errors, files: {} };
    });
    set((s) => {
      const at = afterKey ? s.rows.findIndex((r) => r.key === afterKey) : -1;
      const rows = [...s.rows];
      rows.splice(at < 0 ? rows.length : at + 1, 0, ...fresh);
      return { rows };
    });
    return keys;
  },
  toggleDelete: (keys) =>
    set((s) => {
      const targets = s.rows.filter((r) => keys.includes(r.key));
      const restore = targets.length > 0 && targets.every((r) => r.status === 'deleted');
      return {
        rows: s.rows
          .filter((r) => !(keys.includes(r.key) && r.status === 'new'))
          .map((r) => {
            if (!keys.includes(r.key)) return r;
            if (restore) return settle({ ...r, status: 'clean' }, s.columns);
            return { ...r, status: 'deleted' as const, errors: {} };
          }),
      };
    }),
  revert: (keys) =>
    set((s) => ({
      rows: s.rows
        .filter((r) => !(r.status === 'new' && (!keys || keys.includes(r.key))))
        .map((r) => (!keys || keys.includes(r.key) ? { ...r, values: r.original, status: 'clean' as const, errors: {}, files: {} } : r)),
    })),
  setWidth: (col, width) => set((s) => ({ widths: { ...s.widths, [col]: Math.max(70, Math.min(640, Math.round(width))) } })),
  pruneEmpty: () =>
    set((s) => ({
      rows: s.rows.filter((r) => !(r.status === 'new' && !Object.keys(r.files).length && s.columns.every((c) => isEmpty(r.values[c.key])))),
    })),
  validate: () => {
    let count = 0;
    set((s) => ({
      rows: s.rows.map((row) => {
        if (row.status !== 'new' && row.status !== 'modified') return row;
        const errors: Record<string, string> = {};
        for (const c of s.columns) {
          if (c.missing || c.type === 'file') continue;
          const p = validateCell(c, row.values[c.key]);
          if (p) errors[c.key] = p;
        }
        count += Object.keys(errors).length;
        return { ...row, errors };
      }),
    }));
    return count;
  },
  applyServerErrors: (errors) =>
    set((s) => ({ rows: s.rows.map((r) => (errors[r.key] ? { ...r, errors: { ...r.errors, ...errors[r.key] } } : r)) })),
  mergeRows: (failed, errors) =>
    set((s) => {
      const map = new Map(failed.map((r) => [r.key, r]));
      const out = s.rows.map((r) => {
        const f = map.get(r.key);
        return f ? { ...f, original: r.original, meta: r.meta, errors: { ...f.errors, ...errors[r.key] } } : r;
      });
      for (const f of failed) if (!s.rows.some((r) => r.key === f.key)) out.push({ ...f, errors: { ...f.errors, ...errors[f.key] } });
      return { rows: out };
    }),
  changes: () => {
    const { rows, columns } = get();
    const out: SaveChanges = { created: [], updated: [], deleted: [], order: rows.filter((r) => r.status !== 'deleted').map((r) => r.key) };
    for (const r of rows) {
      if (r.status === 'deleted') out.deleted.push(r.key);
      else if (r.status === 'new') out.created.push({ key: r.key, values: r.values, files: r.files });
      else if (r.status === 'modified') {
        const patch = Object.fromEntries(columns.filter((c) => c.type !== 'file' && !sameValue(r.values[c.key], r.original[c.key])).map((c) => [c.key, r.values[c.key]]));
        out.updated.push({ key: r.key, patch, files: r.files });
      }
    }
    return out;
  },
}));

export const dirtyCount = (rows: Row[]) => rows.filter((r) => r.status !== 'clean').length;
