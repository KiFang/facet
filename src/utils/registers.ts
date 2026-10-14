import type { ClubEntity, ClubRegister, ClubSchema, Posting } from '@/types/schema';
import { rolesWith } from '@/utils/access';
import registersLib from '@/export-templates/registers-lib.js?raw';
import registersHook from '@/export-templates/registers-hook.pb.js?raw';

/** Коллекция движений регистра в PocketBase. */
export const regCollection = (id: string) => `reg_${id}`;
/** Поле «Подтверждена» у операций. */
export const POSTED_FIELD = 'posted';
export const dimColumn = (id: string) => `d_${id}`;
export const resColumn = (id: string) => `r_${id}`;

export interface Movement {
  register: string;
  /** Значения измерений (id записи для ссылок, текст — для прочих полей). */
  dims: Record<string, string>;
  /** Ресурсы со знаком: приход +, расход −. */
  res: Record<string, number>;
  period: string;
}

export const isOperation = (e: ClubEntity) => e.kind === 'operation';
export const operationsOf = (schema: ClubSchema) => schema.entities.filter(isOperation);

/** Знак движения для записи: +1 приход, −1 расход, 0 — не проводится. */
export function directionSign(posting: Posting, record: Record<string, unknown>): number {
  const d = posting.direction;
  if (d === 'in') return 1;
  if (d === 'out') return -1;
  const v = String(record[d.field] ?? '');
  if (d.in.includes(v)) return 1;
  if (d.out.includes(v)) return -1;
  return 0;
}

const toNumber = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const first = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));

/** Движения, которые даёт подтверждённая операция (неподтверждённая — никаких). */
export function movementsOf(schema: ClubSchema, entity: ClubEntity, record: Record<string, unknown>): Movement[] {
  if (!isOperation(entity) || !record[POSTED_FIELD]) return [];
  const out: Movement[] = [];
  for (const p of entity.postings ?? []) {
    const reg = schema.registers?.find((r) => r.id === p.register);
    if (!reg) continue;
    const sign = directionSign(p, record);
    if (!sign) continue;
    const dims = Object.fromEntries(reg.dimensions.map((d) => [d.id, first(record[p.dimensions[d.id]])]));
    const res = Object.fromEntries(reg.resources.map((r) => {
      const src = p.resources[r.id];
      return [r.id, sign * (src === '1' ? 1 : toNumber(record[src]))];
    }));
    const period = String((p.dateField && record[p.dateField]) || record.created || '');
    out.push({ register: reg.id, dims, res, period });
  }
  return out;
}

export interface BalanceRow {
  dims: Record<string, string>;
  res: Record<string, number>;
}

/** Остатки: сумма движений по сочетаниям измерений (нулевые строки скрываются). */
export function balances(reg: ClubRegister, movements: { dims: Record<string, string>; res: Record<string, number>; period?: string }[], until?: string): BalanceRow[] {
  const map = new Map<string, BalanceRow>();
  for (const m of movements) {
    if (until && m.period && m.period > until) continue;
    const key = reg.dimensions.map((d) => m.dims[d.id] ?? '').join('\u0001');
    let row = map.get(key);
    if (!row) {
      row = { dims: Object.fromEntries(reg.dimensions.map((d) => [d.id, m.dims[d.id] ?? ''])), res: Object.fromEntries(reg.resources.map((r) => [r.id, 0])) };
      map.set(key, row);
    }
    for (const r of reg.resources) row.res[r.id] += m.res[r.id] ?? 0;
  }
  return [...map.values()].filter((r) => reg.resources.some((x) => Math.abs(r.res[x.id]) > 1e-9));
}

/** Роли, которые видят регистр: те, кто видит хотя бы одну операцию, пишущую в него. */
export function registerReaders(schema: ClubSchema, reg: ClubRegister) {
  const ops = operationsOf(schema).filter((e) => e.postings?.some((p) => p.register === reg.id));
  const ids = new Set<string>();
  for (const op of ops) for (const r of rolesWith(schema, op.id, 'read')) ids.add(r.id);
  return (schema.roles ?? []).filter((r) => ids.has(r.id) || r.id === 'chair');
}

/** Ошибки настройки проведения (для строки состояния и валидатора). */
export function postingProblems(schema: ClubSchema): string[] {
  const out: string[] = [];
  for (const e of operationsOf(schema)) {
    for (const p of e.postings ?? []) {
      const reg = schema.registers?.find((r) => r.id === p.register);
      if (!reg) {
        out.push(`${e.pluralName}: нет регистра «${p.register}»`);
        continue;
      }
      for (const d of reg.dimensions) if (!e.fields.some((f) => f.id === p.dimensions[d.id])) out.push(`${e.pluralName} → ${reg.name}: не выбрано поле для «${d.name}»`);
      for (const r of reg.resources) {
        const src = p.resources[r.id];
        if (src !== '1' && !e.fields.some((f) => f.id === src && f.type === 'number')) out.push(`${e.pluralName} → ${reg.name}: не выбрано числовое поле для «${r.name}»`);
      }
      if (typeof p.direction === 'object' && !e.fields.some((f) => f.id === (p.direction as { field: string }).field))
        out.push(`${e.pluralName} → ${reg.name}: не выбрано поле направления`);
    }
  }
  return out;
}

/** Хук проведения для pb_hooks: пустой список, если операций с регистрами нет. */
export function registerHookFiles(schema: ClubSchema): { path: string; content: string; description: string }[] {
  const ops = operationsOf(schema).filter((e) => e.postings?.length);
  if (!ops.length || !schema.registers?.length) return [];
  const config = {
    registers: schema.registers,
    operations: Object.fromEntries(ops.map((e) => [e.id, e.postings])),
  };
  const names = ops.map((e) => JSON.stringify(e.id)).join(', ');
  return [
    { path: 'pocketbase/pb_hooks/facet-registers.lib.js', content: registersLib.replace('__FACET_REGISTERS__', JSON.stringify(config, null, 2)), description: 'Проведение операций: правила и расчёт остатков' },
    { path: 'pocketbase/pb_hooks/facet-registers.pb.js', content: registersHook.split('__FACET_OPERATIONS__').join(names), description: 'Проведение операций по регистрам остатков' },
  ];
}
