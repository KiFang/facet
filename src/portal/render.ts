import type { ClubEntity, ClubSchema, EntityField, Locale, ViewType } from '@/types/schema';
import type { ResolvedRelation } from '@/utils/relations';
import { icon } from './icons';
import type { PortalT } from './i18n';
import { recordsLabel } from './i18n';
import {
  availableViews, dateFieldOf, expandedList, fileNames, groupFieldOf, isImage, parsePbDate,
  portalFeatureSet, recordTitle, relationsOf, statusFieldOf, titleFieldOf,
} from './model';
import type { DataSource, PortalAssets, PortalRecord } from './types';
import { renderUserBar, type WorkspaceCtx } from './workspace';

/* Чистые функции: состояние → HTML-строка. Никакого DOM — легко тестировать и встраивать в превью. */

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; records: PortalRecord[] };

export interface RenderCtx {
  schema: ClubSchema;
  t: PortalT;
  locale: Locale;
  source: DataSource;
  assets: PortalAssets;
  data: (entityId: string) => LoadState | undefined;
  now: Date;
  /** Рабочее место: пользователь и права. Нет — режим просмотра (тесты, старые схемы). */
  ws?: WorkspaceCtx;
}

/** Может ли текущий пользователь менять раздел прямо в портале. */
export function canWrite(ctx: RenderCtx, entity: ClubEntity): boolean {
  return !!ctx.ws && !ctx.ws.legacy && ctx.ws.writable && ctx.ws.access(entity) === 'write';
}

export interface EntityUiState {
  query: string;
  view: ViewType;
  /** Вид из схемы, от которого получено `view`: при смене в редакторе переключаемся на новый. */
  schemaView: ViewType;
  sort?: { field: string; dir: 1 | -1 };
  /** Год и месяц (0–11) для календаря. */
  month: { y: number; m: number };
}

const navAttr = (path: string) => `data-nav="${esc(path)}" href="#${esc(path)}"`;
const recordPath = (entity: ClubEntity, record: PortalRecord) => `/${entity.id}/${record.id}`;

/* --------------------------------- values ---------------------------------- */

