import type { ClubEntity, ClubSchema, ViewType } from '@/types/schema';
import { portalT } from './i18n';
import { availableViews, relationsOf } from './model';
import {
  canWrite, esc, filterRecords, recordsToCsv, renderDashboard, renderDetail, renderEmpty, renderEntityPage, renderShell, sortRecords,
  type EntityUiState, type LoadState, type RenderCtx,
} from './render';
import type { DataSource, PortalAssets, PortalRecord, Router } from './types';
import { basisValues } from './basis';
import { renderPrintPage } from './printforms';
import { defaultReportState, renderReports, tableToCsv, type ReportState } from './reports';
import { accessFor, ApiError, canManageStaff, canReadRegister, legacyMode, type Session } from './session';
import {
  readForm, renderBalances, renderForm, renderLogin, renderProfile, renderStaff,
  type FormState, type MovementsState, type StaffState, type WorkspaceCtx,
} from './workspace';

export interface PortalOptions {
  schema: ClubSchema;
  source: DataSource;
  router: Router;
  assets?: PortalAssets;
  /** Вызывается при переходе в раздел (превью синхронизирует активную сущность редактора). */
  onEntityChange?: (entityId: string | null) => void;
  /** Рабочее место: вход сотрудников и права по ролям. Нет — только просмотр. */
  session?: Session;
  /** Подтверждение удаления (в тестах можно подменить). */
  confirm?: (text: string) => boolean;
  prompt?: (text: string) => string | null;
  /** После каждой отрисовки — для скриптов плагинов (window.FacetPortal.onRender). */
  onRender?: (info: { path: string; entityId: string | null; recordId: string | null; root: HTMLElement }) => void;
  now?: () => Date;
}

export interface PortalHandle {
  update(next: Partial<Pick<PortalOptions, 'schema' | 'source' | 'assets' | 'session'>>): void;
  destroy(): void;
}

interface Route {
  /** Служебные страницы рабочего места. */
  page?: 'login' | 'staff' | 'profile' | 'balances' | 'reports';
  entity: ClubEntity | null;
  recordId: string | null;
  /** Форма: создание (recordId = null) или изменение. */
  form?: boolean;
  /** Печатная форма записи. */
  print?: string;
}

/** Снимок значений формы: перерисовка не должна стирать то, что человек уже ввёл. */
function snapshotForms(root: HTMLElement) {
  const out = new Map<string, { value?: string; checked?: boolean }>();
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('form [name]').forEach((el) => {
    if (el instanceof HTMLInputElement && el.type === 'file') return;
    const key = el instanceof HTMLInputElement && el.type === 'checkbox' ? `${el.name}=${el.value}` : el.name;
    out.set(key, el instanceof HTMLInputElement && el.type === 'checkbox' ? { checked: el.checked } : { value: el.value });
  });
  return out;
}

function restoreForms(root: HTMLElement, snap: Map<string, { value?: string; checked?: boolean }>) {
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('form [name]').forEach((el) => {
    if (el instanceof HTMLInputElement && el.type === 'file') return;
    const key = el instanceof HTMLInputElement && el.type === 'checkbox' ? `${el.name}=${el.value}` : el.name;
    const v = snap.get(key);
    if (!v) return;
    if (v.checked !== undefined && el instanceof HTMLInputElement) el.checked = v.checked;
    else if (v.value !== undefined) el.value = v.value;
  });
}

