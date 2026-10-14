import { CHAIR_ROLE, type CollectionRules } from '@/utils/access';
import { STAFF_KEY, type PbFieldType, type PhysCollection, type PhysField, type PhysModel } from './physical';

/**
 * Операции миграции. Поля связей ссылаются на целевую коллекцию по ИТОГОВОМУ имени —
 * к моменту их добавления все переименования коллекций уже выполнены.
 */
export interface MigrationField {
  name: string;
  type: PbFieldType;
  required: boolean;
  values?: string[];
  maxSelect?: number;
  /** Только для relation: имя целевой коллекции. */
  target?: string;
}

export type MigrationOp =
  | { op: 'createCollection'; name: string; fields: MigrationField[]; auth?: boolean }
  | { op: 'deleteCollection'; name: string }
  | { op: 'renameCollection'; from: string; to: string }
  | { op: 'addField'; collection: string; field: MigrationField }
  | { op: 'removeField'; collection: string; name: string }
  | { op: 'renameField'; collection: string; from: string; to: string }
  | { op: 'updateField'; collection: string; name: string; patch: Partial<Pick<MigrationField, 'required' | 'values' | 'maxSelect'>> }
  /** Правила доступа API. Ставятся последними: могут ссылаться на поля и коллекцию сотрудников. */
  | { op: 'setRules'; collection: string; rules: CollectionRules }
  /** Первая учётная запись актива (председатель) из PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD. */
  | { op: 'bootstrapStaff'; collection: string; role: string };

export type ChangeSeverity = 'safe' | 'warning' | 'danger';

/** Человекочитаемое изменение для экрана «Что изменится на сервере». */
export interface SchemaChange {
  severity: ChangeSeverity;
  kind:
    | 'collection-added' | 'collection-removed' | 'collection-renamed'
    | 'field-added' | 'field-removed' | 'field-renamed' | 'field-recreated'
    | 'field-required' | 'field-values-removed' | 'field-values-added' | 'relation-narrowed' | 'relation-widened'
    | 'staff-enabled' | 'access-private' | 'access-public' | 'access-changed';
  collection: string;
  field?: string;
  from?: string;
  to?: string;
  values?: string[];
}

export interface SchemaDiff {
  ops: MigrationOp[];
  changes: SchemaChange[];
}

const TMP = '__facet_tmp';

/** Поле нужно пересоздать, если PocketBase не умеет менять его на месте. */
function needsRecreate(a: PhysField, b: PhysField): boolean {
  return a.type !== b.type || (a.type === 'relation' && a.targetKey !== b.targetKey);
}

function toMigrationField(f: PhysField, nameByKey: Map<string, string>): MigrationField {
  const out: MigrationField = { name: f.name, type: f.type, required: f.required };
  if (f.values) out.values = [...f.values];
  if (f.maxSelect !== undefined) out.maxSelect = f.maxSelect;
  if (f.type === 'relation') out.target = nameByKey.get(f.targetKey!)!;
  return out;
}

