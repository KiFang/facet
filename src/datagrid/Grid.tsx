import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { AlertTriangle, ArrowDown, ArrowUp, Calendar, CircleDot, Hash, Link2, List, Paperclip, Pencil, Plus, Type, Undo2, X } from 'lucide-react';
import { useT, type TKey } from '@/i18n';
import { cn } from '@/lib/cn';
import { menuContentClass, menuItemClass, menuSeparatorClass, MenuItemBody } from '@/components/ui/Menu';
import type { FieldType } from '@/types/schema';
import { useGrid, isEmpty, type Row } from './store';
import type { CellValue, GridColumn } from './types';
import { ChoiceEditor, TextEditor, type Move } from './editors';
import { cellText, clipboardText, parseTsv, parseText, toTsv, unknownLinks } from './values';

export const ROW_H = 30;
const HEAD_H = 34;
const NUM_W = 64;
const OVERSCAN = 8;

const TYPE_ICON: Record<FieldType, typeof Type> = { text: Type, number: Hash, date: Calendar, select: List, status: CircleDot, file: Paperclip, relation: Link2 };
const DEFAULT_W: Record<FieldType, number> = { text: 220, number: 120, date: 160, select: 160, status: 150, file: 180, relation: 240 };

export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

interface Pos {
  r: number;
  c: number;
}

export interface GridProps {
  rows: Row[];
  columns: GridColumn[];
  locale: string;
  /** Колонка только для чтения (файлы в черновике, колонки без поля на сервере). */
  readOnly: (col: GridColumn) => boolean;
  sort: SortState;
  onSort: (key: string) => void;
  onPickFile?: (row: Row, col: GridColumn) => void;
  fileHref?: (row: Row, name: string) => string | null;
  onSelectionChange?: (info: { row?: Row; col?: GridColumn; count: number; keys: string[] }) => void;
  /** Ключ строки, которую нужно выделить (после вставки). */
  focusKey?: string | null;
  onFocused?: () => void;
  /** Подсвечивать связи, которых нет среди записей (на живом сервере). */
  strictLinks?: boolean;
}

const ERR: Record<string, TKey> = { required: 'grid.err.required', number: 'grid.err.number', date: 'grid.err.date', option: 'grid.err.option', link: 'grid.err.link' };

