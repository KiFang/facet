import type { ClubEntity, ClubSchema, EntityField, FieldType } from '@/types/schema';
import { resolveRelations } from '@/utils/relations';
import { parseDateValue, parseNumberValue } from '@/utils/migrations/seeds';

/** Разделитель по первой строке: «;» — Excel в русской локали, «\t» — копия из таблицы, иначе «,». */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let inQuotes = false;
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ',';
}

/** RFC 4180: кавычки, экранирование "", переводы строк внутри ячеек, BOM. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export function toTable(cells: string[][]): CsvTable {
  const [head = [], ...rest] = cells;
  const width = Math.max(head.length, ...rest.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => (head[i] ?? '').trim() || `Колонка ${i + 1}`);
  return { headers, rows: rest.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? '').trim())) };
}

const STATUS_HINT = /статус|status|состояни|state|этап|stage/i;

/** Тип поля по значениям колонки. */
export function inferFieldType(header: string, values: string[]): { type: FieldType; options?: string[] } {
  const filled = values.filter((v) => v !== '');
  if (!filled.length) return { type: 'text' };
  if (filled.every((v) => parseNumberValue(v) !== null)) return { type: 'number' };
  if (filled.every((v) => parseDateValue(v) !== null)) return { type: 'date' };
  const distinct = Array.from(new Set(filled));
  if (distinct.length <= 8 && filled.length >= distinct.length * 2 && distinct.every((v) => v.length <= 40)) {
    return { type: STATUS_HINT.test(header) ? 'status' : 'select', options: distinct };
  }
  return { type: 'text' };
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');

export interface ImportTarget {
  /** id поля или имя связи (как в seed-строках). */
  key: string;
  label: string;
  kind: FieldType | 'link';
}

/** Куда можно положить колонку: поля сущности (кроме файлов) и связи уровня сущности. */
export function importTargets(schema: ClubSchema, entity: ClubEntity): ImportTarget[] {
  const fields: ImportTarget[] = entity.fields
    .filter((f) => f.type !== 'file')
    .map((f) => ({ key: f.id, label: f.name, kind: f.type }));
  const links = resolveRelations(entity, schema)
    .filter((r) => !entity.fields.some((f) => f.id === r.name))
    .map((r) => ({ key: r.name, label: r.label, kind: 'link' as const }));
  return [...fields, ...links];
}

/** Слова, которые в таблицах клубов означают одно и то же. */
const SYNONYMS: string[][] = [
  ['фио', 'имя', 'имяифамилия', 'фамилияимя', 'участник', 'name', 'fullname', 'никнейм', 'nickname'],
  ['почта', 'email', 'емейл', 'mail', 'электроннаяпочта'],
  ['телефон', 'phone', 'тел', 'мобильный'],
  ['телеграм', 'telegram', 'tg', 'тг'],
  ['дата', 'date', 'когда', 'датаначала', 'start'],
  ['статус', 'status', 'состояние', 'state', 'этап'],
  ['название', 'title', 'наименование', 'тема'],
  ['количество', 'кол', 'колво', 'qty', 'quantity', 'шт'],
];

function score(header: string, target: ImportTarget): number {
  const h = norm(header);
  const label = norm(target.label);
  const key = norm(target.key);
  if (!h) return 0;
  if (h === label || h === key) return 3;
  if (SYNONYMS.some((group) => group.includes(h) && (group.includes(label) || group.includes(key) || group.some((w) => label.startsWith(w)))))
    return 2;
  if (h.length >= 3 && label.length >= 3 && (label.includes(h) || h.includes(label))) return 1;
  return 0;
}

/** Автосопоставление колонок с полями: точное совпадение → синонимы → вхождение. */
export function autoMap(headers: string[], targets: ImportTarget[]): (string | null)[] {
  const result: (string | null)[] = headers.map(() => null);
  const used = new Set<string>();
  for (const level of [3, 2, 1]) {
    headers.forEach((h, i) => {
      if (result[i]) return;
      const t = targets.find((x) => !used.has(x.key) && score(h, x) === level);
      if (t) {
        result[i] = t.key;
        used.add(t.key);
      }
    });
  }
  return result;
}

/** Поле для новой колонки при создании раздела из таблицы. */
export function fieldFromColumn(header: string, values: string[], id: string, first: boolean): EntityField {
  const inferred = inferFieldType(header, values);
  return {
    id,
    name: header,
    type: first ? 'text' : inferred.type,
    required: first,
    ...(inferred.options && !first ? { options: inferred.options } : {}),
  };
}

/** Ссылка на Google Таблицу → ссылка на CSV-выгрузку. null — это не Google Таблица. */
export function googleSheetCsvUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.hostname !== 'docs.google.com' || !url.pathname.startsWith('/spreadsheets/')) return null;
  const published = /\/spreadsheets\/d\/e\/([^/]+)/.exec(url.pathname);
  const gid = /gid=(\d+)/.exec(url.hash + url.search)?.[1];
  if (published) return `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`;
  const id = /\/spreadsheets\/d\/([^/]+)/.exec(url.pathname)?.[1];
  if (!id) return null;
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

export const MAX_IMPORT_ROWS = 5000;
