import { describe, expect, it } from 'vitest';
import { buildPresetSchema } from '@/data/presets';
import { normalizeSchema } from '@/utils/normalize';
import { portalT } from './i18n';
import { esc, filterRecords, findBacklinks, renderDashboard, renderDetail, renderEntityPage, sortRecords, type RenderCtx } from './render';
import { buildSampleData, sampleSource } from './sources/sample';
import type { PortalRecord } from './types';

const now = new Date(2026, 9, 14, 12, 0);
const schema = normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'easy' });
const { byEntity } = buildSampleData(schema, {}, now);
const ctx: RenderCtx = {
  schema,
  t: portalT('ru'),
  locale: 'ru',
  source: sampleSource(schema, {}, now),
  assets: {},
  data: (id) => ({ status: 'ok', records: byEntity.get(id) ?? [] }),
  now,
};
const events = schema.entities.find((e) => e.id === 'events')!;
const ui = { query: '', view: 'cards' as const, schemaView: 'cards' as const, month: { y: 2026, m: 9 } };

describe('portal render', () => {
  it('экранирует пользовательский текст', () => {
    expect(esc('<img onerror="x">')).toBe('&lt;img onerror=&quot;x&quot;&gt;');
    const evil = { ...ctx, data: () => ({ status: 'ok' as const, records: [{ id: 'x', title: '<script>alert(1)</script>' }] }) };
    expect(renderEntityPage(evil, events, ui)).not.toContain('<script>');
  });

  it('все виды раздела рендерятся', () => {
    for (const view of ['cards', 'table', 'kanban', 'calendar'] as const) {
      const html = renderEntityPage(ctx, events, { ...ui, view });
      expect(html, view).toContain('Осенний кикофф');
    }
    expect(renderEntityPage(ctx, events, { ...ui, view: 'kanban' })).toContain('fx-kanban-col');
    expect(renderEntityPage(ctx, events, { ...ui, view: 'calendar' })).toContain('fx-cal-today');
  });

  it('поиск учитывает связанные записи', () => {
    const records = byEntity.get('events')!;
    const someMember = String((records[0].expand!.members as PortalRecord[])[0].full_name);
    expect(filterRecords(ctx, events, records, someMember.toLowerCase()).length).toBeGreaterThan(0);
    expect(filterRecords(ctx, events, records, 'нет-такого')).toEqual([]);
  });

  it('сортировка по числу и статусу (в порядке вариантов)', () => {
    const records = byEntity.get('events')!;
    const byCap = sortRecords(events, records, { field: 'capacity', dir: 1 }).map((r) => r.capacity as number);
    expect(byCap).toEqual([...byCap].sort((a, b) => a - b));
    const byStatus = sortRecords(events, records, { field: 'status', dir: 1 }).map((r) => r.status);
    expect(byStatus[0]).toBe('Запланировано');
  });

  it('карточка записи показывает обратные ссылки', () => {
    const members = schema.entities.find((e) => e.id === 'members')!;
    const linked = byEntity.get('events')!.find((r) => (r.members as string[]).length)!;
    const memberId = (linked.members as string[])[0];
    const member = byEntity.get('members')!.find((r) => r.id === memberId)!;
    const backlinks = findBacklinks(ctx, members, member)!;
    expect(backlinks.some((b) => b.entity.id === 'events' && b.records.some((r) => r.id === linked.id))).toBe(true);
    expect(renderDetail(ctx, members, memberId)).toContain(String(linked.title));
  });

  it('дашборд: счётчики, ближайшее и статусы', () => {
    const html = renderDashboard(ctx);
    expect(html).toContain('fx-stat-num');
    expect(html).toContain('Ближайшее');
    expect(html).toContain('fx-bar');
  });

  it('английская локаль портала', () => {
    const en = { ...ctx, t: portalT('en'), locale: 'en' as const, data: () => ({ status: 'ok' as const, records: [] }) };
    expect(renderEntityPage(en, events, ui)).toContain('Nothing here yet');
  });
});