export function Grid({ rows, columns, locale, readOnly, sort, onSort, onPickFile, fileHref, onSelectionChange, focusKey, onFocused, strictLinks }: GridProps) {
  const t = useT();
  const widths = useGrid((s) => s.widths);
  const rel = useGrid((s) => s.relOptions);
  const { setCells, setFile, addRows, toggleDelete, revert, setWidth } = useGrid.getState();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  const [active, setActive] = useState<Pos>({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 0 });
  const [editing, setEditing] = useState<{ initial?: string; rect: DOMRect; at: [number, number] } | null>(null);
  const dragging = useRef(false);

  const colW = useCallback((c: GridColumn) => widths[c.key] ?? DEFAULT_W[c.type], [widths]);
  const offsets = useMemo(() => {
    const out: number[] = [];
    let x = NUM_W;
    for (const c of columns) {
      out.push(x);
      x += colW(c);
    }
    out.push(x);
    return out;
  }, [columns, colW]);
  const totalW = offsets[offsets.length - 1] + 1;

  const maxR = rows.length - 1;
  const maxC = columns.length - 1;
  const clamp = useCallback((p: Pos): Pos => ({ r: Math.max(0, Math.min(maxR, p.r)), c: Math.max(0, Math.min(maxC, p.c)) }), [maxR, maxC]);
  const range = useMemo(
    () => ({ r1: Math.min(active.r, anchor.r), r2: Math.max(active.r, anchor.r), c1: Math.min(active.c, anchor.c), c2: Math.max(active.c, anchor.c) }),
    [active, anchor],
  );

  // Держим выделение в пределах таблицы при изменении строк/фильтра
  useEffect(() => {
    if (active.r > maxR || active.c > maxC) {
      const p = clamp(active);
      setActive(p);
      setAnchor(p);
    }
  }, [maxR, maxC, active, clamp]);

  useEffect(() => {
    onSelectionChange?.({
      row: rows[active.r],
      col: columns[active.c],
      count: (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1),
      keys: rows.slice(range.r1, range.r2 + 1).map((r) => r.key),
    });
  }, [active, range, rows, columns, onSelectionChange]);

  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(() => setView((v) => ({ ...v, height: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollIntoView = useCallback(
    (p: Pos) => {
      const el = scrollRef.current;
      if (!el) return;
      const top = HEAD_H + p.r * ROW_H;
      if (top < el.scrollTop + HEAD_H) el.scrollTop = top - HEAD_H;
      else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight + 2;
      const left = offsets[p.c] ?? 0;
      const right = offsets[p.c + 1] ?? left;
      if (left - NUM_W < el.scrollLeft) el.scrollLeft = left - NUM_W;
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 2;
    },
    [offsets],
  );

  const select = useCallback(
    (p: Pos, extend = false) => {
      const q = clamp(p);
      setActive(q);
      if (!extend) setAnchor(q);
      scrollIntoView(q);
    },
    [clamp, scrollIntoView],
  );

  useEffect(() => {
    if (!focusKey) return;
    const idx = rows.findIndex((r) => r.key === focusKey);
    if (idx >= 0) {
      select({ r: idx, c: Math.max(0, columns.findIndex((c) => !readOnly(c))) });
      scrollRef.current?.focus();
      onFocused?.();
    }
  }, [focusKey, rows, columns, readOnly, select, onFocused]);

  const cellRect = (p: Pos): DOMRect | null => {
    const el = scrollRef.current?.querySelector(`[data-cell="${p.r}:${p.c}"]`);
    return el ? el.getBoundingClientRect() : null;
  };

  const editable = (p: Pos) => {
    const row = rows[p.r];
    const col = columns[p.c];
    return !!row && !!col && row.status !== 'deleted' && !readOnly(col);
  };

  const startEdit = (initial?: string) => {
    const row = rows[active.r];
    const col = columns[active.c];
    if (!row || !col || !editable(active)) return;
    if (col.type === 'file') {
      onPickFile?.(row, col);
      return;
    }
    scrollIntoView(active);
    const open = (rect: DOMRect) => setEditing({ initial, rect, at: [scrollRef.current!.scrollLeft, scrollRef.current!.scrollTop] });
    const rect = cellRect(active);
    if (rect) open(rect);
    else
      requestAnimationFrame(() => {
        const r = cellRect(active);
        if (r) open(r);
      });
  };

  const commit = (value: CellValue, move: Move) => {
    const row = rows[active.r];
    const col = columns[active.c];
    setEditing(null);
    if (row && col) setCells([{ key: row.key, col: col.key, value }]);
    scrollRef.current?.focus();
    if (move === 'down') {
      if (active.r === maxR && row) {
        // Enter в последней строке не создаёт строку сам — для этого есть Insert.
        select(active);
      } else select({ r: active.r + 1, c: active.c });
    } else if (move === 'up') select({ r: active.r - 1, c: active.c });
    else if (move === 'right') select(active.c < maxC ? { r: active.r, c: active.c + 1 } : { r: active.r + 1, c: 0 });
    else if (move === 'left') select(active.c > 0 ? { r: active.r, c: active.c - 1 } : { r: active.r - 1, c: maxC });
  };

  const cancel = () => {
    setEditing(null);
    scrollRef.current?.focus();
  };

  /* ------------------------------ clipboard ------------------------------- */

  const selectionTsv = () => {
    const out: string[][] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row = rows[r];
      if (!row) continue;
      out.push(columns.slice(range.c1, range.c2 + 1).map((c) => clipboardText(c, row.values[c.key], rel)));
    }
    return toTsv(out);
  };

  const clearSelection = () => {
    const updates: { key: string; col: string; value: CellValue }[] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row = rows[r];
      if (!row || row.status === 'deleted') continue;
      for (let c = range.c1; c <= range.c2; c++) {
        const col = columns[c];
        if (readOnly(col)) continue;
        if (col.type === 'file') setFile(row.key, col.key, null);
        else updates.push({ key: row.key, col: col.key, value: col.type === 'relation' ? [] : '' });
      }
    }
    setCells(updates);
  };

  const paste = (text: string) => {
    const data = parseTsv(text);
    if (!data.length || !columns.length) return;
    const updates: { key: string; col: string; value: CellValue }[] = [];
    const single = data.length === 1 && data[0].length === 1;
    const multiCell = range.r2 > range.r1 || range.c2 > range.c1;
    if (single && multiCell) {
      for (let r = range.r1; r <= range.r2; r++)
        for (let c = range.c1; c <= range.c2; c++) {
          const row = rows[r];
          const col = columns[c];
          if (row && row.status !== 'deleted' && !readOnly(col) && col.type !== 'file') updates.push({ key: row.key, col: col.key, value: parseText(col, data[0][0], rel) });
        }
      setCells(updates);
      return;
    }
    const extra: Record<string, CellValue>[] = [];
    data.forEach((line, i) => {
      const r = range.r1 + i;
      const target = rows[r];
      const values: Record<string, CellValue> = {};
      line.forEach((cell, j) => {
        const col = columns[range.c1 + j];
        if (!col || readOnly(col) || col.type === 'file') return;
        values[col.key] = parseText(col, cell, rel);
      });
      if (target) {
        if (target.status !== 'deleted') for (const [col, value] of Object.entries(values)) updates.push({ key: target.key, col, value });
      } else extra.push(values);
    });
    setCells(updates);
    if (extra.length) addRows(extra.length, rows[rows.length - 1]?.key, extra);
    const lastR = range.r1 + data.length - 1;
    const lastC = Math.min(maxC, range.c1 + Math.max(...data.map((d) => d.length)) - 1);
    setAnchor({ r: range.r1, c: range.c1 });
    setActive({ r: lastR, c: lastC });
  };

  useEffect(() => {
    const focused = () => document.activeElement === scrollRef.current;
    const onCopy = (e: ClipboardEvent) => {
      if (!focused() || !rows.length) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', selectionTsv());
    };
    const onCut = (e: ClipboardEvent) => {
      if (!focused() || !rows.length) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', selectionTsv());
      clearSelection();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!focused()) return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      paste(text);
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  });

  /* ------------------------------ row actions ------------------------------ */

  const selectedKeys = () => rows.slice(range.r1, range.r2 + 1).map((r) => r.key);
  const insertRow = () => {
    const [key] = addRows(1, rows[active.r]?.key);
    pendingFocus.current = key;
  };
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    const idx = rows.findIndex((r) => r.key === key);
    if (idx >= 0) {
      pendingFocus.current = null;
      select({ r: idx, c: Math.max(0, columns.findIndex((c) => !readOnly(c))) });
    }
  }, [rows, columns, readOnly, select]);

  /* -------------------------------- keyboard ------------------------------- */

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const page = Math.max(1, Math.floor(view.height / ROW_H) - 2);
    const go = (p: Pos) => {
      e.preventDefault();
      select(p, e.shiftKey);
    };
    switch (e.key) {
      case 'ArrowDown':
        return go({ r: ctrl ? maxR : active.r + 1, c: active.c });
      case 'ArrowUp':
        return go({ r: ctrl ? 0 : active.r - 1, c: active.c });
      case 'ArrowRight':
        return go({ r: active.r, c: ctrl ? maxC : active.c + 1 });
      case 'ArrowLeft':
        return go({ r: active.r, c: ctrl ? 0 : active.c - 1 });
      case 'PageDown':
        return go({ r: active.r + page, c: active.c });
      case 'PageUp':
        return go({ r: active.r - page, c: active.c });
      case 'Home':
        return go(ctrl ? { r: 0, c: 0 } : { r: active.r, c: 0 });
      case 'End':
        return go(ctrl ? { r: maxR, c: maxC } : { r: active.r, c: maxC });
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) select(active.c > 0 ? { r: active.r, c: active.c - 1 } : { r: active.r - 1, c: maxC });
        else select(active.c < maxC ? { r: active.r, c: active.c + 1 } : { r: active.r + 1, c: 0 });
        return;
      case 'Enter':
      case 'F2':
        e.preventDefault();
        startEdit();
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (ctrl) toggleDelete(selectedKeys());
        else clearSelection();
        return;
      case 'Insert':
        e.preventDefault();
        insertRow();
        return;
      case 'Escape':
        setAnchor(active);
        return;
      case ' ':
        if (columns[active.c] && ['select', 'status', 'relation'].includes(columns[active.c].type)) {
          e.preventDefault();
          startEdit();
        }
        return;
    }
    if (ctrl && e.code === 'KeyA') {
      e.preventDefault();
      setAnchor({ r: 0, c: 0 });
      setActive({ r: maxR, c: maxC });
      return;
    }
    if (!ctrl && !e.altKey && e.key.length === 1 && editable(active)) {
      e.preventDefault();
      startEdit(e.key);
    }
  };

  /* -------------------------------- render --------------------------------- */

  const first = Math.max(0, Math.floor((view.top - HEAD_H) / ROW_H) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_H) + OVERSCAN);
  const editCol = columns[active.c];
  const editRow = rows[active.r];

  const startResize = (e: React.MouseEvent, col: GridColumn) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = colW(col);
    const move = (ev: MouseEvent) => setWidth(col.key, w0 + ev.clientX - x0);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const rowsSel = selectedKeys();
  const allDeleted = rowsSel.length > 0 && rows.slice(range.r1, range.r2 + 1).every((r) => r.status === 'deleted');

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={scrollRef}
          data-testid="data-grid"
          role="grid"
          aria-rowcount={rows.length}
          aria-colcount={columns.length}
          tabIndex={0}
          className="relative min-h-0 flex-1 overflow-auto bg-panel outline-hidden focus-visible:outline-hidden"
          onKeyDown={onKeyDown}
          onScroll={(e) => {
            const { scrollTop: top, scrollLeft: left } = e.currentTarget;
            setView((v) => (v.top === top ? v : { ...v, top }));
            // Редактор привязан к экранным координатам ячейки — при прокрутке закрываем его.
            if (editing && (Math.abs(editing.at[0] - left) > 2 || Math.abs(editing.at[1] - top) > 2)) setEditing(null);
          }}
        >
          <div className="relative" style={{ width: totalW, height: HEAD_H + rows.length * ROW_H + ROW_H }}>
            {/* Заголовок */}
            <div className="sticky top-0 z-20 flex border-b border-line-strong bg-sunken" style={{ height: HEAD_H, width: totalW }} role="row">
              <div className="sticky left-0 z-10 flex shrink-0 items-center justify-center border-r border-line-strong bg-sunken text-2xs text-fg-subtle" style={{ width: NUM_W }}>
                №
              </div>
              {columns.map((c) => {
                const Icon = TYPE_ICON[c.type];
                const sorted = sort?.key === c.key ? sort.dir : null;
                return (
                  <div
                    key={c.key}
                    role="columnheader"
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                    data-testid={`col-${c.key}`}
                    title={c.missing ? t('grid.missingColumn') : `${c.label} · ${c.key}`}
                    className="group relative flex shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-line px-2 text-xs font-semibold text-fg hover:bg-hover"
                    style={{ width: colW(c) }}
                    onClick={() => onSort(c.key)}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                    <span className="truncate">{c.label}</span>
                    {c.required && <span className="text-danger">*</span>}
                    {c.missing && <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />}
                    {sorted && (sorted === 'asc' ? <ArrowUp className="ml-auto h-3 w-3 text-accent" /> : <ArrowDown className="ml-auto h-3 w-3 text-accent" />)}
                    <span className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize" onMouseDown={(e) => startResize(e, c)} onClick={(e) => e.stopPropagation()} />
                  </div>
                );
              })}
            </div>

            {/* Строки */}
            {rows.slice(first, last).map((row, i) => {
              const r = first + i;
              const deleted = row.status === 'deleted';
              const rowError = row.errors._row;
              const hasErrors = Object.keys(row.errors).length > 0;
              const rowSelected = r >= range.r1 && r <= range.r2;
              return (
                <div
                  key={row.key}
                  role="row"
                  aria-rowindex={r + 1}
                  data-row={row.key}
                  data-status={row.status}
                  className={cn('absolute left-0 flex', deleted && 'text-fg-subtle line-through')}
                  style={{ top: HEAD_H + r * ROW_H, height: ROW_H, width: totalW }}
                >
                  <div
                    className={cn(
                      'sticky left-0 z-10 flex shrink-0 cursor-pointer items-center gap-1 border-b border-r border-line-strong px-1.5 text-2xs tabular-nums no-underline',
                      rowSelected ? 'bg-accent-soft text-accent-text' : 'bg-sunken text-fg-subtle',
                    )}
                    style={{ width: NUM_W }}
                    title={rowError ?? (hasErrors ? t('grid.rowHasErrors') : t(`grid.status.${row.status}` as TKey))}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      scrollRef.current?.focus();
                      if (e.shiftKey) {
                        setActive({ r, c: maxC });
                      } else {
                        setAnchor({ r, c: 0 });
                        setActive({ r, c: maxC });
                      }
                    }}
                  >
                    <span className="w-3.5 shrink-0">
                      {hasErrors ? (
                        <AlertTriangle className="h-3 w-3 text-danger" />
                      ) : row.status === 'new' ? (
                        <Plus className="h-3 w-3 text-success" />
                      ) : row.status === 'modified' ? (
                        <Pencil className="h-3 w-3 text-accent" />
                      ) : deleted ? (
                        <X className="h-3 w-3 text-danger" />
                      ) : null}
                    </span>
                    <span className="ml-auto">{r + 1}</span>
                  </div>
                  {columns.map((col, c) => {
                    const value = row.values[col.key];
                    const inRange = r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
                    const isActive = r === active.r && c === active.c;
                    const changed = row.status === 'modified' && JSON.stringify(value ?? '') !== JSON.stringify(row.original[col.key] ?? '');
                    const error = row.errors[col.key] ?? (strictLinks && !deleted && unknownLinks(col, value, rel).length ? 'link' : undefined);
                    const ro = readOnly(col);
                    return (
                      <div
                        key={col.key}
                        role="gridcell"
                        aria-selected={inRange}
                        data-cell={`${r}:${c}`}
                        data-col={col.key}
                        title={error ? t(ERR[error] ?? 'grid.err.server', { msg: error }) : undefined}
                        className={cn(
                          'relative flex shrink-0 items-center overflow-hidden border-b border-r border-line px-2 text-sm',
                          col.type === 'number' && 'justify-end tabular-nums',
                          deleted ? 'bg-danger-soft/50' : inRange && !isActive ? 'bg-accent-soft' : changed ? 'bg-warning-soft/60' : row.status === 'new' ? 'bg-success-soft/40' : '',
                          ro && !deleted && 'text-fg-muted',
                          error && !deleted && 'bg-danger-soft',
                        )}
                        style={{ width: colW(col) }}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          scrollRef.current?.focus();
                          select({ r, c }, e.shiftKey);
                          dragging.current = true;
                        }}
                        onMouseEnter={() => {
                          if (dragging.current) setActive({ r, c });
                        }}
                        onDoubleClick={() => startEdit()}
                        onContextMenu={() => {
                          if (!inRange) select({ r, c });
                        }}
                      >
                        <CellView col={col} value={value} row={row} locale={locale} fileHref={fileHref} strict={!!strictLinks} />
                        {isActive && <span className="pointer-events-none absolute inset-0 border-2 border-accent" />}
                        {error && !deleted && <span className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[6px] border-t-[6px] border-l-transparent border-t-danger" />}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Строка «добавить» */}
            <div className="absolute left-0" style={{ top: HEAD_H + rows.length * ROW_H, height: ROW_H, width: totalW }}>
              <button
                type="button"
                className="sticky left-0 flex h-full items-center gap-1.5 px-3 text-xs text-fg-subtle hover:text-accent-text"
                onClick={() => {
                  const [key] = addRows(1);
                  pendingFocus.current = key;
                  scrollRef.current?.focus();
                }}
              >
                <Plus className="h-3.5 w-3.5" /> {t('grid.addRow')} <kbd className="ml-1">Insert</kbd>
              </button>
            </div>
          </div>

          {!rows.length && (
            <div className="pointer-events-none absolute inset-x-0 top-24 text-center text-sm text-fg-subtle">{t('grid.noRows')}</div>
          )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContentClass}>
          <ContextMenu.Item className={menuItemClass} disabled={!editable(active)} onSelect={() => startEdit()}>
            <MenuItemBody icon={<Pencil className="h-3.5 w-3.5" />} label={t('grid.edit')} shortcut="Enter" />
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={() => void navigator.clipboard?.writeText(selectionTsv())}>
            <MenuItemBody label={t('common.copy')} shortcut="Ctrl+C" />
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => {
              void navigator.clipboard?.readText().then(paste).catch(() => undefined);
            }}
          >
            <MenuItemBody label={t('grid.paste')} shortcut="Ctrl+V" />
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={clearSelection}>
            <MenuItemBody label={t('grid.clear')} shortcut="Delete" />
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item className={menuItemClass} onSelect={insertRow}>
            <MenuItemBody icon={<Plus className="h-3.5 w-3.5" />} label={t('grid.insertRow')} shortcut="Insert" />
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} disabled={!rowsSel.length} onSelect={() => toggleDelete(rowsSel)}>
            <MenuItemBody icon={<X className="h-3.5 w-3.5" />} label={allDeleted ? t('grid.restoreRows') : t('grid.deleteRows', { n: rowsSel.length })} shortcut="Ctrl+Delete" />
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} disabled={!rows.slice(range.r1, range.r2 + 1).some((r) => r.status !== 'clean')} onSelect={() => revert(rowsSel)}>
            <MenuItemBody icon={<Undo2 className="h-3.5 w-3.5" />} label={t('grid.revertRows')} />
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>

      {editing && editRow && editCol && (['select', 'status', 'relation'].includes(editCol.type) ? (
        <ChoiceEditor column={editCol} value={editRow.values[editCol.key]} rel={rel} initial={editing.initial} anchor={editing.rect} onCommit={commit} onCancel={cancel} />
      ) : (
        <TextEditor column={editCol} value={editRow.values[editCol.key]} rel={rel} initial={editing.initial} anchor={editing.rect} onCommit={commit} onCancel={cancel} />
      ))}
    </ContextMenu.Root>
  );
}

