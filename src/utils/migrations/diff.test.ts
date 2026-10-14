import { describe, expect, it } from 'vitest';
import { buildPresetSchema } from '@/data/presets';
import { normalizeSchema } from '@/utils/normalize';
import type { ClubSchema } from '@/types/schema';
import { planMigration } from './generate';
import { parseDateValue, parseNumberValue } from './seeds';

const base = (): ClubSchema => normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'pro' });
const edit = (fn: (s: ClubSchema) => void): ClubSchema => {
  const s = base();
  fn(s);
  return normalizeSchema(s);
};
const entity = (s: ClubSchema, id: string) => s.entities.find((e) => e.id === id)!;

describe('planMigration', () => {
  it('с нуля: сначала коллекции, связи — последними', () => {
    const { ops } = planMigration(null, base());
    const firstRelation = ops.findIndex((o) => o.op === 'addField' && o.field.type === 'relation');
    const lastCreate = ops.map((o) => o.op).lastIndexOf('createCollection');
    expect(lastCreate).toBeLessThan(firstRelation);
    expect(ops.filter((o) => o.op === 'createCollection')).toHaveLength(3);
  });

  it('без изменений — пусто', () => {
    expect(planMigration(base(), base()).ops).toEqual([]);
  });

  it('переименование поля с uid — rename, а не удаление', () => {
    const next = edit((s) => {
      const f = entity(s, 'members').fields.find((x) => x.id === 'full_name')!;
      f.uid = 'full_name';
      f.id = 'name';
    });
    const { ops, changes } = planMigration(base(), next);
    expect(ops.some((o) => o.op === 'removeField')).toBe(false);
    expect(ops.filter((o) => o.op === 'renameField')).toEqual([
      { op: 'renameField', collection: 'members', from: 'full_name', to: 'name__facet_tmp' },
      { op: 'renameField', collection: 'members', from: 'name__facet_tmp', to: 'name' },
    ]);
    expect(changes).toEqual([expect.objectContaining({ kind: 'field-renamed', severity: 'safe', from: 'full_name', to: 'name' })]);
  });

  it('перестановка имён двух полей проходит через временные имена', () => {
    const next = edit((s) => {
      const m = entity(s, 'members');
      const role = m.fields.find((f) => f.id === 'role')!;
      const tg = m.fields.find((f) => f.id === 'telegram')!;
      Object.assign(role, { uid: 'role', id: 'telegram' });
      Object.assign(tg, { uid: 'telegram', id: 'role' });
    });
    const renames = planMigration(base(), next).ops.filter((o) => o.op === 'renameField');
    expect(renames.map((o) => (o.op === 'renameField' ? `${o.from}>${o.to}` : ''))).toEqual([
      'role>telegram__facet_tmp', 'telegram>role__facet_tmp', 'telegram__facet_tmp>telegram', 'role__facet_tmp>role',
    ]);
  });

  it('смена типа — пересоздание (опасно)', () => {
    const next = edit((s) => {
      entity(s, 'members').fields.find((f) => f.id === 'joined_at')!.type = 'text';
    });
    const { ops, changes } = planMigration(base(), next);
    expect(ops).toEqual(expect.arrayContaining([
      { op: 'removeField', collection: 'members', name: 'joined_at' },
      { op: 'addField', collection: 'members', field: { name: 'joined_at', type: 'text', required: false } },
    ]));
    expect(changes[0]).toMatchObject({ kind: 'field-recreated', severity: 'danger' });
  });

  it('переименование коллекции сохраняет связи на неё', () => {
    const next = edit((s) => {
      const m = entity(s, 'members');
      m.uid = 'members';
      m.id = 'people';
      for (const e of s.entities) {
        e.relations.forEach((r) => r.targetEntityId === 'members' && (r.targetEntityId = 'people'));
        e.fields.forEach((f) => f.targetEntityId === 'members' && (f.targetEntityId = 'people'));
      }
    });
    const { ops, changes } = planMigration(base(), next);
    // Связь уровня раздела называется по цели — её колонка тоже переименовывается, данные остаются.
    expect(changes.map((c) => `${c.kind}:${c.collection}:${c.to}`).sort()).toEqual([
      'collection-renamed:people:people',
      'field-renamed:events:people',
    ]);
    expect(ops.every((o) => o.op === 'renameCollection' || o.op === 'renameField')).toBe(true);
  });

  it('удаление раздела: связи на него удаляются раньше коллекции', () => {
    const next = edit((s) => {
      s.entities = s.entities.filter((e) => e.id !== 'members');
      for (const e of s.entities) {
        e.relations = e.relations.filter((r) => r.targetEntityId !== 'members');
        e.fields = e.fields.filter((f) => f.targetEntityId !== 'members');
      }
    });
    const { ops } = planMigration(base(), next);
    const del = ops.findIndex((o) => o.op === 'deleteCollection');
    const relRemovals = ops.map((o, i) => (o.op === 'removeField' ? i : -1)).filter((i) => i >= 0);
    expect(relRemovals.length).toBe(2);
    expect(relRemovals.every((i) => i < del)).toBe(true);
  });

  it('варианты выбора и обязательность — изменения на месте с предупреждениями', () => {
    const next = edit((s) => {
      const st = entity(s, 'events').fields.find((f) => f.id === 'status')!;
      st.options = ['Запланировано', 'Перенесено'];
      entity(s, 'events').fields.find((f) => f.id === 'location')!.required = true;
    });
    const { ops, changes } = planMigration(base(), next);
    expect(ops.filter((o) => o.op === 'updateField')).toHaveLength(2);
    expect(changes.map((c) => `${c.kind}:${c.severity}`).sort()).toEqual([
      'field-required:warning', 'field-values-added:safe', 'field-values-removed:warning',
    ]);
  });

  it('связь «много» → «одна» — сужение с предупреждением', () => {
    const next = edit((s) => {
      entity(s, 'events').relations[0].type = 'one-to-many';
    });
    const { ops, changes } = planMigration(base(), next);
    expect(ops).toEqual([{ op: 'updateField', collection: 'events', name: 'members', patch: { maxSelect: 1 } }]);
    expect(changes[0]).toMatchObject({ kind: 'relation-narrowed', severity: 'warning' });
  });
});

describe('seed values', () => {
  it('даты и числа', () => {
    expect(parseDateValue('14.10.2026')).toBe('2026-10-14 00:00:00.000Z');
    expect(parseDateValue('1/2/2026 9:05')).toBe('2026-02-01 09:05:00.000Z');
    expect(parseDateValue('2026-10-14T18:30')).toBe('2026-10-14 18:30:00.000Z');
    expect(parseDateValue('32.01.2026')).toBeNull();
    expect(parseNumberValue('1 234,5')).toBe(1234.5);
    expect(parseNumberValue('12abc')).toBeNull();
  });
});
