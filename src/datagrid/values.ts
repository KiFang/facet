import { parseDateValue, parseNumberValue, splitLinks } from '@/utils/migrations/seeds';
import { displayDate, fromPbDate } from './sources';
import type { CellValue, GridColumn, RelationOption } from './types';

export type Labels = Record<string, RelationOption[]>;

export function relationLabel(col: GridColumn, id: string, rel: Labels): string {
  return rel[col.target ?? '']?.find((o) => o.value === id)?.label ?? id;
}

/** Текст ячейки для показа и копирования. */
export function cellText(col: GridColumn, value: CellValue, rel: Labels, locale: string): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return (col.type === 'relation' ? value.map((v) => relationLabel(col, v, rel)) : value).join('; ');
  if (col.type === 'date') return displayDate(value, locale);
  if (col.type === 'number' && typeof value === 'number') return value.toLocaleString(locale, { maximumFractionDigits: 10 });
  return String(value);
}

/** Текст для буфера обмена: даты — в формате, который понимают и Excel, и обратная вставка. */
export function clipboardText(col: GridColumn, value: CellValue, rel: Labels): string {
  if (Array.isArray(value)) return (col.type === 'relation' ? value.map((v) => relationLabel(col, v, rel)) : value).join('; ');
  if (value === null || value === undefined) return '';
  if (col.type === 'date' && typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/.exec(value);
    if (m) return `${m[3]}.${m[2]}.${m[1]}${m[4] && `${m[4]}:${m[5]}` !== '00:00' ? ` ${m[4]}:${m[5]}` : ''}`;
  }
  return String(value);
}

/**
 * Разбирает введённый или вставленный текст в значение ячейки.
 * Нераспознанные значения остаются как есть — проверка покажет ошибку.
 */
export function parseText(col: GridColumn, text: string, rel: Labels): CellValue {
  const s = text.replace(/\r/g, '').trim();
  switch (col.type) {
    case 'number': {
      if (!s) return '';
      const n = parseNumberValue(s);
      return n === null ? s : n;
    }
    case 'date': {
      if (!s) return '';
      const iso = parseDateValue(s);
      return iso ? fromPbDate(iso) : s;
    }
    case 'select':
    case 'status': {
      if (!s) return '';
      return col.options?.find((o) => o.toLowerCase() === s.toLowerCase()) ?? s;
    }
    case 'relation': {
      const parts = splitLinks(s);
      const options = rel[col.target ?? ''];
      const ids = parts.map((p) => {
        if (!options) return p;
        const hit = options.find((o) => o.label.toLowerCase() === p.toLowerCase() || o.value === p);
        return hit ? hit.value : p;
      });
      return col.multiple ? ids : ids.slice(0, 1);
    }
    case 'file':
      return null;
    default:
      return text.replace(/\r/g, '');
  }
}

/** Связи, которых нет среди записей раздела-цели. */
export function unknownLinks(col: GridColumn, value: CellValue, rel: Labels): string[] {
  const options = rel[col.target ?? ''];
  if (!options || !Array.isArray(value)) return [];
  return value.filter((v) => !options.some((o) => o.value === v));
}

/** TSV в формате Excel/Google Sheets: табуляция, кавычки для многострочных ячеек. */
export function toTsv(rows: string[][]): string {
  const cell = (v: string) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join('\t')).join('\r\n');
}

export function parseTsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell);
  out.push(row);
  return out;
}

export function toCsv(header: string[], rows: string[][], locale: string): string {
  const sep = locale === 'ru' ? ';' : ',';
  const cell = (v: string) => (/[";\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `﻿${[header, ...rows].map((r) => r.map(cell).join(sep)).join('\r\n')}\r\n`;
}
