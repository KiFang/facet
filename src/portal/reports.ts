import type { ClubEntity, ClubRegister, EntityField } from '@/types/schema';
import { icon } from './icons';
import { relationsOf, recordTitle, parsePbDate, expandedList } from './model';
import { dimTitle, esc, type RenderCtx } from './render';
import type { MovementsState, WorkspaceCtx } from './workspace';
import type { PortalRecord } from './types';

/* Отчёты рабочего места: оборотно-сальдовая ведомость по регистру и сводка по разделу. */

export interface ReportState {
  tab: 'turnover' | 'summary';
  register?: string;
  /** Период: ГГГГ-ММ-ДД (включительно). */
  from: string;
  to: string;
  entity?: string;
  groupBy?: string;
  sum?: string;
}

export function defaultReportState(now: Date): ReportState {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = now.getMonth();
  // Учебный семестр: с 1 сентября или 1 февраля.
  const from = m >= 8 ? `${y}-09-01` : m >= 1 ? `${y}-02-01` : `${y - 1}-09-01`;
  return { tab: 'turnover', from, to: `${y}-${pad(m + 1)}-${pad(now.getDate())}` };
}

export interface TurnoverRow {
  dims: Record<string, string>;
  open: Record<string, number>;
  income: Record<string, number>;
  outcome: Record<string, number>;
  close: Record<string, number>;
}

/** Оборотно-сальдовая ведомость: остаток на начало, приход, расход, остаток на конец. */
export function turnover(reg: ClubRegister, rows: { dims: Record<string, string>; res: Record<string, number>; period: string }[], from: string, to: string): TurnoverRow[] {
  const start = `${from} 00:00:00.000Z`;
  const end = `${to} 23:59:59.999Z`;
  const map = new Map<string, TurnoverRow>();
  const zero = () => Object.fromEntries(reg.resources.map((r) => [r.id, 0]));
  for (const m of rows) {
    if (m.period > end) continue;
    const key = reg.dimensions.map((d) => m.dims[d.id] ?? '').join('\u0001');
    let row = map.get(key);
    if (!row) {
      row = { dims: { ...m.dims }, open: zero(), income: zero(), outcome: zero(), close: zero() };
      map.set(key, row);
    }
    for (const r of reg.resources) {
      const v = m.res[r.id] ?? 0;
      if (m.period < start) row.open[r.id] += v;
      else if (v >= 0) row.income[r.id] += v;
      else row.outcome[r.id] += -v;
      row.close[r.id] += v;
    }
  }
  return [...map.values()].filter((r) => reg.resources.some((x) => Math.abs(r.open[x.id]) + r.income[x.id] + r.outcome[x.id] > 1e-9));
}

export interface SummaryRow {
  key: string;
  label: string;
  count: number;
  sum: number;
}

/** Значения для группировки: варианты, связи (названия), даты (месяцы), текст. */
function groupKeys(ctx: RenderCtx, entity: ClubEntity, field: string, record: PortalRecord): { key: string; label: string }[] {
  const f = entity.fields.find((x) => x.id === field);
  const rel = relationsOf(ctx.schema, entity).find((r) => r.name === field);
  if (rel) {
    const target = ctx.schema.entities.find((e) => e.id === rel.targetEntityId);
    const linked = expandedList(record, rel.name);
    return linked.length ? linked.map((x) => ({ key: x.id, label: recordTitle(target, x, ctx.t('untitled')) })) : [{ key: '', label: ctx.t('noValue') }];
  }
  const v = record[field];
  if (f?.type === 'date') {
    const d = parsePbDate(v);
    if (!d) return [{ key: '', label: ctx.t('noValue') }];
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return [{ key, label: d.toLocaleDateString(ctx.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }) }];
  }
  const s = v === undefined || v === null || v === '' ? '' : String(v);
  return [{ key: s, label: s || ctx.t('noValue') }];
}