/** Монтирует портал в контейнер. Один и тот же код работает в превью редактора и на сервере клуба. */
export function mountPortal(root: HTMLElement, options: PortalOptions): PortalHandle {
  let { schema, source, assets = {}, session } = options;
  const confirmFn = options.confirm ?? ((text: string) => window.confirm(text));
  const promptFn = options.prompt ?? ((text: string) => window.prompt(text));
  let formState: FormState = {};
  let formKey = '';
  let renderedKey = '';
  let loginState: { error?: string; busy?: boolean } = {};
  let staffState: StaffState | undefined;
  let staffForm: FormState = {};
  let profileForm: FormState & { done?: boolean } = {};
  let movements = new Map<string, MovementsState>();
  /** Сообщение над страницей (ошибка проведения и т. п.); сбрасывается при переходе. */
  let notice: { tone: 'error' | 'ok'; text: string } | null = null;
  /** Значения для новой записи «на основании» другой. */
  let prefill: { entityId: string; values: PortalRecord } | null = null;
  let report: ReportState = defaultReportState(options.now?.() ?? new Date());

  const ws = (): WorkspaceCtx => {
    const user = session?.user() ?? null;
    return {
      user,
      legacy: !session || legacyMode(schema),
      access: (e) => (session ? accessFor(schema, user, e) : 'read'),
      canStaff: !!session && canManageStaff(schema, user),
      writable: !!source.create,
      hasPublic: schema.entities.some((e) => e.public),
      registers: !!source.movements ? (schema.registers ?? []).filter((r) => (session ? canReadRegister(schema, user, r) : true)) : [],
    };
  };
  /** Схема, урезанная до разделов, которые видит текущий пользователь. */
  const visibleSchema = () => {
    const w = ws();
    return { ...schema, entities: schema.entities.filter((e) => w.access(e) !== 'none') };
  };
  const needsLogin = () => {
    const w = ws();
    return !w.legacy && !w.user;
  };
  const now = options.now ?? (() => new Date());
  let data = new Map<string, LoadState>();
  let generation = 0;
  const ui = new Map<string, EntityUiState>();
  let lastEntity: string | null | undefined;

  root.classList.add('fx-root');

  const uiOf = (entity: ClubEntity): EntityUiState => {
    let state = ui.get(entity.id);
    const views = availableViews(entity);
    const schemaView = entity.view?.type ?? 'cards';
    if (!state) {
      const n = now();
      state = { query: '', view: schemaView, schemaView, month: { y: n.getFullYear(), m: n.getMonth() } };
      ui.set(entity.id, state);
    }
    if (state.schemaView !== schemaView) {
      state.view = schemaView;
      state.schemaView = schemaView;
    }
    if (!views.includes(state.view)) state.view = views.includes(schemaView) ? schemaView : 'cards';
    return state;
  };

  const parseRoute = (path: string): Route => {
    const [entityId, recordId, action, printId] = path.replace(/^\/+/, '').split('/').map((s) => decodeURIComponent(s));
    if (entityId === 'login' || entityId === 'staff' || entityId === 'profile' || entityId === 'balances' || entityId === 'reports') return { page: entityId, entity: null, recordId: null };
    const visible = visibleSchema();
    const entity = visible.entities.find((e) => e.id === entityId) ?? null;
    if (!entity && visible.dashboard?.enabled === false) return { entity: visible.entities[0] ?? null, recordId: null };
    if (entity && recordId === 'new') return { entity, recordId: null, form: true };
    if (entity && recordId && action === 'print' && printId) return { entity, recordId, print: printId };
    return { entity, recordId: entity && recordId ? recordId : null, form: !!entity && !!recordId && action === 'edit' };
  };

  const load = (entity: ClubEntity) => {
    if (data.has(entity.id)) return;
    data.set(entity.id, { status: 'loading' });
    const gen = generation;
    const expand = relationsOf(visibleSchema(), entity).map((r) => r.name);
    source
      .list(entity, expand)
      .then((records) => ({ status: 'ok', records }) as LoadState)
      .catch((err: unknown) => ({ status: 'error', error: err instanceof Error ? err.message : String(err) }) as LoadState)
      .then((state) => {
        if (gen !== generation) return;
        data.set(entity.id, state);
        render();
      });
  };

  const ctx = (): RenderCtx => {
    const locale = schema.locale ?? 'ru';
    return { schema: visibleSchema(), t: portalT(locale), locale, source, assets, data: (id) => data.get(id), now: now(), ws: ws(), movements: (id) => movements.get(id) };
  };

  const loadMovements = () => {
    for (const reg of ws().registers) {
      if (movements.has(reg.id)) continue;
      movements.set(reg.id, { status: 'loading' });
      const gen = generation;
      source.movements!(reg)
        .then((rows) => ({ status: 'ok', rows }) as MovementsState)
        .catch((err: Error) => ({ status: 'error', error: err.message }) as MovementsState)
        .then((st) => {
          if (gen !== generation) return;
          movements.set(reg.id, st);
          render();
        });
      // Названия записей для измерений-ссылок.
      for (const d of reg.dimensions) {
        const target = visibleSchema().entities.find((e) => e.id === d.target);
        if (target) load(target);
      }
    }
  };

  const loadStaff = () => {
    if (!session) return;
    staffState = { status: 'loading' };
    session.staff
      .list()
      .then((items) => (staffState = { status: 'ok', items }))
      .catch((err: Error) => (staffState = { status: 'error', error: err.message }))
      .then(() => render());
  };

  function render() {
    const route = parseRoute(options.router.get());
    const c = ctx();
    const w = c.ws!;
    let body: string;
    let active = '';
    const key = `${route.page ?? ''}/${route.entity?.id ?? ''}/${route.recordId ?? ''}/${route.form ? 'form' : ''}`;
    const sameScreen = key === renderedKey;
    renderedKey = key;
    if (prefill && !(route.form && !route.recordId && route.entity?.id === prefill.entityId)) prefill = null;
    if (key !== formKey) {
      formKey = key;
      formState = {};
      if (renderedKey) notice = null;
    }
    if (route.page === 'login' || (needsLogin() && !c.schema.entities.length)) {
      body = renderLogin(c, loginState);
    } else if (route.page === 'staff') {
      if (!w.canStaff) {
        body = needsLogin() ? renderLogin(c, loginState) : renderEmpty(c.t('noAccess'), c.t('noAccessHint'));
      } else {
        active = '/staff';
        if (!staffState) loadStaff();
        body = renderStaff(c, w, staffState, staffForm);
      }
    } else if (route.page === 'balances') {
      active = '/balances';
      if (!w.registers.length) body = needsLogin() ? renderLogin(c, loginState) : renderEmpty(c.t('noAccess'), c.t('noAccessHint'));
      else {
        loadMovements();
        body = renderBalances(c, w, movements);
      }
    } else if (route.page === 'reports') {
      active = '/reports';
      if (!c.schema.entities.length) body = needsLogin() ? renderLogin(c, loginState) : renderEmpty(c.t('noAccess'), c.t('noAccessHint'));
      else {
        if (w.registers.length && report.tab === 'turnover') loadMovements();
        else {
          const e = c.schema.entities.find((x) => x.id === report.entity) ?? c.schema.entities[0];
          load(e);
        }
        body = renderReports(c, w, report, movements);
      }
    } else if (route.page === 'profile') {
      body = w.user ? renderProfile(c, w, profileForm) : renderLogin(c, loginState);
    } else if (!schema.entities.length) {
      body = renderEmpty(c.t('noEntities'), c.t('noEntitiesHint'));
    } else if (!route.entity) {
      c.schema.entities.forEach(load);
      if (c.schema.dashboard?.widgets.some((x) => x === 'attention' || x === 'balances')) loadMovements();
      body = (needsLogin() && w.hasPublic ? `<div class="fx-alert fx-alert-info">${c.t('publicOnly')}</div>` : '') + renderDashboard(c);
    } else if (route.print) {
      active = route.entity.id;
      load(route.entity);
      c.schema.entities.forEach((e) => {
        if (relationsOf(c.schema, route.entity!).some((r) => r.targetEntityId === e.id)) load(e);
      });
      const state = data.get(route.entity.id);
      const record = state?.status === 'ok' ? state.records.find((r) => r.id === route.recordId) : undefined;
      const form = route.entity.printForms?.find((f) => f.id === route.print);
      body = state?.status !== 'ok' ? `<div class="fx-empty fx-loading">${c.t('loading')}</div>`
        : record && form ? renderPrintPage(c, route.entity, record, form) : renderEmpty(c.t('recordNotFound'), c.t('recordNotFoundHint'));
    } else if (route.form) {
      active = route.entity.id;
      load(route.entity);
      relationsOf(c.schema, route.entity).forEach((r) => {
        const target = c.schema.entities.find((e) => e.id === r.targetEntityId);
        if (target) load(target);
      });
      if (!canWrite(c, route.entity)) body = renderEmpty(c.t('noAccess'), c.t('readOnly'));
      else if (route.recordId) {
        const state = data.get(route.entity.id);
        const record = state?.status === 'ok' ? state.records.find((r) => r.id === route.recordId) : undefined;
        body = state?.status !== 'ok' ? `<div class="fx-empty fx-loading">${c.t('loading')}</div>`
          : record ? renderForm(c, route.entity, record, formState) : renderEmpty(c.t('recordNotFound'), c.t('recordNotFoundHint'));
      } else body = renderForm(c, route.entity, null, formState, prefill?.entityId === route.entity.id ? prefill.values : undefined);
    } else if (route.recordId) {
      active = route.entity.id;
      load(route.entity);
      // Для «связанных записей» нужны разделы, которые ссылаются на этот.
      c.schema.entities.filter((e) => relationsOf(c.schema, e).some((r) => r.targetEntityId === route.entity!.id)).forEach(load);
      body = renderDetail(c, route.entity, route.recordId);
    } else {
      active = route.entity.id;
      load(route.entity);
      body = renderEntityPage(c, route.entity, uiOf(route.entity));
    }

    const entityId = route.entity?.id ?? null;
    if (entityId !== lastEntity) {
      lastEntity = entityId;
      options.onEntityChange?.(entityId);
    }

    // Сохраняем фокус, курсор и введённые в форму значения между перерисовками.
    const focused = document.activeElement as HTMLInputElement | null;
    const keepSearch = focused && root.contains(focused) && focused.matches('[data-search]');
    const caret = keepSearch ? focused!.selectionStart : null;
    const focusedId = focused && root.contains(focused) && !keepSearch ? focused.id : '';
    const snap = sameScreen ? snapshotForms(root) : null;
    if (notice) body = `<div class="fx-alert${notice.tone === 'ok' ? ' fx-alert-ok' : ''}" role="alert" data-notice>${esc(notice.text)}</div>${body}`;
    root.innerHTML = renderShell(c, active, body);
    root.classList.toggle('fx-printing-form', !!route.print);
    if (snap?.size) restoreForms(root, snap);
    if (focusedId) (root.querySelector(`#${CSS.escape(focusedId)}`) as HTMLElement | null)?.focus();
    options.onRender?.({ path: options.router.get(), entityId: route.entity?.id ?? null, recordId: route.recordId, root });
    if (keepSearch) {
      const input = root.querySelector<HTMLInputElement>('[data-search]');
      if (input) {
        input.focus();
        if (caret !== null) input.setSelectionRange(caret, caret);
      }
    }
  }

  const currentEntity = () => parseRoute(options.router.get()).entity;

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const nav = target.closest<HTMLElement>('[data-nav]');
    // Внешние ссылки (файлы, панель управления) внутри карточки работают как обычно.
    const anchor = target.closest('a');
    if (anchor && !anchor.hasAttribute('data-nav')) return;
    if (nav && root.contains(nav)) {
      e.preventDefault();
      options.router.go(nav.dataset.nav!);
      return;
    }
    const entity = currentEntity();
    const sortBtn = target.closest<HTMLElement>('[data-sort]');
    if (sortBtn && entity) {
      const state = uiOf(entity);
      const field = sortBtn.dataset.sort!;
      state.sort = state.sort?.field === field ? (state.sort.dir === 1 ? { field, dir: -1 } : undefined) : { field, dir: 1 };
      render();
      return;
    }
    const viewBtn = target.closest<HTMLElement>('[data-view]');
    if (viewBtn && entity) {
      uiOf(entity).view = viewBtn.dataset.view as ViewType;
      render();
      return;
    }
    const monthBtn = target.closest<HTMLElement>('[data-month]');
    if (monthBtn && entity) {
      const state = uiOf(entity);
      const delta = Number(monthBtn.dataset.month);
      if (delta === 0) {
        const n = now();
        state.month = { y: n.getFullYear(), m: n.getMonth() };
      } else {
        const d = new Date(state.month.y, state.month.m + delta, 1);
        state.month = { y: d.getFullYear(), m: d.getMonth() };
      }
      render();
      return;
    }
    if (target.closest('[data-print]')) {
      window.print();
      return;
    }
    if (target.closest('[data-csv]') && entity) {
      const state = data.get(entity.id);
      if (state?.status !== 'ok') return;
      const c = ctx();
      const ui = uiOf(entity);
      const rows = sortRecords(entity, filterRecords(c, entity, state.records, ui.query), ui.sort);
      const blob = new Blob([recordsToCsv(c, entity, rows)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${entity.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    if (target.closest('[data-refresh]')) {
      generation++;
      data = new Map();
      movements = new Map();
      staffState = undefined;
      render();
      return;
    }
    if (target.closest('[data-logout]')) {
      session?.logout();
      options.router.go('/');
      return;
    }
    const repTab = target.closest<HTMLElement>('[data-report-tab]');
    if (repTab) {
      report = { ...report, tab: repTab.dataset.reportTab as ReportState['tab'] };
      render();
      return;
    }
    if (target.closest('[data-report-csv]')) {
      const table = root.querySelector<HTMLTableElement>('[data-report-table]');
      if (!table) return;
      const blob = new Blob([tableToCsv(table, schema.locale ?? 'ru')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `report-${table.dataset.reportTable}-${report.from}-${report.to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    const basisBtn = target.closest<HTMLElement>('[data-basis]');
    if (basisBtn && entity) {
      const route = parseRoute(options.router.get());
      const st = data.get(entity.id);
      const record = st?.status === 'ok' ? st.records.find((r) => r.id === route.recordId) : undefined;
      const targetEntity = schema.entities.find((e) => e.id === basisBtn.dataset.basis);
      if (!record || !targetEntity) return;
      prefill = { entityId: targetEntity.id, values: basisValues(schema, entity, record, targetEntity, basisBtn.dataset.rule === undefined ? null : Number(basisBtn.dataset.rule)) };
      options.router.go(`/${targetEntity.id}/new`);
      return;
    }
    const postBtn = target.closest<HTMLElement>('[data-post]');
    if (postBtn && entity && source.update) {
      const recordId = parseRoute(options.router.get()).recordId;
      if (!recordId) return;
      source
        .update(entity, recordId, { values: { posted: postBtn.dataset.post === 'true' }, files: {} })
        .then(() => {
          notice = null;
          invalidate(entity.id);
          render();
        })
        .catch((err: Error) => {
          notice = { tone: 'error', text: err.message };
          render();
        });
      return;
    }
    const del = target.closest<HTMLElement>('[data-delete]');
    if (del && entity && source.remove) {
      if (!confirmFn(ctx().t('confirmDelete', { title: del.dataset.title ?? '' }))) return;
      source
        .remove(entity, del.dataset.delete!)
        .then(() => {
          invalidate(entity.id);
          options.router.go(`/${entity.id}`);
        })
        .catch((err: Error) => {
          notice = { tone: 'error', text: err.message };
          render();
        });
      return;
    }
    const removeStaff = target.closest<HTMLElement>('[data-staff-remove]');
    if (removeStaff && session) {
      if (!confirmFn(ctx().t('confirmRemoveStaff', { name: removeStaff.dataset.name ?? '' }))) return;
      session.staff.remove(removeStaff.dataset.staffRemove!).then(loadStaff).catch((err: Error) => alertError(err));
      return;
    }
    const resetPwd = target.closest<HTMLElement>('[data-staff-password]');
    if (resetPwd && session) {
      const pwd = promptFn(ctx().t('resetPasswordPrompt', { name: resetPwd.dataset.name ?? '' }));
      if (!pwd) return;
      session.staff.update(resetPwd.dataset.staffPassword!, { password: pwd }).then(() => render()).catch((err: Error) => alertError(err));
    }
  };

  const alertError = (err: Error) => {
    staffForm = { error: err.message };
    formState = { ...formState, error: ctx().t('saveError', { msg: err.message }) };
    render();
  };

  /** Сбрасывает кэш раздела и разделов, которые на него ссылаются (у них в expand старые названия). */
  const invalidate = (entityId: string) => {
    data.delete(entityId);
    // Операция могла изменить остатки.
    if (schema.entities.find((e) => e.id === entityId)?.kind === 'operation') movements = new Map();
    for (const e of schema.entities) if (relationsOf(schema, e).some((r) => r.targetEntityId === entityId)) data.delete(e.id);
  };

  const onSubmit = (e: SubmitEvent) => {
    const form = e.target as HTMLFormElement;
    e.preventDefault();
    const c = ctx();
    const fd = new FormData(form);
    if (form.matches('[data-login]') && session) {
      loginState = { busy: true };
      render();
      session
        .login(String(fd.get('email') ?? '').trim(), String(fd.get('password') ?? ''))
        .then(() => {
          loginState = {};
          generation++;
          data = new Map();
          staffState = undefined;
          options.router.go('/');
          render();
        })
        .catch((err: ApiError) => {
          loginState = { error: err.status === 400 || err.status === 401 ? c.t('badLogin') : err.message };
          render();
        });
      return;
    }
    if (form.matches('[data-record-form]')) {
      const entity = c.schema.entities.find((x) => x.id === form.dataset.recordForm);
      if (!entity) return;
      const id = form.dataset.recordId;
      const { values, files, missing } = readForm(c, entity, form);
      if (missing.length) {
        formState = { fieldErrors: Object.fromEntries(missing.map((m) => [m, 'required'])) };
        render();
        return;
      }
      formState = { saving: true };
      render();
      const op = id ? source.update!(entity, id, { values, files }) : source.create!(entity, { values, files });
      op.then((rec: PortalRecord) => {
        formState = {};
        prefill = null;
        invalidate(entity.id);
        options.router.go(`/${entity.id}/${rec.id}`);
      }).catch((err: ApiError) => {
        formState = { error: c.t('saveError', { msg: err.message }), fieldErrors: err.fields };
        render();
      });
      return;
    }
    if (form.matches('[data-staff-form]') && session) {
      staffForm = { saving: true };
      render();
      session.staff
        .create({ name: String(fd.get('name') ?? '').trim(), email: String(fd.get('email') ?? '').trim(), role: String(fd.get('role') ?? ''), password: String(fd.get('password') ?? '') })
        .then(() => {
          staffForm = {};
          form.reset();
          loadStaff();
        })
        .catch((err: ApiError) => {
          const fields = Object.entries(err.fields ?? {}).map(([k, v]) => `${k}: ${v}`).join('; ');
          staffForm = { error: fields || err.message };
          render();
        });
      return;
    }
    if (form.matches('[data-password-form]') && session) {
      profileForm = { saving: true };
      render();
      session
        .changePassword(String(fd.get('oldPassword') ?? ''), String(fd.get('password') ?? ''))
        .then(() => {
          profileForm = { done: true };
          form.reset();
          render();
        })
        .catch((err: ApiError) => {
          const fields = Object.entries(err.fields ?? {}).map(([k, v]) => `${k}: ${v}`).join('; ');
          profileForm = { error: fields || err.message };
          render();
        });
    }
  };

  const onChange = (e: Event) => {
    const el = e.target as HTMLSelectElement;
    if (el.matches('[data-report]')) {
      const key = el.dataset.report as keyof ReportState;
      report = { ...report, [key]: el.value || undefined } as ReportState;
      if (key === 'entity') report = { ...report, groupBy: undefined, sum: undefined };
      if ((key === 'from' || key === 'to') && !el.value) report = { ...report, [key]: defaultReportState(now())[key] };
      render();
      return;
    }
    if (el.matches('[data-staff-role]') && session) {
      session.staff.update(el.dataset.staffRole!, { role: el.value }).then(loadStaff).catch((err: Error) => alertError(err));
    }
  };

  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (e.key === 'Enter' && el.matches('[data-nav]:not(a)')) {
      e.preventDefault();
      options.router.go(el.dataset.nav!);
    }
  };

  const onInput = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (el.matches('[data-filter-options]')) {
      // Фильтр длинного списка связей — без перерисовки, чтобы не сбросить отметки.
      const q = el.value.trim().toLowerCase();
      el.closest('.fx-multi')?.querySelectorAll<HTMLElement>('[data-option]').forEach((opt) => {
        opt.hidden = !!q && !opt.dataset.option!.includes(q);
      });
      return;
    }
    const entity = currentEntity();
    if (el.matches('[data-search]') && entity) {
      uiOf(entity).query = el.value;
      render();
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  let unsubscribe = session?.subscribe(() => {
    generation++;
    data = new Map();
    staffState = undefined;
    render();
  });
  const unlisten = options.router.listen(() => {
    root.scrollTop = 0;
    render();
  });
  render();

  return {
    update(next) {
      const sourceChanged = (next.source && next.source !== source) || (next.session && next.session !== session);
      if (next.schema) schema = next.schema;
      if (next.source) source = next.source;
      if (next.assets) assets = next.assets;
      if (next.session && next.session !== session) {
        unsubscribe?.();
        session = next.session;
        staffState = undefined;
        unsubscribe = session.subscribe(() => {
          generation++;
          data = new Map();
          render();
        });
      }
      if (sourceChanged) {
        generation++;
        data = new Map();
      }
      render();
    },
    destroy() {
      generation++;
      unlisten();
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('input', onInput);
      root.removeEventListener('submit', onSubmit);
      root.removeEventListener('change', onChange);
      unsubscribe?.();
      root.innerHTML = '';
    },
  };
}

/** Маршрутизатор на location.hash — для развёрнутого портала. */
export function hashRouter(): Router {
  const get = () => location.hash.replace(/^#/, '') || '/';
  return {
    get,
    go: (path) => {
      if (get() !== path) location.hash = path;
    },
    listen: (cb) => {
      const handler = () => cb(get());
      window.addEventListener('hashchange', handler);
      return () => window.removeEventListener('hashchange', handler);
    },
  };
}

/** Маршрутизатор в памяти — для превью внутри редактора (не трогает адресную строку). */
export function memoryRouter(initial = '/'): Router & { set(path: string): void } {
  let path = initial;
  const listeners = new Set<(p: string) => void>();
  const go = (next: string) => {
    if (next === path) return;
    path = next;
    listeners.forEach((l) => l(path));
  };
  return {
    get: () => path,
    go,
    set: go,
    listen: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
