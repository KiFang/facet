import { create, useStore } from 'zustand';
import { persist } from 'zustand/middleware';
import { temporal, type TemporalState } from 'zundo';
import { buildPresetSchema } from '@/data/presets';
import { normalizeSchema, normalizeView } from '@/utils/normalize';
import type { InstalledPlugin, PluginManifest } from '@/plugins/types';
import { BUILTIN_BY_ID } from '@/plugins/catalog';
import { defaultSettings, manifestOf } from '@/plugins/runtime';
import type {
  ClubEntity,
  ClubSchema,
  DashboardConfig,
  EditorMode,
  EntityField,
  EntityView,
  Locale,
  PresetId,
  ThemeColors,
  ThemeTokens,
} from '@/types/schema';

/** Строки, импортированные из CSV/Google Таблиц. Ключи строк — id полей. */
export interface SeedBatch {
  entityId: string;
  rows: Record<string, string>[];
  source: string;
  importedAt: string;
}

/**
 * Версия схемы, которая сейчас развёрнута на сервере.
 * От неё считается разница при экспорте обновления.
 */
export interface Baseline {
  schema: ClubSchema;
  /** Точный текст club-schema.json на сервере — по нему считается контрольная сумма. */
  raw: string;
  source: 'export' | 'file';
  at: string;
}

export interface ClubState {
  schema: ClubSchema;
  /** Сущность, открытая в превью и конструкторе. */
  activeEntityId: string | null;
  baseline: Baseline | null;
  seeds: Record<string, SeedBatch>;
  /** Секреты плагинов (токены). Не входят в схему и ссылку «Поделиться» — только в .env экспорта. */
  pluginSecrets: Record<string, Record<string, string>>;

  setEditorMode: (mode: EditorMode) => void;
  setClubInfo: (info: Partial<Pick<ClubSchema, 'clubName' | 'motto'>>) => void;
  setLocale: (locale: Locale) => void;
  setDashboard: (dashboard: DashboardConfig) => void;
  setThemeToken: <K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => void;
  setThemeColor: (key: keyof ThemeColors, value: string) => void;

  addEntity: (entity: ClubEntity) => void;
  updateEntity: (id: string, updates: Partial<ClubEntity>) => void;
  removeEntity: (id: string) => void;
  moveEntity: (id: string, direction: -1 | 1) => void;
  renameEntityId: (id: string, nextId: string) => void;
  setView: (entityId: string, view: EntityView) => void;

  addField: (entityId: string, field: EntityField) => void;
  updateField: (entityId: string, fieldId: string, updates: Partial<EntityField>) => void;
  removeField: (entityId: string, fieldId: string) => void;
  renameFieldId: (entityId: string, fieldId: string, nextId: string) => void;
  moveField: (entityId: string, fieldId: string, direction: -1 | 1) => void;

  setActiveEntity: (id: string | null) => void;
  loadPreset: (preset: PresetId) => void;
  replaceSchema: (schema: ClubSchema) => void;

  installPlugin: (idOrManifest: string | PluginManifest) => void;
  setPluginEnabled: (id: string, enabled: boolean) => void;
  setPluginSettings: (id: string, patch: InstalledPlugin['settings']) => void;
  setPluginSecret: (id: string, key: string, value: string) => void;
  removePlugin: (id: string) => void;
  /** Заменить все строки раздела (редактор данных, режим «черновик»). */
  setSeedRows: (entityId: string, rows: Record<string, string>[], source: string) => void;

  setBaseline: (baseline: Baseline | null) => void;
  setSeeds: (batch: SeedBatch) => void;
  clearSeeds: (entityId?: string) => void;
}

const initialSchema = (): ClubSchema => normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'easy' });

const mapEntity = (
  schema: ClubSchema,
  entityId: string,
  fn: (entity: ClubEntity) => ClubEntity,
): ClubSchema => ({
  ...schema,
  entities: schema.entities.map((e) => (e.id === entityId ? { ...fn(e) } : e)),
});

