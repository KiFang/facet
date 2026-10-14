import type { ClubEntity, ClubSchema, ViewType } from '@/types/schema';
import { portalT } from './i18n';
import { availableViews, relationsOf } from './model';
import {
  renderDashboard, renderDetail, renderEmpty, renderEntityPage, renderShell,
  type EntityUiState, type LoadState, type RenderCtx,
} from './render';
import type { DataSource, PortalAssets, Router } from './types';

export interface PortalOptions {
  schema: ClubSchema;
  source: DataSource;
  router: Router;
  assets?: PortalAssets;
  /** Вызывается при переходе в раздел (превью синхронизирует активную сущность редактора). */
  onEntityChange?: (entityId: string | null) => void;
  now?: () => Date;
}

export interface PortalHandle {
  update(next: Partial<Pick<PortalOptions, 'schema' | 'source' | 'assets'>>): void;
  destroy(): void;
}

interface Route {
  entity: ClubEntity | null;
  recordId: string | null;
}

/** Монтирует портал в контейнер. Один и тот же код работает в превью редактора и на сервере клуба. */
export function mountPortal(root: HTMLElement, options: PortalOptions): PortalHandle {
  let { schema, source, assets = {} } = options;
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
    const [entityId, recordId] = path.replace(/^\/+/, '').split('/').map((s) => decodeURIComponent(s));
    const entity = schema.entities.find((e) => e.id === entityId) ?? null;
    if (!entity && schema.dashboard?.enabled === false) return { entity: schema.entities[0] ?? null, recordId: null };
    return { entity, recordId: entity && recordId ? recordId : null };
  };

  const load = (entity: ClubEntity) => {
    if (data.has(entity.id)) return;
    data.set(entity.id, { status: 'loading' });
    const gen = generation;
    const expand = relationsOf(schema, entity).map((r) => r.name);
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
    return { schema, t: portalT(locale), locale, source, assets, data: (id) => data.get(id), now: now() };
  };

  function render() {
    const route = parseRoute(options.router.get());
    const c = ctx();
    let body: string;
    let active = '';
    if (!schema.entities.length) {
      body = renderEmpty(c.t('noEntities'), c.t('noEntitiesHint'));
    } else if (!route.entity) {
      schema.entities.forEach(load);
      body = renderDashboard(c);
    } else if (route.recordId) {
      active = route.entity.id;
      load(route.entity);
      // Для «связанных записей» нужны разделы, которые ссылаются на этот.
      schema.entities.filter((e) => relationsOf(schema, e).some((r) => r.targetEntityId === route.entity!.id)).forEach(load);
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

    // Сохраняем фокус и курсор поиска между перерисовками.
    const focused = document.activeElement as HTMLInputElement | null;
    const keepSearch = focused && root.contains(focused) && focused.matches('[data-search]');
    const caret = keepSearch ? focused!.selectionStart : null;
    root.innerHTML = renderShell(c, active, body);
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
    if (target.closest('[data-refresh]')) {
      generation++;
      data = new Map();
      render();
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
    const entity = currentEntity();
    if (el.matches('[data-search]') && entity) {
      uiOf(entity).query = el.value;
      render();
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('input', onInput);
  const unlisten = options.router.listen(() => {
    root.scrollTop = 0;
    render();
  });
  render();

  return {
    update(next) {
      const sourceChanged = next.source && next.source !== source;
      if (next.schema) schema = next.schema;
      if (next.source) source = next.source;
      if (next.assets) assets = next.assets;
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
