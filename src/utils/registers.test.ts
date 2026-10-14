import { describe, expect, it } from 'vitest';
import { buildPresetSchema } from '@/data/presets';
import { buildAccountingPack } from '@/data/accounting';
import { normalizeSchema } from '@/utils/normalize';
import { withRoles } from '@/utils/access';
import { toPhysical } from '@/utils/migrations/physical';
import { planMigration } from '@/utils/migrations/generate';
import type { ClubSchema } from '@/types/schema';
import { balances, movementsOf, postingProblems, registerHookFiles, regCollection } from './registers';

function withPacks(): ClubSchema {
  let s = withRoles(normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'pro' }));
  for (const pack of ['cash', 'equipment'] as const) {
    const add = buildAccountingPack(s, pack);
    s = { ...s, entities: [...s.entities, ...add.entities], registers: [...(s.registers ?? []), ...add.registers] };
  }
  return s;
}

describe('registers', () => {
  const schema = withPacks();
  const cashOps = schema.entities.find((e) => e.id === 'cash_ops')!;
  const issues = schema.entities.find((e) => e.id === 'issues')!;

  it('packs reuse existing sections and validate', () => {
    expect(schema.registers!.map((r) => r.id)).toEqual(['cash', 'on_hand']);
    expect(issues.fields.find((f) => f.id === 'item')!.targetEntityId).toBe('inventory');
    expect(issues.fields.find((f) => f.id === 'holder')!.targetEntityId).toBe('members');
    expect(postingProblems(schema)).toEqual([]);
  });

  it('computes signed movements only for confirmed operations', () => {
    const income = { title: 'Взносы', date: '2026-09-01 00:00:00.000Z', type: 'Поступление', amount: 1000, article: 'Взносы', posted: true };
    const expense = { ...income, type: 'Расход', amount: 300, article: 'Закупки' };
    expect(movementsOf(schema, cashOps, income)).toEqual([{ register: 'cash', dims: { article: 'Взносы' }, res: { amount: 1000 }, period: '2026-09-01 00:00:00.000Z' }]);
    expect(movementsOf(schema, cashOps, expense)[0].res.amount).toBe(-300);
    expect(movementsOf(schema, cashOps, { ...income, posted: false })).toEqual([]);
    const rows = balances(schema.registers![0], [...movementsOf(schema, cashOps, income), ...movementsOf(schema, cashOps, expense)]);
    expect(rows).toEqual([{ dims: { article: 'Взносы' }, res: { amount: 1000 } }, { dims: { article: 'Закупки' }, res: { amount: -300 } }]);
  });

  it('hides zero balances and respects the period', () => {
    const reg = schema.registers![1];
    const give = movementsOf(schema, issues, { date: '2026-09-01 10:00:00.000Z', type: 'Выдача', item: 'i1', holder: 'm1', qty: 2, posted: true });
    const back = movementsOf(schema, issues, { date: '2026-09-05 10:00:00.000Z', type: 'Возврат', item: 'i1', holder: 'm1', qty: 2, posted: true });
    expect(balances(reg, [...give, ...back])).toEqual([]);
    expect(balances(reg, [...give, ...back], '2026-09-03 00:00:00.000Z')).toEqual([{ dims: { item: 'i1', holder: 'm1' }, res: { qty: 2 } }]);
  });

  it('adds posted flags, register collections and hooks to the export', () => {
    const phys = toPhysical(schema);
    expect(phys.find((c) => c.name === 'cash_ops')!.fields.some((f) => f.name === 'posted' && f.type === 'bool')).toBe(true);
    const reg = phys.find((c) => c.name === regCollection('cash'))!;
    expect(reg.fields.map((f) => f.name)).toEqual(['op_collection', 'op_id', 'period', 'd_article', 'r_amount']);
    expect(reg.rules.createRule).toBeNull();
    const ops = planMigration(null, schema).ops.map((o) => o.op);
    expect(ops.filter((o) => o === 'createCollection').length).toBe(schema.entities.length + 3);
    const hooks = registerHookFiles(schema);
    expect(hooks.map((h) => h.path)).toEqual(['pocketbase/pb_hooks/facet-registers.lib.js', 'pocketbase/pb_hooks/facet-registers.pb.js']);
    expect(hooks[1].content).toContain('"cash_ops", "issues"');
    expect(hooks[0].content).not.toContain('__FACET_REGISTERS__');
  });

  it('reports broken posting rules', () => {
    const broken = { ...schema, entities: schema.entities.map((e) => (e.id === 'cash_ops' ? { ...e, fields: e.fields.filter((f) => f.id !== 'amount') } : e)) };
    expect(postingProblems(broken).join()).toMatch(/Сумма/);
  });
});

describe('create based on', () => {
  it('links the source and applies rule values', async () => {
    const { basisActions, basisValues } = await import('@/portal/basis');
    const schema = withPacks();
    const members = schema.entities.find((e) => e.id === 'members')!;
    const issues = schema.entities.find((e) => e.id === 'issues')!;
    const fromMember = basisActions(schema, members, () => true).map((a) => a.target.id);
    expect(fromMember).toContain('issues');
    expect(basisValues(schema, members, { id: 'm1' }, issues, null)).toMatchObject({ holder: 'm1', posted: true });
    const issue = { id: 'i9', date: '2026-09-01 10:00:00.000Z', type: 'Выдача', item: 'x', holder: 'm1', qty: 2, posted: true };
    const actions = basisActions(schema, issues, () => true);
    expect(actions[0]).toMatchObject({ label: 'Оформить возврат', rule: 0 });
    expect(basisValues(schema, issues, issue, issues, 0)).toMatchObject({ type: 'Возврат', item: 'x', holder: 'm1', qty: 2, date: issue.date });
  });
});
