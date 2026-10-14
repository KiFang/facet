import { keyOf, type ClubEntity, type ClubSchema, type EntityField } from '@/types/schema';
import { resolveRelations } from '@/utils/relations';
import { entityRules, readOnlyRules, staffRules, STAFF_COLLECTION, type CollectionRules } from '@/utils/access';
import { dimColumn, isOperation, POSTED_FIELD, regCollection, registerReaders, resColumn } from '@/utils/registers';

/**
 * «Физическая» модель базы PocketBase, которую порождает схема клуба.
 * Сравнивая две физические модели, получаем миграцию без потери данных.
 */

export type PbFieldType = 'text' | 'number' | 'date' | 'select' | 'file' | 'relation' | 'bool';

export interface PhysField {
  /** Стабильный ключ (uid поля, либо `rel:<ключ цели>` для связей уровня сущности). */
  key: string;
  name: string;
  type: PbFieldType;
  required: boolean;
  /** select: допустимые значения. */
  values?: string[];
  /** relation: ключ целевой коллекции. */
  targetKey?: string;
  /** select/relation/file: 1 — одно значение. */
  maxSelect?: number;
}

export interface PhysCollection {
  key: string;
  name: string;
  fields: PhysField[];
  /** Коллекция учётных записей (вход по email и паролю). */
  auth?: boolean;
  rules: CollectionRules;
}

/** Ключ коллекции сотрудников — не пересекается с ключами разделов. */
export const STAFF_KEY = 'sys:staff';

export type PhysModel = PhysCollection[];

/** Максимум связанных записей для связи «много ↔ много». */
export const MULTI_RELATION_MAX = 999;

function physField(field: EntityField): PhysField | null {
  const base = { key: keyOf(field), name: field.id, required: field.required };
  switch (field.type) {
    case 'text':
      return { ...base, type: 'text' };
    case 'number':
      return { ...base, type: 'number' };
    case 'date':
      return { ...base, type: 'date' };
    case 'select':
    case 'status':
      return { ...base, type: 'select', maxSelect: 1, values: field.options?.length ? [...field.options] : ['—'] };
    case 'file':
      return { ...base, type: 'file', maxSelect: 1 };
    case 'relation':
      return null; // добавляются ниже через resolveRelations — единый алгоритм имён
  }
}

export function toPhysical(schema: ClubSchema): PhysModel {
  const keyById = new Map(schema.entities.map((e) => [e.id, keyOf(e)]));
  const model: PhysModel = schema.entities.map((entity: ClubEntity) => {
    const fields = entity.fields.map(physField).filter((f): f is PhysField => f !== null);
    for (const rel of resolveRelations(entity, schema)) {
      const sourceField = entity.fields.find((f) => f.type === 'relation' && f.id === rel.name);
      const targetKey = keyById.get(rel.targetEntityId)!;
      fields.push({
        key: sourceField ? keyOf(sourceField) : `rel:${targetKey}`,
        name: rel.name,
        type: 'relation',
        required: rel.required,
        targetKey,
        maxSelect: rel.multiple ? MULTI_RELATION_MAX : 1,
      });
    }
    if (isOperation(entity)) fields.push({ key: `${keyOf(entity)}:${POSTED_FIELD}`, name: POSTED_FIELD, type: 'bool', required: false });
    return { key: keyOf(entity), name: entity.id, fields, rules: entityRules(schema, entity) };
  });
  // Регистры остатков: движения пишет только сервер (хук проведения), читают роли с доступом к операциям.
  for (const reg of schema.registers ?? []) {
    const k = `reg:${keyOf(reg)}`;
    model.push({
      key: k,
      name: regCollection(reg.id),
      fields: [
        { key: `${k}:op_collection`, name: 'op_collection', type: 'text', required: false },
        { key: `${k}:op_id`, name: 'op_id', type: 'text', required: false },
        { key: `${k}:period`, name: 'period', type: 'date', required: false },
        ...reg.dimensions.map((d) => ({ key: `${k}:d:${d.id}`, name: dimColumn(d.id), type: 'text' as const, required: false })),
        ...reg.resources.map((r) => ({ key: `${k}:r:${r.id}`, name: resColumn(r.id), type: 'number' as const, required: false })),
      ],
      rules: schema.roles?.length ? readOnlyRules(registerReaders(schema, reg)) : { listRule: '', viewRule: '', createRule: null, updateRule: null, deleteRule: null },
    });
  }
  if (schema.roles?.length) {
    model.push({
      key: STAFF_KEY,
      name: STAFF_COLLECTION,
      auth: true,
      fields: [
        { key: `${STAFF_KEY}:name`, name: 'name', type: 'text', required: false },
        { key: `${STAFF_KEY}:role`, name: 'role', type: 'select', required: true, maxSelect: 1, values: schema.roles.map((r) => r.id) },
      ],
      rules: staffRules(schema),
    });
  }
  return model;
}