const sameList = (a?: string[], b?: string[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/**
 * Разница между развёрнутой (`before`) и новой (`after`) физическими моделями.
 * Порядок фаз гарантирует, что каждая операция выполнима в PocketBase:
 *  1. удаление полей-связей  2. удаление прочих полей  3. удаление коллекций
 *  4. переименование коллекций (через временные имена — допускаются перестановки)
 *  5. создание коллекций  6. переименование полей  7. изменение полей
 *  8. добавление полей  9. добавление полей-связей
 */
export function diffPhysical(before: PhysModel, after: PhysModel): SchemaDiff {
  const changes: SchemaChange[] = [];
  const beforeByKey = new Map(before.map((c) => [c.key, c]));
  const afterByKey = new Map(after.map((c) => [c.key, c]));
  const afterNameByKey = new Map(after.map((c) => [c.key, c.name]));

  const removeRel: MigrationOp[] = [];
  const removePlain: MigrationOp[] = [];
  const deleteCols: MigrationOp[] = [];
  const renameColsTmp: MigrationOp[] = [];
  const renameColsFinal: MigrationOp[] = [];
  const createCols: MigrationOp[] = [];
  const renameFieldsTmp: MigrationOp[] = [];
  const renameFieldsFinal: MigrationOp[] = [];
  const updateFields: MigrationOp[] = [];
  const addPlain: MigrationOp[] = [];
  const addRel: MigrationOp[] = [];
  const setRules: MigrationOp[] = [];
  const bootstrap: MigrationOp[] = [];
  const sameRules = (a?: CollectionRules, b?: CollectionRules) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  const queueRemove = (collection: string, f: PhysField) =>
    (f.type === 'relation' ? removeRel : removePlain).push({ op: 'removeField', collection, name: f.name });
  const queueAdd = (collection: string, f: PhysField) =>
    (f.type === 'relation' ? addRel : addPlain).push({ op: 'addField', collection, field: toMigrationField(f, afterNameByKey) });

  // Удалённые коллекции. Связи на них из выживших коллекций удаляются ниже как обычные поля.
  for (const col of before) {
    if (afterByKey.has(col.key)) continue;
    deleteCols.push({ op: 'deleteCollection', name: col.name });
    changes.push({ severity: 'danger', kind: 'collection-removed', collection: col.name });
  }

  // Новые коллекции: сначала без связей, связи — последней фазой.
  for (const col of after) {
    if (beforeByKey.has(col.key)) continue;
    const plain = col.fields.filter((f) => f.type !== 'relation');
    createCols.push({
      op: 'createCollection', name: col.name, fields: plain.map((f) => toMigrationField(f, afterNameByKey)), ...(col.auth ? { auth: true } : {}),
    });
    col.fields.filter((f) => f.type === 'relation').forEach((f) => queueAdd(col.name, f));
    setRules.push({ op: 'setRules', collection: col.name, rules: col.rules });
    if (col.key === STAFF_KEY) bootstrap.push({ op: 'bootstrapStaff', collection: col.name, role: CHAIR_ROLE });
    changes.push(col.key === STAFF_KEY
      ? { severity: 'safe', kind: 'staff-enabled', collection: col.name }
      : { severity: 'safe', kind: 'collection-added', collection: col.name });
  }

  // Общие коллекции.
  for (const next of after) {
    const prev = beforeByKey.get(next.key);
    if (!prev) continue;
    if (prev.name !== next.name) {
      renameColsTmp.push({ op: 'renameCollection', from: prev.name, to: `${next.name}${TMP}` });
      renameColsFinal.push({ op: 'renameCollection', from: `${next.name}${TMP}`, to: next.name });
      changes.push({ severity: 'safe', kind: 'collection-renamed', collection: next.name, from: prev.name, to: next.name });
    }
    diffFields(prev, next);
    if (!sameRules(prev.rules, next.rules)) {
      setRules.push({ op: 'setRules', collection: next.name, rules: next.rules });
      if (next.key === STAFF_KEY) continue;
      const wasPublic = prev.rules?.listRule === '';
      const isPublic = next.rules.listRule === '';
      if (wasPublic && !isPublic) changes.push({ severity: 'warning', kind: 'access-private', collection: next.name });
      else if (!wasPublic && isPublic) changes.push({ severity: 'safe', kind: 'access-public', collection: next.name });
      else changes.push({ severity: 'safe', kind: 'access-changed', collection: next.name });
    }
  }

  function diffFields(prev: PhysCollection, next: PhysCollection) {
    const prevByKey = new Map(prev.fields.map((f) => [f.key, f]));
    const nextByKey = new Map(next.fields.map((f) => [f.key, f]));

    for (const f of prev.fields) {
      if (nextByKey.has(f.key)) continue;
      // Связь на удаляемую коллекцию PocketBase удалит вместе с ней не всегда — удаляем явно.
      queueRemove(prev.name, f);
      changes.push({ severity: 'danger', kind: 'field-removed', collection: next.name, field: f.name });
    }

    for (const f of next.fields) {
      const old = prevByKey.get(f.key);
      if (!old) {
        queueAdd(next.name, f);
        changes.push({ severity: f.required ? 'warning' : 'safe', kind: 'field-added', collection: next.name, field: f.name });
        continue;
      }
      if (needsRecreate(old, f)) {
        queueRemove(prev.name, old);
        queueAdd(next.name, f);
        changes.push({ severity: 'danger', kind: 'field-recreated', collection: next.name, field: f.name, from: old.type, to: f.type });
        continue;
      }
      if (old.name !== f.name) {
        renameFieldsTmp.push({ op: 'renameField', collection: next.name, from: old.name, to: `${f.name}${TMP}` });
        renameFieldsFinal.push({ op: 'renameField', collection: next.name, from: `${f.name}${TMP}`, to: f.name });
        changes.push({ severity: 'safe', kind: 'field-renamed', collection: next.name, field: f.name, from: old.name, to: f.name });
      }
      const patch: Extract<MigrationOp, { op: 'updateField' }>['patch'] = {};
      if (old.required !== f.required) {
        patch.required = f.required;
        if (f.required) changes.push({ severity: 'warning', kind: 'field-required', collection: next.name, field: f.name });
      }
      if (!sameList(old.values, f.values)) {
        patch.values = f.values;
        const removed = (old.values ?? []).filter((v) => !(f.values ?? []).includes(v));
        const added = (f.values ?? []).filter((v) => !(old.values ?? []).includes(v));
        if (removed.length) changes.push({ severity: 'warning', kind: 'field-values-removed', collection: next.name, field: f.name, values: removed });
        if (added.length) changes.push({ severity: 'safe', kind: 'field-values-added', collection: next.name, field: f.name, values: added });
      }
      if (old.maxSelect !== f.maxSelect) {
        patch.maxSelect = f.maxSelect;
        changes.push({
          severity: (f.maxSelect ?? 1) < (old.maxSelect ?? 1) ? 'warning' : 'safe',
          kind: (f.maxSelect ?? 1) < (old.maxSelect ?? 1) ? 'relation-narrowed' : 'relation-widened',
          collection: next.name,
          field: f.name,
        });
      }
      if (Object.keys(patch).length) updateFields.push({ op: 'updateField', collection: next.name, name: f.name, patch });
    }
  }

  return {
    ops: [
      ...removeRel, ...removePlain, ...deleteCols,
      ...renameColsTmp, ...renameColsFinal,
      ...createCols,
      ...renameFieldsTmp, ...renameFieldsFinal,
      ...updateFields, ...addPlain, ...addRel,
      ...setRules, ...bootstrap,
    ],
    changes,
  };
}
