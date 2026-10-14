import type { ClubEntity, ClubSchema } from '@/types/schema';
import { relationsOf } from './model';
import type { PortalRecord } from './types';

export interface BasisAction {
  target: ClubEntity;
  label: string;
  /** Индекс правила в target.basedOn; null — автоматическая связь по полю-ссылке. */
  rule: number | null;
}

/**
 * Что можно создать на основании записи раздела `source`:
 * правила «ввода на основании» и разделы, которые ссылаются на этот (связанная запись).
 */
export function basisActions(schema: ClubSchema, source: ClubEntity, canCreate: (e: ClubEntity) => boolean): BasisAction[] {
  const out: BasisAction[] = [];
  for (const target of schema.entities) {
    if (!canCreate(target)) continue;
    (target.basedOn ?? []).forEach((rule, i) => {
      if (rule.from === source.id) out.push({ target, label: rule.label, rule: i });
    });
  }
  for (const target of schema.entities) {
    if (target.id === source.id || !canCreate(target)) continue;
    if (out.some((a) => a.target.id === target.id)) continue;
    if (relationsOf(schema, target).some((r) => r.targetEntityId === source.id)) out.push({ target, label: `+ ${target.name}`, rule: null });
  }
  return out;
}

/** Начальные значения новой записи: ссылка на исходную, совпадающие поля, значения правила. */
export function basisValues(schema: ClubSchema, source: ClubEntity, record: PortalRecord, target: ClubEntity, ruleIndex: number | null): PortalRecord {
  const values: PortalRecord = { id: '' };
  const rule = ruleIndex === null ? null : target.basedOn?.[ruleIndex];
  // Ссылки на исходную запись.
  for (const r of relationsOf(schema, target)) if (r.targetEntityId === source.id) values[r.name] = r.multiple ? [record.id] : record.id;
  if (rule) {
    // Копия совпадающих полей (тот же id и тип, у ссылок — тот же раздел).
    for (const f of target.fields) {
      const sf = source.fields.find((x) => x.id === f.id && x.type === f.type && (f.type !== 'relation' || x.targetEntityId === f.targetEntityId));
      if (sf && record[sf.id] !== undefined) values[f.id] = record[sf.id];
    }
    for (const [k, v] of Object.entries(rule.set ?? {})) values[k] = v;
  }
  if (target.kind === 'operation') values.posted = true;
  return values;
}
