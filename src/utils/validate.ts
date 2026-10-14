import type { ClubSchema, FieldType } from '@/types/schema';
import { normalizeSchema } from '@/utils/normalize';
import { validateManifest } from '@/plugins/runtime';
import { BUILTIN_BY_ID } from '@/plugins/catalog';

const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'status', 'file', 'relation'];
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const ID = /^[a-z][a-z0-9_]*$/;
const FONTS = ['inter', 'manrope', 'rubik', 'pt-serif', 'jetbrains', 'system'];
const VIEWS = ['cards', 'table', 'kanban', 'calendar'];
const WIDGETS = ['stats', 'upcoming', 'statuses', 'recent'];
/** Системные имена коллекций PocketBase, которые нельзя занимать. */
export const RESERVED_COLLECTIONS = ['users'];
/** Системные имена полей PocketBase. */
export const RESERVED_FIELDS = ['id', 'created', 'updated', 'collectionId', 'collectionName', 'expand'];
const MAX_LOGO = 400_000;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  schema?: ClubSchema;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Строгая проверка импортируемого/редактируемого вручную club-schema.json. */
export function validateSchema(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['Корень должен быть объектом'] };
  const s = input as Record<string, unknown>;

  if (typeof s.clubName !== 'string' || !s.clubName.trim()) errors.push('clubName: непустая строка');
  if (typeof s.motto !== 'string') errors.push('motto: строка');
  if (!['easy', 'advanced', 'pro'].includes(s.editorMode as string)) errors.push('editorMode: easy | advanced | pro');
  if (s.locale !== undefined && !['ru', 'en'].includes(s.locale as string)) errors.push('locale: ru | en');
  if (s.dashboard !== undefined) {
    if (!isObj(s.dashboard) || typeof s.dashboard.enabled !== 'boolean' || !Array.isArray(s.dashboard.widgets) ||
        s.dashboard.widgets.some((w) => !WIDGETS.includes(w as string)))
      errors.push(`dashboard: { enabled: boolean, widgets: (${WIDGETS.join(' | ')})[] }`);
  }

  if (s.plugins !== undefined) {
    if (!Array.isArray(s.plugins)) errors.push('plugins: массив');
    else
      s.plugins.forEach((p, i) => {
        if (!isObj(p) || typeof p.id !== 'string') return errors.push(`plugins[${i}]: { id, enabled, settings }`);
        if (p.settings !== undefined && !isObj(p.settings)) errors.push(`plugins[${i}].settings: объект`);
        if (!BUILTIN_BY_ID.has(p.id)) {
          if (!p.manifest) errors.push(`plugins[${i}]: неизвестный плагин «${p.id}» без манифеста`);
          else validateManifest(p.manifest).errors.forEach((err) => errors.push(`plugins[${i}].manifest.${err}`));
        }
      });
  }

  const t = s.theme;
  if (!isObj(t)) {
    errors.push('theme: объект');
  } else {
    if (typeof t.borderRadius !== 'number' || t.borderRadius < 0 || t.borderRadius > 28)
      errors.push('theme.borderRadius: число 0–28');
    if (typeof t.borderWidth !== 'number' || t.borderWidth < 0 || t.borderWidth > 4)
      errors.push('theme.borderWidth: число 0–4');
    if (!['none', 'soft', 'medium', 'colored'].includes(t.shadowIntensity as string))
      errors.push('theme.shadowIntensity: none | soft | medium | colored');
    if (!['solid', 'dashed', 'gradient', 'minimal'].includes(t.dividerStyle as string))
      errors.push('theme.dividerStyle: solid | dashed | gradient | minimal');
    if (!['compact', 'comfortable', 'spacious'].includes(t.density as string))
      errors.push('theme.density: compact | comfortable | spacious');
    if (t.font !== undefined && !FONTS.includes(t.font as string)) errors.push(`theme.font: ${FONTS.join(' | ')}`);
    if (t.logo !== undefined && (typeof t.logo !== 'string' || !/^data:image\/(png|webp|jpeg|svg\+xml);base64,/.test(t.logo) || t.logo.length > MAX_LOGO))
      errors.push('theme.logo: data:image/(png|webp|jpeg|svg+xml);base64, до 300 КБ');
    if (!isObj(t.colors)) errors.push('theme.colors: объект');
    else
      for (const key of ['primary', 'background', 'surface', 'accent', 'text'])
        if (typeof t.colors[key] !== 'string' || !HEX.test(t.colors[key] as string))
          errors.push(`theme.colors.${key}: HEX-цвет`);
  }

  if (!Array.isArray(s.entities)) {
    errors.push('entities: массив');
  } else {
    const ids = new Set<string>();
    s.entities.forEach((e, i) => {
      if (!isObj(e)) return errors.push(`entities[${i}]: объект`);
      if (typeof e.id !== 'string' || !ID.test(e.id)) errors.push(`entities[${i}].id: латиница a-z, 0-9, _`);
      else if (RESERVED_COLLECTIONS.includes(e.id)) errors.push(`entities[${i}].id: «${e.id}» зарезервировано PocketBase`);
      else if (ids.has(e.id)) errors.push(`entities[${i}].id: дубликат «${e.id}»`);
      else ids.add(e.id);
      if (e.uid !== undefined && typeof e.uid !== 'string') errors.push(`entities[${i}].uid: строка`);
    });
    const entityKeys = new Set<string>();
    s.entities.forEach((e, i) => {
      if (!isObj(e)) return;
      const key = (e.uid ?? e.id) as string;
      if (entityKeys.has(key)) errors.push(`entities[${i}].uid: дубликат ключа «${key}»`);
      entityKeys.add(key);
    });
    s.entities.forEach((e, i) => {
      if (!isObj(e)) return;
      const p = `entities[${i}]`;
      if (typeof e.name !== 'string' || !e.name) errors.push(`${p}.name: строка`);
      if (typeof e.pluralName !== 'string' || !e.pluralName) errors.push(`${p}.pluralName: строка`);
      if (typeof e.icon !== 'string') errors.push(`${p}.icon: строка`);
      if (!Array.isArray(e.fields)) errors.push(`${p}.fields: массив`);
      else {
        const fieldIds = new Set<string>();
        e.fields.forEach((fld, j) => {
          const fp = `${p}.fields[${j}]`;
          if (!isObj(fld)) return errors.push(`${fp}: объект`);
          if (typeof fld.id !== 'string' || !ID.test(fld.id)) errors.push(`${fp}.id: латиница a-z, 0-9, _`);
          else if (RESERVED_FIELDS.includes(fld.id)) errors.push(`${fp}.id: «${fld.id}» зарезервировано PocketBase`);
          else if (fieldIds.has(fld.id)) errors.push(`${fp}.id: дубликат «${fld.id}»`);
          else fieldIds.add(fld.id);
          if (fld.uid !== undefined && typeof fld.uid !== 'string') errors.push(`${fp}.uid: строка`);
          if (typeof fld.name !== 'string' || !fld.name) errors.push(`${fp}.name: строка`);
          if (!FIELD_TYPES.includes(fld.type as FieldType)) errors.push(`${fp}.type: ${FIELD_TYPES.join(' | ')}`);
          if (typeof fld.required !== 'boolean') errors.push(`${fp}.required: boolean`);
          if ((fld.type === 'select' || fld.type === 'status') &&
              (!Array.isArray(fld.options) || fld.options.length === 0 || fld.options.some((o) => typeof o !== 'string')))
            errors.push(`${fp}.options: непустой массив строк`);
          if (fld.type === 'relation' && !ids.has(fld.targetEntityId as string))
            errors.push(`${fp}.targetEntityId: ссылка на существующую сущность`);
        });
      }
      if (Array.isArray(e.fields)) {
        const keys = new Set<string>();
        e.fields.forEach((fld, j) => {
          if (!isObj(fld)) return;
          const key = (fld.uid ?? fld.id) as string;
          if (keys.has(key)) errors.push(`${p}.fields[${j}].uid: дубликат ключа «${key}»`);
          keys.add(key);
        });
      }
      if (e.view !== undefined) {
        if (!isObj(e.view) || !VIEWS.includes(e.view.type as string)) errors.push(`${p}.view.type: ${VIEWS.join(' | ')}`);
      }
      if (!Array.isArray(e.relations)) errors.push(`${p}.relations: массив`);
      else
        e.relations.forEach((r, j) => {
          const rp = `${p}.relations[${j}]`;
          if (!isObj(r)) return errors.push(`${rp}: объект`);
          if (!ids.has(r.targetEntityId as string)) errors.push(`${rp}.targetEntityId: ссылка на существующую сущность`);
          if (!['one-to-many', 'many-to-many'].includes(r.type as string))
            errors.push(`${rp}.type: one-to-many | many-to-many`);
        });
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors, schema: normalizeSchema(input as unknown as ClubSchema) };
}
