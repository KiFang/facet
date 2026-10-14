import type { ClubEntity, ClubSchema } from '@/types/schema';

export interface ResolvedRelation {
  /** Имя поля-связи в коллекции PocketBase. */
  name: string;
  label: string;
  targetEntityId: string;
  multiple: boolean;
  required: boolean;
}

/**
 * Единая точка сборки всех связей сущности: поля типа `relation` + связи уровня сущности.
 * Тот же алгоритм продублирован в экспортированном portal.js — менять синхронно.
 */
export function resolveRelations(entity: ClubEntity, schema: ClubSchema): ResolvedRelation[] {
  const existing = new Set(schema.entities.map((e) => e.id));
  const taken = new Set(entity.fields.map((f) => f.id));
  const out: ResolvedRelation[] = [];
  for (const field of entity.fields) {
    if (field.type !== 'relation' || !field.targetEntityId || !existing.has(field.targetEntityId)) continue;
    out.push({ name: field.id, label: field.name, targetEntityId: field.targetEntityId, multiple: false, required: field.required });
  }
  for (const rel of entity.relations) {
    if (!existing.has(rel.targetEntityId)) continue;
    const name = taken.has(rel.targetEntityId) ? `${rel.targetEntityId}_rel` : rel.targetEntityId;
    taken.add(name);
    const target = schema.entities.find((e) => e.id === rel.targetEntityId)!;
    out.push({ name, label: target.pluralName, targetEntityId: rel.targetEntityId, multiple: rel.type === 'many-to-many', required: false });
  }
  return out;
}