/** После правки полей вид раздела может ссылаться на удалённое поле — пересчитываем. */
const withView = (e: ClubEntity): ClubEntity => ({ ...e, view: normalizeView(e) });

/** Разделы, которые приносит плагин (например «Журнал изменений»), добавляются, если их ещё нет. */
function withContributedEntities(schema: ClubSchema, manifest: PluginManifest): ClubSchema {
  const add = (manifest.contributes?.entities ?? []).filter((e) => !schema.entities.some((x) => x.id === e.id));
  return add.length ? { ...schema, entities: [...schema.entities, ...add.map((e) => withView(structuredClone(e)))] } : schema;
}

/** Удаляет из seed-строк ключи полей, которых больше нет, и переименовывает ключи. */
function remapSeeds(
  seeds: Record<string, SeedBatch>,
  entityId: string,
  fn: (row: Record<string, string>) => Record<string, string>,
): Record<string, SeedBatch> {
  const batch = seeds[entityId];
  if (!batch) return seeds;
  return { ...seeds, [entityId]: { ...batch, rows: batch.rows.map(fn) } };
}

export const useClubStore = create<ClubState>()(
  persist(
    temporal(
      (set) => ({
        schema: initialSchema(),
        activeEntityId: 'events',
        baseline: null,
        seeds: {},
        pluginSecrets: {},

        setEditorMode: (mode) => set((s) => ({ schema: { ...s.schema, editorMode: mode } })),

        setClubInfo: (info) => set((s) => ({ schema: { ...s.schema, ...info } })),

        setLocale: (locale) => set((s) => ({ schema: { ...s.schema, locale } })),

        setDashboard: (dashboard) => set((s) => ({ schema: { ...s.schema, dashboard } })),

        setThemeToken: (key, value) =>
          set((s) => ({ schema: { ...s.schema, theme: { ...s.schema.theme, [key]: value } } })),

        setThemeColor: (key, value) =>
          set((s) => ({
            schema: {
              ...s.schema,
              theme: { ...s.schema.theme, colors: { ...s.schema.theme.colors, [key]: value } },
            },
          })),

        addEntity: (entity) =>
          set((s) => ({
            schema: { ...s.schema, entities: [...s.schema.entities, withView(entity)] },
            activeEntityId: entity.id,
          })),

        updateEntity: (id, updates) =>
          set((s) => ({ schema: mapEntity(s.schema, id, (e) => withView({ ...e, ...updates, id: e.id, uid: e.uid })) })),

        removeEntity: (id) =>
          set((s) => {
            // Удаляем сущность вместе со всеми ссылками на неё из других сущностей.
            const entities = s.schema.entities
              .filter((e) => e.id !== id)
              .map((e) =>
                withView({
                  ...e,
                  relations: e.relations.filter((r) => r.targetEntityId !== id),
                  fields: e.fields.filter((fld) => !(fld.type === 'relation' && fld.targetEntityId === id)),
                }),
              );
            const seeds = { ...s.seeds };
            delete seeds[id];
            return {
              schema: { ...s.schema, entities },
              seeds,
              activeEntityId: s.activeEntityId === id ? (entities[0]?.id ?? null) : s.activeEntityId,
            };
          }),

        moveEntity: (id, direction) =>
          set((s) => {
            const list = [...s.schema.entities];
            const from = list.findIndex((e) => e.id === id);
            const to = from + direction;
            if (from < 0 || to < 0 || to >= list.length) return s;
            [list[from], list[to]] = [list[to], list[from]];
            return { schema: { ...s.schema, entities: list } };
          }),

        renameEntityId: (id, nextId) =>
          set((s) => {
            if (id === nextId || s.schema.entities.some((e) => e.id === nextId)) return s;
            const entities = s.schema.entities.map((e) => ({
              ...e,
              ...(e.id === id ? { id: nextId, uid: e.uid ?? e.id } : {}),
              relations: e.relations.map((r) => (r.targetEntityId === id ? { ...r, targetEntityId: nextId } : r)),
              fields: e.fields.map((f) => (f.targetEntityId === id ? { ...f, targetEntityId: nextId } : f)),
            }));
            const seeds = { ...s.seeds };
            if (seeds[id]) {
              seeds[nextId] = { ...seeds[id], entityId: nextId };
              delete seeds[id];
            }
            return {
              schema: { ...s.schema, entities },
              seeds,
              activeEntityId: s.activeEntityId === id ? nextId : s.activeEntityId,
            };
          }),

        setView: (entityId, view) =>
          set((s) => ({ schema: mapEntity(s.schema, entityId, (e) => withView({ ...e, view })) })),

        addField: (entityId, field) =>
          set((s) => ({ schema: mapEntity(s.schema, entityId, (e) => withView({ ...e, fields: [...e.fields, field] })) })),

        updateField: (entityId, fieldId, updates) =>
          set((s) => ({
            schema: mapEntity(s.schema, entityId, (e) =>
              withView({
                ...e,
                fields: e.fields.map((fld) => (fld.id === fieldId ? { ...fld, ...updates, id: fld.id, uid: fld.uid } : fld)),
              }),
            ),
          })),

        removeField: (entityId, fieldId) =>
          set((s) => ({
            schema: mapEntity(s.schema, entityId, (e) => withView({ ...e, fields: e.fields.filter((fld) => fld.id !== fieldId) })),
            seeds: remapSeeds(s.seeds, entityId, (row) => {
              const next = { ...row };
              delete next[fieldId];
              return next;
            }),
          })),

        renameFieldId: (entityId, fieldId, nextId) =>
          set((s) => {
            const entity = s.schema.entities.find((e) => e.id === entityId);
            if (!entity || fieldId === nextId || entity.fields.some((f) => f.id === nextId)) return s;
            return {
              schema: mapEntity(s.schema, entityId, (e) =>
                withView({
                  ...e,
                  // uid фиксирует исходное имя: при обновлении сервера это станет переименованием колонки, а не удалением.
                  fields: e.fields.map((fld) => (fld.id === fieldId ? { ...fld, uid: fld.uid ?? fld.id, id: nextId } : fld)),
                  view: e.view && {
                    ...e.view,
                    groupBy: e.view.groupBy === fieldId ? nextId : e.view.groupBy,
                    dateField: e.view.dateField === fieldId ? nextId : e.view.dateField,
                  },
                }),
              ),
              seeds: remapSeeds(s.seeds, entityId, (row) => {
                if (!(fieldId in row)) return row;
                const next = { ...row, [nextId]: row[fieldId] };
                delete next[fieldId];
                return next;
              }),
            };
          }),

        moveField: (entityId, fieldId, direction) =>
          set((s) => ({
            schema: mapEntity(s.schema, entityId, (e) => {
              const fields = [...e.fields];
              const from = fields.findIndex((f) => f.id === fieldId);
              const to = from + direction;
              if (from < 0 || to < 0 || to >= fields.length) return e;
              [fields[from], fields[to]] = [fields[to], fields[from]];
              return { ...e, fields };
            }),
          })),

        setActiveEntity: (id) => set({ activeEntityId: id }),

        loadPreset: (preset) =>
          set((s) => {
            const next = normalizeSchema({ ...buildPresetSchema(preset), editorMode: s.schema.editorMode, locale: s.schema.locale });
            return { schema: next, seeds: {}, activeEntityId: next.entities[0]?.id ?? null };
          }),

        replaceSchema: (schema) =>
          set((s) => {
            const next = normalizeSchema(schema);
            const ids = new Set(next.entities.map((e) => e.id));
            const seeds = Object.fromEntries(Object.entries(s.seeds).filter(([id]) => ids.has(id)));
            const keepActive = s.activeEntityId && ids.has(s.activeEntityId);
            return { schema: next, seeds, activeEntityId: keepActive ? s.activeEntityId : (next.entities[0]?.id ?? null) };
          }),

        installPlugin: (idOrManifest) =>
          set((s) => {
            const manifest = typeof idOrManifest === 'string' ? BUILTIN_BY_ID.get(idOrManifest)?.manifest : idOrManifest;
            if (!manifest) return s;
            const plugins = (s.schema.plugins ?? []).filter((p) => p.id !== manifest.id);
            const installed: InstalledPlugin = {
              id: manifest.id,
              enabled: true,
              settings: defaultSettings(manifest),
              ...(BUILTIN_BY_ID.has(manifest.id) ? {} : { manifest }),
            };
            return { schema: withContributedEntities({ ...s.schema, plugins: [...plugins, installed] }, manifest) };
          }),

        setPluginEnabled: (id, enabled) =>
          set((s) => {
            const plugins = (s.schema.plugins ?? []).map((p) => (p.id === id ? { ...p, enabled } : p));
            const plugin = plugins.find((p) => p.id === id);
            const manifest = plugin && manifestOf(plugin);
            const schema = { ...s.schema, plugins };
            return { schema: enabled && manifest ? withContributedEntities(schema, manifest) : schema };
          }),

        setPluginSettings: (id, patch) =>
          set((s) => ({
            schema: {
              ...s.schema,
              plugins: (s.schema.plugins ?? []).map((p) => (p.id === id ? { ...p, settings: { ...p.settings, ...patch } } : p)),
            },
          })),

        setPluginSecret: (id, key, value) =>
          set((s) => ({ pluginSecrets: { ...s.pluginSecrets, [id]: { ...s.pluginSecrets[id], [key]: value } } })),

        removePlugin: (id) =>
          set((s) => {
            const pluginSecrets = { ...s.pluginSecrets };
            delete pluginSecrets[id];
            return { schema: { ...s.schema, plugins: (s.schema.plugins ?? []).filter((p) => p.id !== id) }, pluginSecrets };
          }),

        setSeedRows: (entityId, rows, source) =>
          set((s) => {
            if (!rows.length) {
              const seeds = { ...s.seeds };
              delete seeds[entityId];
              return { seeds };
            }
            return { seeds: { ...s.seeds, [entityId]: { entityId, rows, source, importedAt: new Date().toISOString() } } };
          }),

        setBaseline: (baseline) => set({ baseline }),

        setSeeds: (batch) => set((s) => ({ seeds: { ...s.seeds, [batch.entityId]: batch } })),

        clearSeeds: (entityId) =>
          set((s) => {
            if (!entityId) return { seeds: {} };
            const seeds = { ...s.seeds };
            delete seeds[entityId];
            return { seeds };
          }),
      }),
      {
        // В историю попадает только схема: переключение вкладок превью — не правка.
        partialize: (state) => ({ schema: state.schema }),
        equality: (a, b) => a.schema === b.schema,
        limit: 100,
        // Перетаскивание ползунка — одна запись в истории, а не сотня.
        handleSet: (handleSet) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          return (...args: Parameters<typeof handleSet>) => {
            if (!timer) handleSet(...args);
            clearTimeout(timer);
            timer = setTimeout(() => {
              timer = undefined;
            }, 400);
          };
        },
      },
    ),
    {
      name: 'facet-os:schema',
      version: 2,
      partialize: (s) => ({ schema: s.schema, activeEntityId: s.activeEntityId, baseline: s.baseline, seeds: s.seeds, pluginSecrets: s.pluginSecrets }),
      migrate: (persisted, version) => {
        const state = persisted as Partial<ClubState>;
        if (version < 2) {
          state.baseline = null;
          state.seeds = {};
        }
        return state as ClubState;
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<ClubState>;
        return {
          ...current,
          ...p,
          schema: p.schema ? normalizeSchema(p.schema) : current.schema,
          baseline: p.baseline ? { ...p.baseline, schema: normalizeSchema(p.baseline.schema) } : null,
          seeds: p.seeds ?? {},
          pluginSecrets: p.pluginSecrets ?? {},
        };
      },
    },
  ),
);

type HistoryState = TemporalState<Pick<ClubState, 'schema'>>;

/** Undo/redo по схеме клуба. */
export function useHistory<T>(selector: (state: HistoryState) => T): T {
  return useStore(useClubStore.temporal, selector);
}
