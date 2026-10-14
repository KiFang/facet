import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, Search } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import type { CellValue, GridColumn, RelationOption } from './types';
import { clipboardText, parseText, type Labels } from './values';

export type Move = 'down' | 'up' | 'right' | 'left' | 'none';

export interface EditorProps {
  column: GridColumn;
  value: CellValue;
  rel: Labels;
  /** Символ, с которого пользователь начал ввод (заменяет значение). */
  initial?: string;
  anchor: DOMRect;
  onCommit: (value: CellValue, move: Move) => void;
  onCancel: () => void;
}

const keyMove = (e: React.KeyboardEvent): Move | null => {
  if (e.key === 'Enter') return e.shiftKey ? 'up' : 'down';
  if (e.key === 'Tab') return e.shiftKey ? 'left' : 'right';
  return null;
};

/** Однострочный редактор поверх ячейки: текст, число, дата. */
export function TextEditor({ column, value, rel, initial, anchor, onCommit, onCancel }: EditorProps) {
  const t = useT();
  const [text, setText] = useState(initial ?? clipboardText(column, value, rel));
  const ref = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.focus();
    if (initial === undefined) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [initial]);
  const commit = (move: Move) => {
    if (done.current) return;
    done.current = true;
    onCommit(parseText(column, text, rel), move);
  };
  const isDate = column.type === 'date';
  return createPortal(
    <div className="fixed z-[80] flex" style={{ top: anchor.top, left: anchor.left, width: Math.max(anchor.width, isDate ? 200 : 120), height: anchor.height }}>
      <input
        ref={ref}
        data-testid="cell-editor"
        className="h-full min-w-0 flex-1 border-2 border-accent bg-panel px-1.5 text-sm text-fg outline-none"
        value={text}
        inputMode={column.type === 'number' ? 'decimal' : undefined}
        placeholder={isDate ? t('grid.datePlaceholder') : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          if (e.relatedTarget === picker.current) return;
          commit('none');
        }}
        onKeyDown={(e) => {
          const move = keyMove(e);
          if (move) {
            e.preventDefault();
            commit(move);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            done.current = true;
            onCancel();
          }
          e.stopPropagation();
        }}
      />
      {isDate && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label={t('grid.pickDate')}
            className="flex w-7 shrink-0 items-center justify-center border-y-2 border-r-2 border-accent bg-panel text-fg-muted hover:text-fg"
            onMouseDown={(e) => {
              e.preventDefault();
              const p = picker.current!;
              const iso = parseText(column, text, rel);
              p.value = typeof iso === 'string' && iso ? iso.replace(' ', 'T') : '';
              try {
                p.showPicker();
              } catch {
                p.focus();
              }
            }}
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </button>
          <input
            ref={picker}
            type="datetime-local"
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
            onChange={(e) => {
              const v = e.target.value.replace('T', ' ');
              setText(clipboardText(column, v, rel));
              ref.current?.focus();
            }}
          />
        </>
      )}
    </div>,
    document.body,
  );
}

function usePopoverPosition(anchor: DOMRect, width: number, maxHeight: number) {
  return useMemo(() => {
    const below = window.innerHeight - anchor.bottom;
    const up = below < maxHeight && anchor.top > below;
    const left = Math.min(anchor.left, window.innerWidth - width - 8);
    return up
      ? { left, bottom: window.innerHeight - anchor.top + 2, width, maxHeight: Math.min(maxHeight, anchor.top - 8) }
      : { left, top: anchor.bottom + 2, width, maxHeight: Math.min(maxHeight, below - 8) };
  }, [anchor, width, maxHeight]);
}

/**
 * Выбор из списка: варианты поля (select/status) или записи связанного раздела.
 * Для множественной связи — флажки; Enter отмечает, Ctrl+Enter или «Готово» применяет.
 */
