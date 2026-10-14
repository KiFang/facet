import type { ClubEntity, ClubSchema } from '@/types/schema';
import type { SeedBatch } from '@/store/useClubStore';
import { resolveRelations } from '@/utils/relations';

export interface SeedOp {
  op: 'seed';
  collection: string;
  relations: { field: string; target: string; titleField: string; multiple: boolean }[];
  rows: { values: Record<string, string | number>; links: Record<string, string[]> }[];
}

const DATE_RU = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/;
const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/;

/** «14.10.2026 18:30» / «2026-10-14» → формат даты PocketBase (UTC). null — не распознано. */
export function parseDateValue(raw: string): string | null {
  const s = raw.trim();
  let m = DATE_RU.exec(s);
  let y: number, mo: number, d: number, h = 0, mi = 0;
  if (m) {
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4]) [h, mi] = [Number(m[4]), Number(m[5])];
  } else if ((m = DATE_ISO.exec(s))) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4]) [h, mi] = [Number(m[4]), Number(m[5])];
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:00.000Z`;
}

/** «1 234,5» → 1234.5. null — не число. */
export function parseNumberValue(raw: string): number | null {
  const s = raw.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function splitLinks(raw: string): string[] {
  return raw.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
}

function titleFieldOf(entity: ClubEntity): string {
  return (entity.fields.find((f) => f.type === 'text') ?? entity.fields[0])?.id ?? 'id';
}

/** Превращает строки импорта в операцию наполнения коллекции. Ячейки с ошибками отбрасываются. */
export function buildSeedOp(schema: ClubSchema, entity: ClubEntity, batch: SeedBatch): SeedOp {
  const relations = resolveRelations(entity, schema).map((r) => {
    const target = schema.entities.find((e) => e.id === r.targetEntityId)!;
    return { field: r.name, target: target.id, titleField: titleFieldOf(target), multiple: r.multiple };
  });
  const rows = batch.rows.map((row) => {
    const values: Record<string, string | number> = {};
    const links: Record<string, string[]> = {};
    for (const field of entity.fields) {
      const raw = (row[field.id] ?? '').trim();
      if (!raw) continue;
      switch (field.type) {
        case 'number': {
          const n = parseNumberValue(raw);
          if (n !== null) values[field.id] = n;
          break;
        }
        case 'date': {
          const d = parseDateValue(raw);
          if (d) values[field.id] = d;
          break;
        }
        case 'select':
        case 'status': {
          const match = field.options?.find((o) => o.toLowerCase() === raw.toLowerCase());
          if (match) values[field.id] = match;
          break;
        }
        case 'file':
          break; // файлы из таблиц не переносятся
        case 'relation':
          links[field.id] = splitLinks(raw);
          break;
        default:
          values[field.id] = raw;
      }
    }
    for (const rel of relations) {
      if (links[rel.field]) continue;
      const raw = (row[rel.field] ?? '').trim();
      if (raw) links[rel.field] = splitLinks(raw);
    }
    return { values, links };
  });
  return { op: 'seed', collection: entity.id, relations, rows };
}

/** Порядок наполнения: сначала коллекции, на которые ссылаются другие. */
export function orderSeedOps(ops: SeedOp[]): SeedOp[] {
  const pending = [...ops];
  const done = new Set<string>();
  const out: SeedOp[] = [];
  while (pending.length) {
    const idx = pending.findIndex((op) =>
      op.relations.every((r) => r.target === op.collection || done.has(r.target) || !pending.some((p) => p.collection === r.target)),
    );
    const [next] = pending.splice(idx === -1 ? 0 : idx, 1); // цикл — берём как есть
    done.add(next.collection);
    out.push(next);
  }
  return out;
}