function CellView({ col, value, row, locale, fileHref, strict }: { col: GridColumn; value: CellValue; row: Row; locale: string; fileHref?: (row: Row, name: string) => string | null; strict: boolean }) {
  const rel = useGrid((s) => s.relOptions);
  if (isEmpty(value)) return null;
  if (col.type === 'status' || col.type === 'select') {
    return (
      <span className={cn('inline-flex max-w-full items-center gap-1.5 truncate rounded-sm px-1.5 py-px text-xs', col.type === 'status' ? 'bg-accent-soft text-accent-text' : 'bg-hover text-fg')}>
        {col.type === 'status' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
        <span className="truncate">{String(value)}</span>
      </span>
    );
  }
  if (col.type === 'relation' && Array.isArray(value)) {
    return (
      <span className="flex min-w-0 gap-1 overflow-hidden">
        {value.map((id) => {
          const label = cellText(col, [id], rel, locale);
          const unknown = strict && unknownLinks(col, [id], rel).length > 0;
          return (
            <span key={id} className={cn('shrink-0 truncate rounded-sm border px-1.5 py-px text-xs', unknown ? 'border-danger/40 text-danger' : 'border-line bg-sunken text-fg')} style={{ maxWidth: 180 }}>
              {label}
            </span>
          );
        })}
      </span>
    );
  }
  if (col.type === 'file' && Array.isArray(value)) {
    return (
      <span className="flex min-w-0 gap-1.5 overflow-hidden text-xs">
        {value.map((name) => {
          const href = row.files[col.key] ? null : fileHref?.(row, name);
          return href ? (
            <a key={name} href={href} target="_blank" rel="noreferrer" className="truncate text-accent-text underline" onMouseDown={(e) => e.stopPropagation()}>
              {name}
            </a>
          ) : (
            <span key={name} className="truncate">{name}</span>
          );
        })}
      </span>
    );
  }
  return <span className="truncate">{cellText(col, value, rel, locale)}</span>;
}