export function summary(ctx: RenderCtx, entity: ClubEntity, records: PortalRecord[], st: ReportState): SummaryRow[] {
  const dateField = entity.fields.find((f) => f.type === 'date');
  const start = `${st.from} 00:00:00.000Z`;
  const end = `${st.to} 23:59:59.999Z`;
  const map = new Map<string, SummaryRow>();
  for (const r of records) {
    const when = String((dateField && r[dateField.id]) || r.created || '');
    if (when && (when < start || when > end)) continue;
    if (entity.kind === 'operation' && !r.posted) continue;
    const keys = st.groupBy ? groupKeys(ctx, entity, st.groupBy, r) : [{ key: '*', label: entity.pluralName }];
    for (const k of keys) {
      const row = map.get(k.key) ?? { key: k.key, label: k.label, count: 0, sum: 0 };
      row.count += 1;
      if (st.sum) row.sum += Number(r[st.sum] ?? 0) || 0;
      map.set(k.key, row);
    }
  }
  const field = entity.fields.find((f) => f.id === st.groupBy);
  const rows = [...map.values()];
  if (field?.type === 'date') return rows.sort((a, b) => a.key.localeCompare(b.key));
  if (field?.options) return rows.sort((a, b) => field.options!.indexOf(a.label) - field.options!.indexOf(b.label));
  return rows.sort((a, b) => b.count - a.count);
}

const num = (ctx: RenderCtx, n: number) => n.toLocaleString(ctx.locale, { maximumFractionDigits: 2 });