export function ChoiceEditor({ column, value, rel, initial, anchor, onCommit, onCancel }: EditorProps) {
  const t = useT();
  const multiple = column.type === 'relation' && !!column.multiple;
  const options: RelationOption[] = useMemo(
    () => (column.type === 'relation' ? (rel[column.target ?? ''] ?? []) : (column.options ?? []).map((o) => ({ value: o, label: o }))),
    [column, rel],
  );
  const initialSet = Array.isArray(value) ? value : value ? [String(value)] : [];
  const [picked, setPicked] = useState<string[]>(initialSet);
  const [query, setQuery] = useState(initial ?? '');
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const pos = usePopoverPosition(anchor, Math.max(anchor.width, 280), 320);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return !multiple && !column.required && !q ? [{ value: '', label: '' }, ...list] : list;
  }, [options, query, multiple, column.required]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (!initial) {
      const idx = filtered.findIndex((o) => initialSet.includes(o.value));
      if (idx >= 0) setHi(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => setHi((h) => Math.min(h, Math.max(0, filtered.length - 1))), [filtered.length]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  const finish = (val: CellValue, move: Move) => {
    if (done.current) return;
    done.current = true;
    onCommit(val, move);
  };
  const valueOf = (ids: string[]): CellValue => (column.type === 'relation' ? ids : (ids[0] ?? ''));
  const choose = (opt: RelationOption) => {
    if (multiple) setPicked((p) => (p.includes(opt.value) ? p.filter((x) => x !== opt.value) : [...p, opt.value]));
    else finish(valueOf(opt.value ? [opt.value] : []), 'down');
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current?.contains(e.target as Node)) return;
      if (multiple) finish(valueOf(picked), 'none');
      else {
        done.current = true;
        onCancel();
      }
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  });

  return createPortal(
    <div
      ref={boxRef}
      data-testid="choice-editor"
      className="fixed z-[80] flex flex-col overflow-hidden rounded-md border border-line-strong bg-raised shadow-pop animate-pop-in"
      style={pos}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHi((h) => Math.min(filtered.length - 1, h + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHi((h) => Math.max(0, h - 1));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (multiple && (e.ctrlKey || e.metaKey)) finish(valueOf(picked), 'down');
          else if (filtered[hi]) choose(filtered[hi]);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          finish(multiple ? valueOf(picked) : valueOf(filtered[hi]?.value ? [filtered[hi].value] : initialSet), e.shiftKey ? 'left' : 'right');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
    >
      <div className="flex items-center gap-1.5 border-b border-line px-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        <input
          ref={inputRef}
          className="h-8 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          placeholder={t('grid.searchOptions')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHi(0);
          }}
        />
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-auto py-1" role="listbox" aria-multiselectable={multiple}>
        {filtered.length === 0 && <div className="px-3 py-2 text-xs text-fg-subtle">{options.length ? t('palette.empty') : t('grid.noOptions')}</div>}
        {filtered.map((o, i) => {
          const on = multiple ? picked.includes(o.value) : initialSet.includes(o.value) || (!o.value && !initialSet.length);
          return (
            <div
              key={o.value || '∅'}
              data-idx={i}
              role="option"
              aria-selected={on}
              className={cn('flex h-7 cursor-pointer items-center gap-2 px-2.5 text-sm', i === hi ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-hover')}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
            >
              <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center', multiple && 'rounded-sm border', multiple && (i === hi ? 'border-accent-fg' : 'border-line-strong'))}>
                {on && <Check className="h-3 w-3" />}
              </span>
              <span className={cn('truncate', !o.value && 'italic opacity-70')}>{o.value ? o.label : t('grid.empty')}</span>
            </div>
          );
        })}
      </div>
      {multiple && (
        <div className="flex items-center justify-between gap-2 border-t border-line bg-sunken px-2 py-1.5">
          <span className="text-2xs text-fg-subtle">{t('grid.multiHint')}</span>
          <button type="button" className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg hover:bg-accent-hover" onMouseDown={(e) => { e.preventDefault(); finish(valueOf(picked), 'down'); }}>
            {t('common.done')}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
