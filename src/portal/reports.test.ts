import { describe, expect, it } from 'vitest';
import { buildPresetSchema } from '@/data/presets';
import { buildAccountingPack } from '@/data/accounting';
import { normalizeSchema } from '@/utils/normalize';
import { withRoles } from '@/utils/access';
import { portalT } from './i18n';
import { turnover, summary, defaultReportState } from './reports';
import { renderTemplate } from './printforms';
import type { RenderCtx } from './render';

const base = withRoles(normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'pro' }));
const pack = buildAccountingPack(base, 'cash');
const schema = { ...base, entities: [...base.entities, ...pack.entities], registers: pack.registers };
const reg = schema.registers![0];
const ctx: RenderCtx = {
  schema, t: portalT('ru'), locale: 'ru', source: { list: async () => [], fileUrl: () => null, editUrl: () => null },
  assets: {}, data: () => undefined, now: new Date('2026-10-14T12:00:00Z'),
  ws: { user: { id: 'u', email: 'k@c', name: 'Катя', role: 'treasurer' }, legacy: false, access: () => 'write', canStaff: false, writable: true, hasPublic: false, registers: [] },
};

describe('reports', () => {
  it('turnover: opening, in, out, closing', () => {
    const mv = (period: string, amount: number) => ({ dims: { article: 'Взносы' }, res: { amount }, period: `${period} 10:00:00.000Z` });
    const rows = turnover(reg, [mv('2026-08-20', 500), mv('2026-09-05', 1000), mv('2026-09-10', -300), mv('2026-11-01', 50)], '2026-09-01', '2026-10-14');
    expect(rows).toEqual([{ dims: { article: 'Взносы' }, open: { amount: 500 }, income: { amount: 1000 }, outcome: { amount: 300 }, close: { amount: 1200 } }]);
  });

  it('summary groups confirmed operations and sums', () => {
    const cash = schema.entities.find((e) => e.id === 'cash_ops')!;
    const rec = (id: string, article: string, amount: number, posted = true) => ({ id, date: '2026-09-10 10:00:00.000Z', type: 'Поступление', article, amount, posted });
    const rows = summary(ctx, cash, [rec('1', 'Взносы', 100), rec('2', 'Взносы', 50), rec('3', 'Спонсоры', 500), rec('4', 'Взносы', 999, false)], { ...defaultReportState(ctx.now), tab: 'summary', groupBy: 'article', sum: 'amount' });
    expect(rows.map((r) => [r.label, r.count, r.sum])).toEqual([['Взносы', 2, 150], ['Спонсоры', 1, 500]]);
  });

  it('semester default period', () => {
    expect(defaultReportState(new Date('2026-10-14T12:00:00Z')).from).toBe('2026-09-01');
    expect(defaultReportState(new Date('2026-03-01T12:00:00Z')).from).toBe('2026-02-01');
  });

  it('print form template fills fields and escapes values', () => {
    const cash = schema.entities.find((e) => e.id === 'cash_ops')!;
    const html = renderTemplate(ctx, cash, { id: 'abcdef123456', title: '<b>Пицца</b>', amount: 1200, article: 'Мероприятия', type: 'Расход' },
      '# {{Вид}} № {{номер}}\n{{клуб}}\n\n| Основание | Сумма |\n| --- | --- |\n| {{Основание}} | {{Сумма}} |\n\nСоставил(а): {{сотрудник}}\n{{нет такого}}');
    expect(html).toContain('<h1><span class="fx-pf-value">Расход</span> № <span class="fx-pf-value">123456</span></h1>');
    expect(html).toContain('&lt;b&gt;Пицца&lt;/b&gt;');
    expect(html).toContain('1');
    expect(html).toContain('Катя');
    expect(html).toContain('<table class="fx-pf-table">');
    expect(html).toContain('{{нет такого}}');
  });
});