function select(name: string, value: string | undefined, options: { value: string; label: string }[], label: string, empty?: string): string {
  return `<label class="fx-report-field"><span class="fx-label">${esc(label)}</span><select class="fx-input" data-report="${name}">${empty !== undefined ? `<option value="">${esc(empty)}</option>` : ''}${options
    .map((o) => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
}

export function renderReports(ctx: RenderCtx, ws: WorkspaceCtx, st: ReportState, movements: Map<string, MovementsState>): string {
  const { t } = ctx;
  const tabs = [
    ws.registers.length ? `<button type="button" role="tab" class="fx-view-btn" data-report-tab="turnover" aria-selected="${st.tab === 'turnover'}">${icon('ArrowRightLeft', 15)}<span>${esc(t('rep.turnover'))}</span></button>` : '',
    `<button type="button" role="tab" class="fx-view-btn" data-report-tab="summary" aria-selected="${st.tab === 'summary' || !ws.registers.length}">${icon('ChartColumn', 15)}<span>${esc(t('rep.summary'))}</span></button>`,
  ].join('');
  const period = `<label class="fx-report-field"><span class="fx-label">${esc(t('rep.from'))}</span><input class="fx-input" type="date" data-report="from" value="${esc(st.from)}"></label>
<label class="fx-report-field"><span class="fx-label">${esc(t('rep.to'))}</span><input class="fx-input" type="date" data-report="to" value="${esc(st.to)}"></label>`;
  let controls = '';
  let body = '';
  const tab = ws.registers.length ? st.tab : 'summary';

  if (tab === 'turnover') {
    const reg = ws.registers.find((r) => r.id === st.register) ?? ws.registers[0];
    controls = select('register', reg.id, ws.registers.map((r) => ({ value: r.id, label: r.name })), t('rep.register')) + period;
    const ms = movements.get(reg.id);
    if (!ms || ms.status === 'loading') body = `<div class="fx-empty fx-loading">${esc(t('loading'))}</div>`;
    else if (ms.status === 'error') body = `<div class="fx-alert">${esc(ms.error)}</div>`;
    else {
      const rows = turnover(reg, ms.rows, st.from, st.to);
      if (!rows.length) body = `<p class="fx-muted">${esc(t('noMovements'))}</p>`;
      else {
        const cols = ['open', 'income', 'outcome', 'close'] as const;
        const head = `<tr>${reg.dimensions.map((d) => `<th rowspan="2">${esc(d.name)}</th>`).join('')}${cols.map((c) => `<th class="fx-num" colspan="${reg.resources.length}">${esc(t(`rep.${c}`))}</th>`).join('')}</tr>
<tr>${cols.map(() => reg.resources.map((r) => `<th class="fx-num">${esc(r.name)}</th>`).join('')).join('')}</tr>`;
        const total = Object.fromEntries(cols.map((c) => [c, Object.fromEntries(reg.resources.map((r) => [r.id, rows.reduce((n, x) => n + x[c][r.id], 0)]))]));
        const cell = (v: number) => `<td class="fx-num${v < -1e-9 ? ' fx-neg' : ''}">${esc(num(ctx, v))}</td>`;
        body = `<div class="fx-table-wrap"><table class="fx-table fx-report-table" data-report-table="turnover"><thead>${head}</thead><tbody>${rows
          .map((r) => `<tr>${reg.dimensions.map((d) => `<td>${esc(dimTitle(ctx, d.target, r.dims[d.id]) || '—')}</td>`).join('')}${cols.map((c) => reg.resources.map((x) => cell(r[c][x.id])).join('')).join('')}</tr>`)
          .join('')}</tbody><tfoot><tr><th colspan="${reg.dimensions.length}">${esc(t('total'))}</th>${cols
          .map((c) => reg.resources.map((x) => `<th class="fx-num">${esc(num(ctx, total[c][x.id]))}</th>`).join('')).join('')}</tr></tfoot></table></div>`;
      }
    }
  } else {
    const entity = ctx.schema.entities.find((e) => e.id === st.entity) ?? ctx.schema.entities[0];
    if (!entity) return `<p class="fx-muted">${esc(t('noEntities'))}</p>`;
    const groupable = [
      ...entity.fields.filter((f: EntityField) => ['select', 'status', 'date', 'text'].includes(f.type)).map((f) => ({ value: f.id, label: f.type === 'date' ? `${f.name} (${t('rep.month')})` : f.name })),
      ...relationsOf(ctx.schema, entity).map((r) => ({ value: r.name, label: r.label })),
    ];
    const numbers = entity.fields.filter((f) => f.type === 'number').map((f) => ({ value: f.id, label: f.name }));
    controls = select('entity', entity.id, ctx.schema.entities.map((e) => ({ value: e.id, label: e.pluralName })), t('rep.section'))
      + select('groupBy', st.groupBy, groupable, t('rep.groupBy'), t('rep.noGroup'))
      + (numbers.length ? select('sum', st.sum, numbers, t('rep.sum'), t('rep.noSum')) : '')
      + period;
    const ds = ctx.data(entity.id);
    if (!ds || ds.status === 'loading') body = `<div class="fx-empty fx-loading">${esc(t('loading'))}</div>`;
    else if (ds.status === 'error') body = `<div class="fx-alert">${esc(ds.error)}</div>`;
    else {
      const rows = summary(ctx, entity, ds.records, { ...st, groupBy: groupable.some((g) => g.value === st.groupBy) ? st.groupBy : undefined, sum: numbers.some((n) => n.value === st.sum) ? st.sum : undefined });
      const sumName = numbers.find((n) => n.value === st.sum)?.label;
      if (!rows.length) body = `<p class="fx-muted">${esc(t('nothingFound'))}</p>`;
      else {
        const max = Math.max(...rows.map((r) => (sumName ? Math.abs(r.sum) : r.count)), 1);
        body = `<div class="fx-table-wrap"><table class="fx-table fx-report-table" data-report-table="summary"><thead><tr><th>${esc(groupable.find((g) => g.value === st.groupBy)?.label ?? entity.pluralName)}</th><th class="fx-num">${esc(t('rep.count'))}</th>${sumName ? `<th class="fx-num">${esc(sumName)}</th>` : ''}<th class="fx-bar-cell"></th></tr></thead><tbody>${rows
          .map((r) => `<tr><td>${esc(r.label)}</td><td class="fx-num">${r.count}</td>${sumName ? `<td class="fx-num">${esc(num(ctx, r.sum))}</td>` : ''}<td class="fx-bar-cell"><span class="fx-hbar" style="width:${Math.round(((sumName ? Math.abs(r.sum) : r.count) / max) * 100)}%"></span></td></tr>`)
          .join('')}</tbody><tfoot><tr><th>${esc(t('total'))}</th><th class="fx-num">${rows.reduce((n, r) => n + r.count, 0)}</th>${sumName ? `<th class="fx-num">${esc(num(ctx, rows.reduce((n, r) => n + r.sum, 0)))}</th>` : ''}<th></th></tr></tfoot></table></div>`;
      }
    }
  }
  return `<div class="fx-toolbar"><h2>${icon('ChartColumn', 20)}${esc(t('rep.title'))}</h2>
<div class="fx-toolbar-actions"><div class="fx-views" role="tablist">${tabs}</div><button type="button" class="fx-btn fx-btn-ghost" data-report-csv>${icon('FileText', 15)}${esc(t('csv'))}</button><button type="button" class="fx-btn fx-btn-ghost" data-print>${icon('Printer', 15)}${esc(t('print'))}</button></div></div>
<div class="fx-panel fx-report-controls">${controls}</div>
${body}`;
}

/** Таблица отчёта в CSV (как она на экране). */
export function tableToCsv(table: HTMLTableElement, locale: string): string {
  const sep = locale === 'ru' ? ';' : ',';
  const cell = (v: string) => (/[";\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [...table.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].filter((c) => !c.classList.contains('fx-bar-cell')).map((c) => cell((c.textContent ?? '').trim())).join(sep));
  return `﻿${rows.join('\r\n')}\r\n`;
}
