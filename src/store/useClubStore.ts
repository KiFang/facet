import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildPresetSchema } from '@/data/presets';
import type {
  ClubEntity,
  ClubSchema,
  EditorMode,
  EntityField,
  PresetId,
  ThemeColors,
  ThemeTokens,
} from '@/types/schema';

export interface ClubState {
  schema: ClubSchema;
  /** Сущность, открытая в превью и конструкторе. */
  activeEntityId: string | null;

  setEditorMode: (mode: EditorMode) => void;
  setClubInfo: (info: Partial<Pick<ClubSchema, 'clubName' | 'motto'>>) => void;
  setThemeToken: <K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => void;
  setThemeColor: (key: keyof ThemeColors, value: string) => void;

  addEntity: (entity: ClubEntity) => void;
  updateEntity: (id: string, updates: Partial<ClubEntity>) => void;
  removeEntity: (id: string) => void;
  moveEntity: (id: string, direction: -1 | 1) => void;

  addField: (entityId: string, field: EntityField) => void;
  updateField: (entityId: string, fieldId: string, updates: Partial<EntityField>) => void;
  removeField: (entityId: string, fieldId: string) => void;
  renameFieldId: (entityId: string, fieldId: string, nextId: string) => void;

  setActiveEntity: (id: string | null) => void;
  loadPreset: (preset: PresetId) => void;
  replaceSchema: (schema: ClubSchema) => void;
}

const initialSchema = (): ClubSchema => ({ ...buildPresetSchema('general'), editorMode: 'easy' });

const mapEntity = (
  schema: ClubSchema,
  entityId: string,
  fn: (entity: ClubEntity) => ClubEntity,
): ClubSchema => ({
  ...schema,
  entities: schema.entities.map((e) => (e.id === entityId ? fn(e) : e)),
});

export const useClubStore = create<ClubState>()(
  persist(
    (set) => ({
      schema: initialSchema(),
      activeEntityId: 'events',

      setEditorMode: (mode) => set((s) => ({ schema: { ...s.schema, editorMode: mode } })),

      setClubInfo: (info) => set((s) => ({ schema: { ...s.schema, ...info } })),

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
          schema: { ...s.schema, entities: [...s.schema.entities, entity] },
          activeEntityId: entity.id,
        })),

      updateEntity: (id, updates) =>
        set((s) => ({ schema: mapEntity(s.schema, id, (e) => ({ ...e, ...updates, id: e.id })) })),

      removeEntity: (id) =>
        set((s) => {
          // Удаляем сущность вместе со всеми ссылками на неё из других сущностей.
          const entities = s.schema.entities
            .filter((e) => e.id !== id)
            .map((e) => ({
              ...e,
              relations: e.relations.filter((r) => r.targetEntityId !== id),
              fields: e.fields.filter((fld) => !(fld.type === 'relation' && fld.targetEntityId === id)),
            }));
          return {
            schema: { ...s.schema, entities },
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

      addField: (entityId, field) =>
        set((s) => ({ schema: mapEntity(s.schema, entityId, (e) => ({ ...e, fields: [...e.fields, field] })) })),

      updateField: (entityId, fieldId, updates) =>
        set((s) => ({
          schema: mapEntity(s.schema, entityId, (e) => ({
            ...e,
            fields: e.fields.map((fld) => (fld.id === fieldId ? { ...fld, ...updates, id: fld.id } : fld)),
          })),
        })),

      removeField: (entityId, fieldId) =>
        set((s) => ({
          schema: mapEntity(s.schema, entityId, (e) => ({
            ...e,
            fields: e.fields.filter((fld) => fld.id !== fieldId),
          })),
        })),

      renameFieldId: (entityId, fieldId, nextId) =>
        set((s) => ({
          schema: mapEntity(s.schema, entityId, (e) =>
            e.fields.some((fld) => fld.id === nextId)
              ? e
              : { ...e, fields: e.fields.map((fld) => (fld.id === fieldId ? { ...fld, id: nextId } : fld)) },
          ),
        })),

      setActiveEntity: (id) => set({ activeEntityId: id }),

      loadPreset: (preset) =>
        set((s) => {
          const next = buildPresetSchema(preset);
          return {
            schema: { ...next, editorMode: s.schema.editorMode },
            activeEntityId: next.entities[0]?.id ?? null,
          };
        }),

      replaceSchema: (schema) =>
        set({ schema: structuredClone(schema), activeEntityId: schema.entities[0]?.id ?? null }),
    }),
    { name: 'facet-os:schema', version: 1 },
  ),
);