export function formatDate(locale: Locale, d: Date, withTime = true): string {
  const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
  return d.toLocaleString(locale, {
    day: 'numeric', month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    ...(withTime && hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** Номер тона (0–5) для значения варианта — один и тот же вариант всегда одного цвета. */
export function toneOf(field: EntityField | undefined, value: string): number {
  const idx = field?.options?.indexOf(value) ?? -1;
  if (idx >= 0) return idx % 6;
  let h = 0;
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}

export function badge(field: EntityField | undefined, value: string): string {
  return `<span class="fx-badge fx-tone-${toneOf(field, value)}">${esc(value)}</span>`;
}

function relationChips(ctx: RenderCtx, record: PortalRecord, rel: ResolvedRelation): string {
  const target = ctx.schema.entities.find((e) => e.id === rel.targetEntityId);
  const items = expandedList(record, rel.name);
  if (!target || !items.length) return '';
  return items
    .map((x) => `<a class="fx-chip" ${navAttr(recordPath(target, x))}>${esc(recordTitle(target, x, ctx.t('untitled')))}</a>`)
    .join('');
}

/** HTML значения поля или '' если пусто. */
export function fieldValue(ctx: RenderCtx, entity: ClubEntity, field: EntityField, record: PortalRecord): string {
  if (field.type === 'relation') {
    const rel = relationsOf(ctx.schema, entity).find((r) => r.name === field.id);
    return rel ? relationChips(ctx, record, rel) : '';
  }
  const value = record[field.id];
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return '';
  switch (field.type) {
    case 'date': {
      const d = parsePbDate(value);
      return d ? `<time data-date="${d.toISOString()}">${esc(formatDate(ctx.locale, d))}</time>` : esc(value);
    }
    case 'number':
      return esc(Number(value).toLocaleString(ctx.locale));
    case 'select':
    case 'status':
      return badge(field, String(value));
    case 'file':
      return fileNames(value)
        .map((name) => {
          const url = ctx.source.fileUrl(entity, record, name);
          return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
        })
        .join(', ');
    default:
      return esc(value);
  }
}

function coverUrl(ctx: RenderCtx, entity: ClubEntity, record: PortalRecord): string | null {
  for (const f of entity.fields) {
    if (f.type !== 'file') continue;
    const img = fileNames(record[f.id]).find(isImage);
    if (img) return ctx.source.fileUrl(entity, record, img, '480x270');
  }
  return null;
}

/* ---------------------------------- shell ---------------------------------- */

export function renderShell(ctx: RenderCtx, active: string, body: string): string {
  const { schema, t } = ctx;
  const dashboard = schema.dashboard?.enabled !== false;
  const logo = ctx.assets.logoUrl ? `<img class="fx-logo" src="${esc(ctx.assets.logoUrl)}" alt="">` : '';
  const legacy = !ctx.ws || ctx.ws.legacy;
  const admin = legacy && schema.entities[0] ? ctx.source.editUrl(schema.entities[0]) : null;
  const staffTab = ctx.ws?.canStaff
    ? `<a class="fx-tab" ${navAttr('/staff')}${active === '/staff' ? ' aria-current="page"' : ''}>${icon('Users', 15)}${esc(t('staff'))}</a>`
    : '';
  const tabs = [
    dashboard ? `<a class="fx-tab" ${navAttr('/')}${active === '' ? ' aria-current="page"' : ''}>${icon('House', 15)}${esc(t('home'))}</a>` : '',
    ...schema.entities.map((e) => {
      const state = ctx.data(e.id);
      const count = state?.status === 'ok' ? `<span class="fx-count">${state.records.length}</span>` : '';
      return `<a class="fx-tab" ${navAttr(`/${e.id}`)}${active === e.id ? ' aria-current="page"' : ''}>${icon(e.icon, 15)}${esc(e.pluralName)}${count}</a>`;
    }),
    staffTab,
  ].join('');

  return `<div class="fx-shell">
<header class="fx-hero">
  <div class="fx-brand">${logo}<div><h1>${esc(schema.clubName)}</h1>${schema.motto ? `<p>${esc(schema.motto)}</p>` : ''}</div></div>
  <div class="fx-hero-actions">
    <button type="button" class="fx-btn fx-btn-ghost" data-refresh title="${esc(t('refresh'))}" aria-label="${esc(t('refresh'))}">${icon('RefreshCw', 15)}</button>
    ${admin ? `<a class="fx-btn fx-btn-accent" href="${esc(admin.replace(/\?.*$/, ''))}" target="_blank" rel="noopener">${icon('ExternalLink', 15)}${esc(t('admin'))}</a>` : ''}
    ${ctx.ws ? renderUserBar(ctx, ctx.ws) : ''}
  </div>
</header>
<nav class="fx-nav">${tabs}</nav>
<main class="fx-main">${body}</main>
<footer class="fx-footer">${esc(t('footer'))}</footer>
</div>`;
}

export function renderEmpty(title: string, text = '', action = ''): string {
  return `<div class="fx-empty"><strong>${esc(title)}</strong>${esc(text)}${action ? `<div class="fx-empty-action">${action}</div>` : ''}</div>`;
}

function renderLoadState(ctx: RenderCtx, state: LoadState | undefined): string | null {
  if (!state || state.status === 'loading') return `<div class="fx-empty fx-loading">${esc(ctx.t('loading'))}</div>`;
  if (state.status === 'error') return renderEmpty(ctx.t('loadError'), `${state.error}. ${ctx.t('loadErrorHint')}`);
  return null;
}

/* --------------------------------- entity ---------------------------------- */

export function filterRecords(ctx: RenderCtx, entity: ClubEntity, records: PortalRecord[], query: string): PortalRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return records;
  const rels = relationsOf(ctx.schema, entity);
  return records.filter((r) => {
    const parts: string[] = [];
    for (const f of entity.fields) {
      const v = r[f.id];
      if (f.type !== 'relation' && v !== undefined && v !== null) parts.push(Array.isArray(v) ? v.join(' ') : String(v));
    }
    for (const rel of rels) {
      const target = ctx.schema.entities.find((e) => e.id === rel.targetEntityId);
      for (const x of expandedList(r, rel.name)) parts.push(recordTitle(target, x, ''));
    }
    return parts.join(' ').toLowerCase().includes(q);
  });
}

const VIEW_ICONS: Record<ViewType, string> = { cards: 'LayoutGrid', table: 'Table', kanban: 'Columns3', calendar: 'CalendarDays' };

export function renderEntityPage(ctx: RenderCtx, entity: ClubEntity, ui: EntityUiState): string {
  const { t } = ctx;
  const views = availableViews(entity);
  const switcher = views.length > 1
    ? `<div class="fx-views" role="tablist">${views
        .map((v) => `<button type="button" role="tab" class="fx-view-btn" data-view="${v}" aria-selected="${v === ui.view}" title="${esc(t(`view.${v}`))}">${icon(VIEW_ICONS[v], 15)}<span>${esc(t(`view.${v}`))}</span></button>`)
        .join('')}</div>`
    : '';
  const features = portalFeatureSet(ctx.schema);
  const tools = [
    features.has('csv') ? `<button type="button" class="fx-btn fx-btn-ghost" data-csv title="${esc(t('csvTitle'))}">${icon('FileText', 15)}${esc(t('csv'))}</button>` : '',
    features.has('print') ? `<button type="button" class="fx-btn fx-btn-ghost" data-print>${icon('Ticket', 15)}${esc(t('print'))}</button>` : '',
  ].join('');
  const writable = canWrite(ctx, entity);
  const addBtn = writable ? `<a class="fx-btn fx-btn-accent" data-testid="fx-add" ${navAttr(`/${entity.id}/new`)}>${icon('Plus', 15)}${esc(t('add'))}</a>` : '';
  const head = `<div class="fx-toolbar">
  <h2>${icon(entity.icon, 20)}${esc(entity.pluralName)}</h2>
  <div class="fx-toolbar-actions">${addBtn}${tools}${switcher}<label class="fx-search-wrap">${icon('Search', 15)}<input class="fx-search" type="search" data-search placeholder="${esc(t('search'))}" value="${esc(ui.query)}" aria-label="${esc(t('search'))}"></label></div>
</div><hr class="fx-divider">`;

  const loading = renderLoadState(ctx, ctx.data(entity.id));
  if (loading) return head + loading;
  const all = (ctx.data(entity.id) as Extract<LoadState, { status: 'ok' }>).records;

  if (!all.length) {
    if (writable) {
      return head + renderEmpty(t('empty'), t('addFirstHere', { name: entity.name }), `<a class="fx-btn fx-btn-accent" ${navAttr(`/${entity.id}/new`)}>${icon('Plus', 15)}${esc(t('add'))}</a>`);
    }
    const url = !ctx.ws || ctx.ws.legacy ? ctx.source.editUrl(entity) : null;
    const action = url ? `<a class="fx-btn" href="${esc(url)}" target="_blank" rel="noopener">${icon('ExternalLink', 15)}${esc(t('openCollection'))}</a>` : '';
    return head + renderEmpty(t('empty'), url ? t('addFirst', { name: entity.name }) : '', action);
  }
  const records = filterRecords(ctx, entity, all, ui.query);
  if (!records.length) return head + renderEmpty(t('nothingFound'), t('tryAnother'));

  switch (ui.view) {
    case 'table':
      return head + renderTable(ctx, entity, records, ui);
    case 'kanban':
      return head + renderKanban(ctx, entity, records);
    case 'calendar':
      return head + renderCalendar(ctx, entity, records, ui);
    default:
      return head + renderCards(ctx, entity, records);
  }
}

/* ---------------------------------- cards ---------------------------------- */

function renderCard(ctx: RenderCtx, entity: ClubEntity, record: PortalRecord, compact = false): string {
  const tf = titleFieldOf(entity);
  const status = statusFieldOf(entity);
  const cover = compact ? null : coverUrl(ctx, entity, record);
  const rows = entity.fields
    .filter((f) => f !== tf && f !== status && f.type !== 'file')
    .slice(0, compact ? 3 : 8)
    .map((f) => {
      const v = fieldValue(ctx, entity, f, record);
      return v ? `<div class="fx-row"><dt>${esc(f.name)}</dt><dd>${v}</dd></div>` : '';
    })
    .join('');
  const entityRelations = relationsOf(ctx.schema, entity).filter((r) => !entity.fields.some((f) => f.id === r.name));
  const relRows = compact
    ? ''
    : entityRelations
        .map((r) => {
          const chips = relationChips(ctx, record, r);
          return chips ? `<div class="fx-row"><dt>${esc(r.label)}</dt><dd>${chips}</dd></div>` : '';
        })
        .join('');
  const statusValue = status && record[status.id] ? badge(status, String(record[status.id])) : '';
  return `<article class="fx-card${compact ? ' fx-card-compact' : ''}" data-nav="${esc(recordPath(entity, record))}" tabindex="0" role="link">
${cover ? `<div class="fx-card-media" style="background-image:url('${esc(cover)}')"></div>` : ''}
<div class="fx-card-head"><h3>${esc(recordTitle(entity, record, ctx.t('untitled')))}</h3>${statusValue}</div>
${rows || relRows ? `<hr class="fx-divider"><dl class="fx-rows">${rows}${relRows}</dl>` : ''}
</article>`;
}

function renderCards(ctx: RenderCtx, entity: ClubEntity, records: PortalRecord[]): string {
  return `<section class="fx-grid">${records.map((r) => renderCard(ctx, entity, r)).join('')}</section>`;
}

/* ---------------------------------- table ---------------------------------- */

function sortValue(field: EntityField, record: PortalRecord): string | number {
  const v = record[field.id];
  if (field.type === 'number') return typeof v === 'number' ? v : Number(v ?? Number.NEGATIVE_INFINITY);
  if (field.type === 'date') return parsePbDate(v)?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (field.type === 'status' || field.type === 'select') {
    const idx = field.options?.indexOf(String(v ?? '')) ?? -1;
    return idx === -1 ? 999 : idx;
  }
  return String(Array.isArray(v) ? v.join(',') : (v ?? '')).toLowerCase();
}

export function sortRecords(entity: ClubEntity, records: PortalRecord[], sort?: EntityUiState['sort']): PortalRecord[] {
  const field = sort && entity.fields.find((f) => f.id === sort.field);
  if (!field || field.type === 'relation' || field.type === 'file') return records;
  return [...records].sort((a, b) => {
    const x = sortValue(field, a);
    const y = sortValue(field, b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort!.dir;
  });
}

function renderTable(ctx: RenderCtx, entity: ClubEntity, records: PortalRecord[], ui: EntityUiState): string {
  const tf = titleFieldOf(entity);
  const extraRelations = relationsOf(ctx.schema, entity).filter((r) => !entity.fields.some((f) => f.id === r.name));
  const sorted = sortRecords(entity, records, ui.sort);
  const th = entity.fields
    .map((f) => {
      const sortable = f.type !== 'relation' && f.type !== 'file';
      const dir = ui.sort?.field === f.id ? (ui.sort.dir === 1 ? ' ▲' : ' ▼') : '';
      return `<th scope="col">${sortable ? `<button type="button" data-sort="${esc(f.id)}" title="${esc(ctx.t('sortBy', { name: f.name }))}">${esc(f.name)}${dir}</button>` : esc(f.name)}</th>`;
    })
    .concat(extraRelations.map((r) => `<th scope="col">${esc(r.label)}</th>`))
    .join('');
  const rows = sorted
    .map((r) => {
      const cells = entity.fields
        .map((f) => {
          const v = fieldValue(ctx, entity, f, r);
          if (f === tf) return `<td class="fx-td-title"><a ${navAttr(recordPath(entity, r))}>${esc(recordTitle(entity, r, ctx.t('untitled')))}</a></td>`;
          return `<td>${v || '<span class="fx-muted">—</span>'}</td>`;
        })
        .concat(extraRelations.map((rel) => `<td>${relationChips(ctx, r, rel) || '<span class="fx-muted">—</span>'}</td>`))
        .join('');
      return `<tr data-nav="${esc(recordPath(entity, r))}">${cells}</tr>`;
    })
    .join('');
  return `<div class="fx-table-wrap"><table class="fx-table"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>
<p class="fx-muted fx-table-foot">${esc(recordsLabel(ctx.locale, records.length))}</p>`;
}

/* --------------------------------- kanban ---------------------------------- */

function renderKanban(ctx: RenderCtx, entity: ClubEntity, records: PortalRecord[]): string {
  const field = groupFieldOf(entity)!;
  const columns = [...(field.options ?? [])];
  const groups = new Map<string, PortalRecord[]>(columns.map((c) => [c, []]));
  const noValue: PortalRecord[] = [];
  for (const r of records) {
    const v = String(r[field.id] ?? '');
    if (groups.has(v)) groups.get(v)!.push(r);
    else noValue.push(r);
  }
  const column = (title: string, items: PortalRecord[], tone: number | null) =>
    `<section class="fx-kanban-col">
<header><span class="fx-dot${tone === null ? '' : ` fx-tone-${tone}`}"></span><h3>${esc(title)}</h3><span class="fx-count">${items.length}</span></header>
<div class="fx-kanban-list">${items.map((r) => renderCard(ctx, entity, r, true)).join('')}</div>
</section>`;
  return `<div class="fx-kanban">${columns.map((c) => column(c, groups.get(c)!, toneOf(field, c))).join('')}${
    noValue.length ? column(ctx.t('noValue'), noValue, null) : ''
  }</div>`;
}

/* -------------------------------- calendar --------------------------------- */

function renderCalendar(ctx: RenderCtx, entity: ClubEntity, records: PortalRecord[], ui: EntityUiState): string {
  const field = dateFieldOf(entity)!;
  const { y, m } = ui.month;
  const mondayFirst = ctx.locale === 'ru';
  const first = new Date(y, m, 1);
  const offset = mondayFirst ? (first.getDay() + 6) % 7 : first.getDay();
  const start = new Date(y, m, 1 - offset);
  const daysInGrid = Math.ceil((offset + new Date(y, m + 1, 0).getDate()) / 7) * 7;
  const byDay = new Map<string, PortalRecord[]>();
  let undated = 0;
  for (const r of records) {
    const d = parsePbDate(r[field.id]);
    if (!d) {
      undated++;
      continue;
    }
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  const todayKey = `${ctx.now.getFullYear()}-${ctx.now.getMonth()}-${ctx.now.getDate()}`;
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, (mondayFirst ? 1 : 7) + i).toLocaleDateString(ctx.locale, { weekday: 'short' }),
  );
  const status = statusFieldOf(entity);
  const cells = Array.from({ length: daysInGrid }, (_, i) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    const items = byDay.get(key) ?? [];
    const shown = items.slice(0, 3).map((r) => {
      const tone = status && r[status.id] ? ` fx-tone-${toneOf(status, String(r[status.id]))}` : ' fx-tone-0';
      return `<a class="fx-cal-item${tone}" ${navAttr(recordPath(entity, r))}>${esc(recordTitle(entity, r, ctx.t('untitled')))}</a>`;
    });
    if (items.length > 3) shown.push(`<span class="fx-muted fx-cal-more">${esc(ctx.t('more', { n: items.length - 3 }))}</span>`);
    const cls = ['fx-cal-day', day.getMonth() !== m ? 'fx-cal-out' : '', key === todayKey ? 'fx-cal-today' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}"><span class="fx-cal-num">${day.getDate()}</span>${shown.join('')}</div>`;
  }).join('');
  const title = first.toLocaleDateString(ctx.locale, { month: 'long', year: 'numeric' });
  return `<div class="fx-cal">
<div class="fx-cal-head">
  <h3>${esc(title)}</h3>
  <div class="fx-cal-nav">
    <button type="button" class="fx-btn fx-btn-ghost" data-month="-1" aria-label="‹">${icon('ChevronLeft', 16)}</button>
    <button type="button" class="fx-btn fx-btn-ghost" data-month="0">${esc(ctx.t('today'))}</button>
    <button type="button" class="fx-btn fx-btn-ghost" data-month="1" aria-label="›">${icon('ChevronRight', 16)}</button>
  </div>
</div>
<div class="fx-cal-grid">${weekdays.map((w) => `<div class="fx-cal-wd">${esc(w)}</div>`).join('')}${cells}</div>
${undated ? `<p class="fx-muted">${esc(ctx.t('noDate', { n: undated }))}</p>` : ''}
</div>`;
}

/* --------------------------------- detail ---------------------------------- */

export interface Backlink {
  entity: ClubEntity;
  label: string;
  records: PortalRecord[];
}

/** Записи других разделов, которые ссылаются на данную запись («связанные документы» в духе 1С). */
export function findBacklinks(ctx: RenderCtx, target: ClubEntity, record: PortalRecord): Backlink[] | null {
  const out: Backlink[] = [];
  for (const e of ctx.schema.entities) {
    for (const rel of relationsOf(ctx.schema, e)) {
      if (rel.targetEntityId !== target.id) continue;
      const state = ctx.data(e.id);
      if (!state || state.status === 'loading') return null;
      if (state.status === 'error') continue;
      const records = state.records.filter((r) => {
        const v = r[rel.name];
        return Array.isArray(v) ? v.includes(record.id) : v === record.id;
      });
      if (records.length) out.push({ entity: e, label: e.id === target.id ? rel.label : `${e.pluralName} · ${rel.label}`, records });
    }
  }
  return out;
}

export function renderDetail(ctx: RenderCtx, entity: ClubEntity, recordId: string): string {
  const { t } = ctx;
  const back = `<a class="fx-back" ${navAttr(`/${entity.id}`)}>${icon('ArrowLeft', 15)}${esc(entity.pluralName)}</a>`;
  const loading = renderLoadState(ctx, ctx.data(entity.id));
  if (loading) return back + loading;
  const record = (ctx.data(entity.id) as Extract<LoadState, { status: 'ok' }>).records.find((r) => r.id === recordId);
  if (!record) return back + renderEmpty(t('recordNotFound'), t('recordNotFoundHint'));

  const status = statusFieldOf(entity);
  const editUrl = !ctx.ws || ctx.ws.legacy ? ctx.source.editUrl(entity, record) : null;
  const writable = canWrite(ctx, entity);
  const images = entity.fields
    .filter((f) => f.type === 'file')
    .flatMap((f) => fileNames(record[f.id]).filter(isImage))
    .map((name) => ctx.source.fileUrl(entity, record, name))
    .filter((u): u is string => !!u);
  const tf = titleFieldOf(entity);
  const rows = entity.fields
    .filter((f) => f !== tf)
    .map((f) => `<div class="fx-row"><dt>${esc(f.name)}</dt><dd>${fieldValue(ctx, entity, f, record) || '<span class="fx-muted">—</span>'}</dd></div>`)
    .join('');
  const relRows = relationsOf(ctx.schema, entity)
    .filter((r) => !entity.fields.some((f) => f.id === r.name))
    .map((r) => `<div class="fx-row"><dt>${esc(r.label)}</dt><dd>${relationChips(ctx, record, r) || '<span class="fx-muted">—</span>'}</dd></div>`)
    .join('');
  const meta = [
    record.created && parsePbDate(record.created) ? `${t('created')}: ${formatDate(ctx.locale, parsePbDate(record.created)!)}` : '',
    record.updated && parsePbDate(record.updated) ? `${t('updated')}: ${formatDate(ctx.locale, parsePbDate(record.updated)!)}` : '',
  ].filter(Boolean).join(' · ');

  const backlinks = findBacklinks(ctx, entity, record);
  const related = backlinks === null
    ? `<div class="fx-empty fx-loading">${esc(t('loading'))}</div>`
    : backlinks.length
      ? backlinks
          .map((b) => `<div class="fx-related-group"><h4>${icon(b.entity.icon, 15)}${esc(b.label)}<span class="fx-count">${b.records.length}</span></h4><ul class="fx-related-list">${b.records
            .map((r) => {
              const st = statusFieldOf(b.entity);
              const df = dateFieldOf(b.entity);
              const date = df ? parsePbDate(r[df.id]) : null;
              return `<li><a ${navAttr(recordPath(b.entity, r))}>${esc(recordTitle(b.entity, r, t('untitled')))}</a><span class="fx-related-meta">${date ? esc(formatDate(ctx.locale, date, false)) : ''}${st && r[st.id] ? badge(st, String(r[st.id])) : ''}</span></li>`;
            })
            .join('')}</ul></div>`)
          .join('')
      : `<p class="fx-muted">${esc(t('noRelated'))}</p>`;

  return `${back}
<article class="fx-detail">
  <header class="fx-detail-head">
    <div><h2>${esc(recordTitle(entity, record, t('untitled')))}</h2>${meta ? `<p class="fx-muted">${esc(meta)}</p>` : ''}</div>
    <div class="fx-detail-actions">${status && record[status.id] ? badge(status, String(record[status.id])) : ''}${
      portalFeatureSet(ctx.schema).has('print') ? `<button type="button" class="fx-btn fx-btn-ghost" data-print>${icon('Ticket', 15)}${esc(t('print'))}</button>` : ''
    }${
      editUrl ? `<a class="fx-btn" href="${esc(editUrl)}" target="_blank" rel="noopener">${icon('Pencil', 15)}${esc(t('edit'))}</a>` : ''
    }${
      writable
        ? `<a class="fx-btn fx-btn-accent" data-testid="fx-edit" ${navAttr(`/${entity.id}/${record.id}/edit`)}>${icon('Pencil', 15)}${esc(t('edit'))}</a><button type="button" class="fx-btn fx-btn-ghost fx-danger" data-delete="${esc(record.id)}" data-title="${esc(recordTitle(entity, record, t('untitled')))}">${icon('Trash2', 15)}${esc(t('delete'))}</button>`
        : ''
    }</div>
  </header>
  ${images.length ? `<div class="fx-gallery">${images.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
  <section class="fx-panel"><h3>${esc(t('details'))}</h3><dl class="fx-rows fx-rows-wide">${rows}${relRows}</dl></section>
  <section class="fx-panel"><h3>${icon('Link', 16)}${esc(t('related'))}</h3>${related}</section>
</article>`;
}

/* -------------------------------- dashboard -------------------------------- */

export function renderDashboard(ctx: RenderCtx): string {
  const { schema, t } = ctx;
  const widgets = schema.dashboard?.widgets ?? [];
  const parts: string[] = [];
  const ok = (e: ClubEntity) => {
    const s = ctx.data(e.id);
    return s?.status === 'ok' ? s.records : null;
  };
  const anyLoading = schema.entities.some((e) => !ctx.data(e.id) || ctx.data(e.id)!.status === 'loading');

  for (const w of widgets) {
    if (w === 'stats') {
      parts.push(`<section class="fx-stats">${schema.entities
        .map((e) => {
          const recs = ok(e);
          return `<a class="fx-stat" ${navAttr(`/${e.id}`)}><span class="fx-stat-icon">${icon(e.icon, 18)}</span><span class="fx-stat-num">${recs ? recs.length : '…'}</span><span class="fx-stat-label">${esc(e.pluralName)}</span></a>`;
        })
        .join('')}</section>`);
    }
    if (w === 'upcoming') {
      const items: { e: ClubEntity; r: PortalRecord; d: Date }[] = [];
      for (const e of schema.entities) {
        const df = dateFieldOf(e);
        const recs = ok(e);
        if (!df || !recs) continue;
        for (const r of recs) {
          const d = parsePbDate(r[df.id]);
          if (d && d.getTime() >= ctx.now.getTime() - 12 * 3600_000) items.push({ e, r, d });
        }
      }
      items.sort((a, b) => a.d.getTime() - b.d.getTime());
      const list = items.slice(0, 8).map(({ e, r, d }) => {
        const st = statusFieldOf(e);
        return `<li><a ${navAttr(recordPath(e, r))}><span class="fx-up-date"><b>${d.getDate()}</b>${esc(d.toLocaleDateString(ctx.locale, { month: 'short' }))}</span><span class="fx-up-body"><span class="fx-up-title">${esc(recordTitle(e, r, t('untitled')))}</span><span class="fx-muted">${icon(e.icon, 13)} ${esc(e.pluralName)}${
          d.getUTCHours() || d.getUTCMinutes() ? ` · ${esc(d.toLocaleTimeString(ctx.locale, { hour: '2-digit', minute: '2-digit' }))}` : ''
        }</span></span>${st && r[st.id] ? badge(st, String(r[st.id])) : ''}</a></li>`;
      });
      parts.push(`<section class="fx-panel"><h3>${icon('Clock', 16)}${esc(t('upcoming'))}</h3>${
        list.length ? `<ul class="fx-up-list">${list.join('')}</ul>` : anyLoading ? `<p class="fx-muted">${esc(t('loading'))}</p>` : `<p class="fx-muted">${esc(t('nothingUpcoming'))}</p>`
      }</section>`);
    }
    if (w === 'statuses') {
      const blocks = schema.entities
        .map((e) => {
          const st = groupFieldOf(e);
          const recs = ok(e);
          if (!st || !recs || !recs.length) return '';
          const counts = (st.options ?? []).map((o) => ({ o, n: recs.filter((r) => r[st.id] === o).length })).filter((x) => x.n);
          if (!counts.length) return '';
          const total = counts.reduce((s, x) => s + x.n, 0);
          return `<div class="fx-status-block"><a class="fx-status-title" ${navAttr(`/${e.id}`)}>${icon(e.icon, 14)}${esc(e.pluralName)} · ${esc(st.name)}</a>
<div class="fx-bar">${counts.map((x) => `<span class="fx-tone-${toneOf(st, x.o)}" style="flex:${x.n}" title="${esc(x.o)}: ${x.n}"></span>`).join('')}</div>
<div class="fx-legend">${counts.map((x) => `<span><i class="fx-dot fx-tone-${toneOf(st, x.o)}"></i>${esc(x.o)} <b>${x.n}</b></span>`).join('')}<span class="fx-muted">/ ${total}</span></div></div>`;
        })
        .filter(Boolean);
      if (blocks.length) parts.push(`<section class="fx-panel"><h3>${icon('Columns3', 16)}${esc(t('statuses'))}</h3>${blocks.join('')}</section>`);
    }
    if (w === 'recent') {
      const items: { e: ClubEntity; r: PortalRecord; d: Date }[] = [];
      for (const e of schema.entities) {
        for (const r of ok(e) ?? []) {
          const d = parsePbDate(r.updated ?? r.created);
          if (d) items.push({ e, r, d });
        }
      }
      items.sort((a, b) => b.d.getTime() - a.d.getTime());
      const list = items.slice(0, 6).map(({ e, r, d }) =>
        `<li><a ${navAttr(recordPath(e, r))}>${icon(e.icon, 14)}<span class="fx-up-title">${esc(recordTitle(e, r, t('untitled')))}</span><span class="fx-muted">${esc(formatDate(ctx.locale, d))}</span></a></li>`);
      if (list.length) parts.push(`<section class="fx-panel"><h3>${icon('RefreshCw', 16)}${esc(t('recent'))}</h3><ul class="fx-recent-list">${list.join('')}</ul></section>`);
    }
  }
  if (!schema.entities.length) return renderEmpty(t('noEntities'), t('noEntitiesHint'));
  return `<div class="fx-dashboard">${parts.join('')}</div>`;
}

/* ----------------------------------- CSV ----------------------------------- */

function plainValue(ctx: RenderCtx, field: EntityField, record: PortalRecord): string {
  const value = record[field.id];
  if (field.type === 'relation') {
    const target = ctx.schema.entities.find((e) => e.id === field.targetEntityId);
    return expandedList(record, field.id).map((x) => recordTitle(target, x, '')).join('; ');
  }
  if (value === undefined || value === null) return '';
  if (field.type === 'date') {
    const d = parsePbDate(value);
    return d ? d.toLocaleString(ctx.locale, { dateStyle: 'short', timeStyle: 'short' }) : '';
  }
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
}

/** CSV для Excel: BOM, разделитель «;» для русской локали. */
export function recordsToCsv(ctx: RenderCtx, entity: ClubEntity, records: PortalRecord[]): string {
  const sep = ctx.locale === 'ru' ? ';' : ',';
  const extra = relationsOf(ctx.schema, entity).filter((r) => !entity.fields.some((f) => f.id === r.name));
  const cell = (v: string) => (/[";\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = [...entity.fields.map((f) => f.name), ...extra.map((r) => r.label)];
  const rows = records.map((r) => [
    ...entity.fields.map((f) => plainValue(ctx, f, r)),
    ...extra.map((rel) => {
      const target = ctx.schema.entities.find((e) => e.id === rel.targetEntityId);
      return expandedList(r, rel.name).map((x) => recordTitle(target, x, '')).join('; ');
    }),
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map((v) => cell(v)).join(sep)).join('\r\n')}\r\n`;
}
