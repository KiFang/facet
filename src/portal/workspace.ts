import type { AccessLevel, ClubEntity, EntityField } from '@/types/schema';
import { icon } from './icons';
import { relationsOf, recordTitle, fileNames } from './model';
import { esc, type RenderCtx } from './render';
import type { StaffUser } from './session';
import type { PortalRecord } from './types';

/* Экраны рабочего места: вход, форма записи, сотрудники, профиль. Чистые функции → HTML. */

export interface WorkspaceCtx {
  user: StaffUser | null;
  /** Схема без ролей (старая версия): только просмотр, правка — в панели PocketBase. */
  legacy: boolean;
  access(entity: ClubEntity): AccessLevel;
  canStaff: boolean;
  /** Источник умеет записывать. */
  writable: boolean;
  /** Есть разделы, видимые без входа. */
  hasPublic: boolean;
}

export interface FormState {
  saving?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const LONG_TEXT = /desc|описан|comment|коммент|note|заметк|текст|text$|about|bio|адрес|address/i;

/** «2026-10-20 18:30:00.000Z» → «2026-10-20T18:30» для <input type="datetime-local"> (время как на сервере, UTC). */
export function toLocalInput(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  return m ? `${m[1]}T${m[2]}:${m[3]}` : '';
}

export function fromLocalInput(value: string): string {
  return value ? `${value.replace('T', ' ')}:00.000Z` : '';
}

const fieldId = (entity: ClubEntity, name: string) => `fx-f-${entity.id}-${name}`;

function errorOf(state: FormState, name: string, t: RenderCtx['t']): string {
  const msg = state.fieldErrors?.[name];
  return msg ? `<p class="fx-field-error">${esc(msg === 'required' ? t('required') : msg)}</p>` : '';
}

function scalarInput(ctx: RenderCtx, entity: ClubEntity, f: EntityField, record: PortalRecord | null): string {
  const id = fieldId(entity, f.id);
  const value = record?.[f.id];
  const req = f.required ? ' required' : '';
  switch (f.type) {
    case 'number':
      return `<input class="fx-input" id="${id}" name="${esc(f.id)}" type="number" step="any" value="${esc(value ?? '')}"${req}>`;
    case 'date':
      return `<input class="fx-input" id="${id}" name="${esc(f.id)}" type="datetime-local" value="${esc(toLocalInput(value))}"${req}>`;
    case 'select':
    case 'status': {
      const opts = (f.options ?? []).map((o) => `<option value="${esc(o)}"${value === o ? ' selected' : ''}>${esc(o)}</option>`).join('');
      const empty = f.required && value ? '' : `<option value="">${esc(ctx.t('choose'))}</option>`;
      return `<select class="fx-input" id="${id}" name="${esc(f.id)}"${req}>${empty}${opts}</select>`;
    }
    case 'file': {
      const current = fileNames(value)[0];
      return `<div class="fx-file">${current ? `<span class="fx-muted">${esc(ctx.t('currentFile', { name: current }))}</span>` : ''}
<input class="fx-input" id="${id}" name="${esc(f.id)}" type="file"${f.required && !current ? ' required' : ''}>
${current && !f.required ? `<label class="fx-check"><input type="checkbox" name="${esc(f.id)}__remove"> ${esc(ctx.t('removeFile'))}</label>` : ''}</div>`;
    }
    default:
      return LONG_TEXT.test(`${f.id} ${f.name}`)
        ? `<textarea class="fx-input" id="${id}" name="${esc(f.id)}" rows="4"${req}>${esc(value ?? '')}</textarea>`
        : `<input class="fx-input" id="${id}" name="${esc(f.id)}" type="text" value="${esc(value ?? '')}"${req}>`;
  }
}

function relationInput(ctx: RenderCtx, entity: ClubEntity, name: string, record: PortalRecord | null): string {
  const rel = relationsOf(ctx.schema, entity).find((r) => r.name === name)!;
  const target = ctx.schema.entities.find((e) => e.id === rel.targetEntityId)!;
  const state = ctx.data(target.id);
  const id = fieldId(entity, name);
  if (!state || state.status === 'loading') return `<p class="fx-muted">${esc(ctx.t('loading'))}</p>`;
  if (state.status === 'error') return `<p class="fx-field-error">${esc(state.error)}</p>`;
  const current = record?.[name];
  const picked = new Set(Array.isArray(current) ? (current as string[]) : current ? [String(current)] : []);
  const options = [...state.records].sort((a, b) => recordTitle(target, a, '').localeCompare(recordTitle(target, b, ''), ctx.locale));
  if (!options.length) return `<p class="fx-muted">${esc(ctx.t('noOptions', { name: target.pluralName }))}</p><input type="hidden" name="${esc(name)}" value="">`;
  if (!rel.multiple) {
    const opts = options.map((r) => `<option value="${esc(r.id)}"${picked.has(r.id) ? ' selected' : ''}>${esc(recordTitle(target, r, ctx.t('untitled')))}</option>`).join('');
    return `<select class="fx-input" id="${id}" name="${esc(name)}"${rel.required ? ' required' : ''}><option value="">${esc(ctx.t('choose'))}</option>${opts}</select>`;
  }
  const items = options
    .map((r) => `<label class="fx-check" data-option="${esc(recordTitle(target, r, '').toLowerCase())}"><input type="checkbox" name="${esc(name)}" value="${esc(r.id)}"${picked.has(r.id) ? ' checked' : ''}> ${esc(recordTitle(target, r, ctx.t('untitled')))}</label>`)
    .join('');
  const filter = options.length > 8 ? `<input class="fx-input fx-multi-filter" type="search" data-filter-options placeholder="${esc(ctx.t('filterOptions'))}">` : '';
  return `<div class="fx-multi" id="${id}" data-multi="${esc(name)}">${filter}<div class="fx-multi-list">${items}</div></div>`;
}

/** Форма создания или изменения записи. */
export function renderForm(ctx: RenderCtx, entity: ClubEntity, record: PortalRecord | null, state: FormState): string {
  const { t } = ctx;
  const back = record ? `/${entity.id}/${record.id}` : `/${entity.id}`;
  const title = record ? t('editRecord', { title: recordTitle(entity, record, t('untitled')) }) : t('addRecord', { name: entity.name });
  const extra = relationsOf(ctx.schema, entity).filter((r) => !entity.fields.some((f) => f.id === r.name));
  const row = (name: string, label: string, required: boolean, control: string) =>
    `<div class="fx-form-row"><label class="fx-label" for="${fieldId(entity, name)}">${esc(label)}${required ? ' <span class="fx-req">*</span>' : ''}</label>${control}${errorOf(state, name, t)}</div>`;
  const fields = entity.fields
    .map((f) => row(f.id, f.name, f.required, f.type === 'relation' ? relationInput(ctx, entity, f.id, record) : scalarInput(ctx, entity, f, record)))
    .concat(extra.map((r) => row(r.name, r.label, r.required, relationInput(ctx, entity, r.name, record))))
    .join('');
  return `<a class="fx-back" data-nav="${esc(back)}" href="#${esc(back)}">${icon('ArrowLeft', 15)}${esc(record ? recordTitle(entity, record, t('untitled')) : entity.pluralName)}</a>
<form class="fx-form fx-panel" data-record-form="${esc(entity.id)}"${record ? ` data-record-id="${esc(record.id)}"` : ''} novalidate>
  <h2>${icon(entity.icon, 20)}${esc(title)}</h2>
  ${state.error ? `<div class="fx-alert">${esc(state.error)}</div>` : ''}
  <div class="fx-form-grid">${fields}</div>
  <div class="fx-form-actions">
    <button type="submit" class="fx-btn fx-btn-accent"${state.saving ? ' disabled' : ''}>${icon('Check', 15)}${esc(state.saving ? t('saving') : t('save'))}</button>
    <a class="fx-btn fx-btn-ghost" data-nav="${esc(back)}" href="#${esc(back)}">${esc(t('cancel'))}</a>
  </div>
</form>`;
}

/** Собирает значения формы в формат PocketBase. */
export function readForm(ctx: RenderCtx, entity: ClubEntity, form: HTMLFormElement): { values: Record<string, unknown>; files: Record<string, File | null>; missing: string[] } {
  const data = new FormData(form);
  const values: Record<string, unknown> = {};
  const files: Record<string, File | null> = {};
  const missing: string[] = [];
  const rels = relationsOf(ctx.schema, entity);
  for (const f of entity.fields) {
    if (f.type === 'relation') continue;
    if (f.type === 'file') {
      const file = data.get(f.id);
      if (file instanceof File && file.size) files[f.id] = file;
      else if (data.get(`${f.id}__remove`)) files[f.id] = null;
      continue;
    }
    const raw = String(data.get(f.id) ?? '').trim();
    if (f.type === 'number') values[f.id] = raw === '' ? null : Number(raw);
    else if (f.type === 'date') values[f.id] = fromLocalInput(raw);
    else values[f.id] = raw;
    if (f.required && raw === '') missing.push(f.id);
  }
  for (const r of rels) {
    const ids = data.getAll(r.name).map(String).filter(Boolean);
    values[r.name] = r.multiple ? ids : (ids[0] ?? '');
    if (r.required && !ids.length) missing.push(r.name);
  }
  return { values, files, missing };
}

/** Экран входа. */
export function renderLogin(ctx: RenderCtx, state: { error?: string; busy?: boolean }): string {
  const { t } = ctx;
  return `<div class="fx-login">
<form class="fx-panel fx-login-card" data-login novalidate>
  <h2>${icon('Lock', 20)}${esc(t('signInTitle'))}</h2>
  <p class="fx-muted">${esc(t('signInHint'))}</p>
  ${state.error ? `<div class="fx-alert">${esc(state.error)}</div>` : ''}
  <div class="fx-form-row"><label class="fx-label" for="fx-login-email">${esc(t('email'))}</label><input class="fx-input" id="fx-login-email" name="email" type="email" autocomplete="username" required></div>
  <div class="fx-form-row"><label class="fx-label" for="fx-login-password">${esc(t('password'))}</label><input class="fx-input" id="fx-login-password" name="password" type="password" autocomplete="current-password" required></div>
  <button type="submit" class="fx-btn fx-btn-accent fx-wide"${state.busy ? ' disabled' : ''}>${icon('LogIn', 15)}${esc(t('signIn'))}</button>
</form>
</div>`;
}

export type StaffState = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ok'; items: StaffUser[] };

/** Сотрудники: список, роли, добавление. */
export function renderStaff(ctx: RenderCtx, ws: WorkspaceCtx, state: StaffState | undefined, form: FormState): string {
  const { t } = ctx;
  const roles = ctx.schema.roles ?? [];
  const roleSelect = (name: string, value: string, attrs = '') =>
    `<select class="fx-input" name="${name}"${attrs}>${roles.map((r) => `<option value="${esc(r.id)}"${r.id === value ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`;
  let list: string;
  if (!state || state.status === 'loading') list = `<div class="fx-empty fx-loading">${esc(t('loading'))}</div>`;
  else if (state.status === 'error') list = `<div class="fx-alert">${esc(state.error)}</div>`;
  else
    list = `<div class="fx-table-wrap"><table class="fx-table"><thead><tr><th>${esc(t('name'))}</th><th>${esc(t('email'))}</th><th>${esc(t('role'))}</th><th></th></tr></thead><tbody>${state.items
      .map((s) => {
        const me = s.id === ws.user?.id;
        return `<tr data-staff-row="${esc(s.id)}"><td>${esc(s.name)}${me ? ` <span class="fx-muted">(${esc(t('you'))})</span>` : ''}</td><td>${esc(s.email)}</td>
<td>${me ? esc(roles.find((r) => r.id === s.role)?.name ?? s.role) : roleSelect('role', s.role, ` data-staff-role="${esc(s.id)}" aria-label="${esc(t('role'))}"`)}</td>
<td class="fx-td-actions">${me ? '' : `<button type="button" class="fx-btn fx-btn-ghost" data-staff-password="${esc(s.id)}" data-name="${esc(s.name)}">${icon('KeyRound', 15)}${esc(t('resetPassword'))}</button><button type="button" class="fx-btn fx-btn-ghost fx-danger" data-staff-remove="${esc(s.id)}" data-name="${esc(s.name)}" aria-label="${esc(t('delete'))}">${icon('Trash2', 15)}</button>`}</td></tr>`;
      })
      .join('')}</tbody></table></div>`;
  return `<div class="fx-toolbar"><h2>${icon('Users', 20)}${esc(t('staff'))}</h2></div>
<p class="fx-muted">${esc(t('staffHint'))}</p>
${list}
<form class="fx-panel fx-form" data-staff-form novalidate>
  <h3>${icon('UserPlus', 16)}${esc(t('addStaff'))}</h3>
  ${form.error ? `<div class="fx-alert">${esc(form.error)}</div>` : ''}
  <div class="fx-form-grid">
    <div class="fx-form-row"><label class="fx-label" for="fx-staff-name">${esc(t('name'))}</label><input class="fx-input" id="fx-staff-name" name="name" type="text" required></div>
    <div class="fx-form-row"><label class="fx-label" for="fx-staff-email">${esc(t('email'))}</label><input class="fx-input" id="fx-staff-email" name="email" type="email" required></div>
    <div class="fx-form-row"><label class="fx-label" for="fx-staff-role">${esc(t('role'))}</label>${roleSelect('role', roles.find((r) => r.id !== 'chair')?.id ?? 'chair', ' id="fx-staff-role"')}</div>
    <div class="fx-form-row"><label class="fx-label" for="fx-staff-password">${esc(t('password'))}</label><input class="fx-input" id="fx-staff-password" name="password" type="text" minlength="8" required></div>
  </div>
  <div class="fx-form-actions"><button type="submit" class="fx-btn fx-btn-accent"${form.saving ? ' disabled' : ''}>${icon('UserPlus', 15)}${esc(t('addStaff'))}</button></div>
</form>`;
}

/** Профиль: смена пароля. */
export function renderProfile(ctx: RenderCtx, ws: WorkspaceCtx, form: FormState & { done?: boolean }): string {
  const { t } = ctx;
  const role = ctx.schema.roles?.find((r) => r.id === ws.user?.role);
  return `<div class="fx-toolbar"><h2>${icon('UserRound', 20)}${esc(ws.user?.name ?? '')}</h2></div>
<p class="fx-muted">${esc(ws.user?.email ?? '')}${role ? ` · ${esc(role.name)}` : ''}</p>
<form class="fx-panel fx-form" data-password-form novalidate>
  <h3>${icon('KeyRound', 16)}${esc(t('changePassword'))}</h3>
  ${form.error ? `<div class="fx-alert">${esc(form.error)}</div>` : ''}
  ${form.done ? `<div class="fx-alert fx-alert-ok">${esc(t('passwordChanged'))}</div>` : ''}
  <div class="fx-form-grid">
    <div class="fx-form-row"><label class="fx-label" for="fx-old-password">${esc(t('oldPassword'))}</label><input class="fx-input" id="fx-old-password" name="oldPassword" type="password" autocomplete="current-password" required></div>
    <div class="fx-form-row"><label class="fx-label" for="fx-new-password">${esc(t('newPassword'))}</label><input class="fx-input" id="fx-new-password" name="password" type="password" autocomplete="new-password" minlength="8" required></div>
  </div>
  <div class="fx-form-actions"><button type="submit" class="fx-btn fx-btn-accent"${form.saving ? ' disabled' : ''}>${esc(t('changePassword'))}</button></div>
</form>`;
}

/** Блок пользователя в шапке. */
export function renderUserBar(ctx: RenderCtx, ws: WorkspaceCtx): string {
  const { t } = ctx;
  if (ws.legacy) return '';
  if (!ws.user) return `<a class="fx-btn fx-btn-accent" data-nav="/login" href="#/login">${icon('LogIn', 15)}${esc(t('signIn'))}</a>`;
  const role = ctx.schema.roles?.find((r) => r.id === ws.user!.role);
  return `<a class="fx-user" data-nav="/profile" href="#/profile" title="${esc(t('profile'))}">${icon('UserRound', 15)}<span><strong>${esc(ws.user.name)}</strong>${role ? `<small>${esc(role.name)}</small>` : ''}</span></a>
<button type="button" class="fx-btn fx-btn-ghost" data-logout title="${esc(t('signOut'))}" aria-label="${esc(t('signOut'))}">${icon('LogOut', 15)}</button>`;
}
