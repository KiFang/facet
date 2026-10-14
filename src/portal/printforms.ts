import type { ClubEntity, PrintForm } from '@/types/schema';
import { icon } from './icons';
import { expandedList, fileNames, parsePbDate, recordTitle, relationsOf } from './model';
import { esc, formatDate, type RenderCtx } from './render';
import type { PortalRecord } from './types';

/* Печатные формы: шаблон → страница A4 для печати или сохранения в PDF. */

const SPECIAL: Record<string, (ctx: RenderCtx, record: PortalRecord) => string> = {
  клуб: (ctx) => ctx.schema.clubName,
  club: (ctx) => ctx.schema.clubName,
  сегодня: (ctx) => ctx.now.toLocaleDateString(ctx.locale, { day: 'numeric', month: 'long', year: 'numeric' }),
  today: (ctx) => ctx.now.toLocaleDateString(ctx.locale, { day: 'numeric', month: 'long', year: 'numeric' }),
  сотрудник: (ctx) => ctx.ws?.user?.name ?? '',
  user: (ctx) => ctx.ws?.user?.name ?? '',
  номер: (_ctx, r) => r.id.slice(-6).toUpperCase(),
  number: (_ctx, r) => r.id.slice(-6).toUpperCase(),
};

/** Текстовое значение поля записи для подстановки. */
export function placeholderValue(ctx: RenderCtx, entity: ClubEntity, record: PortalRecord, name: string): string {
  const key = name.trim();
  const special = SPECIAL[key.toLowerCase()];
  if (special) return special(ctx, record);
  const lower = key.toLowerCase();
  const field = entity.fields.find((f) => f.id === key || f.name.toLowerCase() === lower);
  const rel = relationsOf(ctx.schema, entity).find((r) => r.name === key || r.label.toLowerCase() === lower || r.name === field?.id);
  if (rel) {
    const target = ctx.schema.entities.find((e) => e.id === rel.targetEntityId);
    return expandedList(record, rel.name).map((x) => recordTitle(target, x, '')).join(', ');
  }
  if (!field) return `{{${key}}}`;
  const v = record[field.id];
  if (v === undefined || v === null || v === '') return '';
  switch (field.type) {
    case 'date': {
      const d = parsePbDate(v);
      return d ? formatDate(ctx.locale, d) : String(v);
    }
    case 'number':
      return Number(v).toLocaleString(ctx.locale, { maximumFractionDigits: 2 });
    case 'file':
      return fileNames(v).join(', ');
    default:
      return String(v);
  }
}

/** Шаблон → HTML. Подстановки экранируются; разметка — только своя. */
export function renderTemplate(ctx: RenderCtx, entity: ClubEntity, record: PortalRecord, body: string): string {
  const fill = (line: string) =>
    esc(line)
      .replace(/\{\{([^}]+)\}\}/g, (_, name: string) => `<span class="fx-pf-value">${esc(placeholderValue(ctx, entity, record, name.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')))}</span>`)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const lines = body.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let table: string[][] | null = null;
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(fill).join('<br>')}</p>`);
    para = [];
    if (table) {
      const [head, ...rows] = table;
      out.push(`<table class="fx-pf-table"><thead><tr>${head.map((c) => `<th>${fill(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${fill(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      table = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim().startsWith('|')) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (para.length) {
        out.push(`<p>${para.map(fill).join('<br>')}</p>`);
        para = [];
      }
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      (table ??= []).push(cells);
      continue;
    }
    if (table) flush();
    if (!line.trim()) flush();
    else if (/^#\s/.test(line)) { flush(); out.push(`<h1>${fill(line.slice(2))}</h1>`); }
    else if (/^##\s/.test(line)) { flush(); out.push(`<h2>${fill(line.slice(3))}</h2>`); }
    else if (/^---+$/.test(line.trim())) { flush(); out.push('<hr>'); }
    else para.push(line);
  }
  flush();
  return out.join('\n');
}

export function renderPrintPage(ctx: RenderCtx, entity: ClubEntity, record: PortalRecord, form: PrintForm): string {
  const back = `/${entity.id}/${record.id}`;
  return `<div class="fx-pf-toolbar">
  <a class="fx-back" data-nav="${esc(back)}" href="#${esc(back)}">${icon('ArrowLeft', 15)}${esc(recordTitle(entity, record, ctx.t('untitled')))}</a>
  <button type="button" class="fx-btn fx-btn-accent" data-print>${icon('Printer', 15)}${esc(ctx.t('printPdf'))}</button>
</div>
<article class="fx-pf-page" data-print-form="${esc(form.id)}">${renderTemplate(ctx, entity, record, form.body)}</article>`;
}

/** Готовые шаблоны для типовых разделов. */
export function defaultPrintForms(kind: 'cash' | 'equipment', en: boolean): PrintForm[] {
  if (kind === 'cash') {
    return [{
      id: 'order',
      name: en ? 'Cash voucher' : 'Кассовая запись',
      body: en
        ? `# {{Type}} voucher No. {{number}}\n{{club}}\n\nDate: **{{Date}}**\n\n| Description | Category | Amount |\n| --- | --- | --- |\n| {{Description}} | {{Category}} | {{Amount}} |\n\nRecorded by: {{user}}\n\n---\n\nSignature: ______________________`
        : `# {{Вид}} № {{номер}}\n{{клуб}}\n\nДата: **{{Дата}}**\n\n| Основание | Статья | Сумма |\n| --- | --- | --- |\n| {{Основание}} | {{Статья}} | {{Сумма}} |\n\nСоставил(а): {{сотрудник}}\n\n---\n\nПодпись: ______________________`,
    }];
  }
  return [{
    id: 'act',
    name: en ? 'Equipment handover act' : 'Акт выдачи / возврата',
    body: en
      ? `# Equipment act No. {{number}}\n## {{Type}}\n{{club}}, {{Date}}\n\n| Item | Quantity |\n| --- | --- |\n| {{Item}} | {{Quantity}} |\n\nHolder: **{{Holder}}**\n\nIssued by: {{user}}\n\nComment: {{Comment}}\n\n---\n\nHolder's signature: ______________________     Staff signature: ______________________`
      : `# Акт № {{номер}}\n## {{Вид}} инвентаря\n{{клуб}}, {{Дата}}\n\n| Предмет | Количество |\n| --- | --- |\n| {{Предмет}} | {{Количество}} |\n\nКому / от кого: **{{Кому / от кого}}**\n\nОформил(а): {{сотрудник}}\n\nКомментарий: {{Комментарий}}\n\n---\n\nПодпись получателя: ______________________     Подпись сотрудника: ______________________`,
  }];
}
