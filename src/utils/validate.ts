import type { ClubSchema, FieldType } from '@/types/schema';

const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'status', 'file', 'relation'];
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const ID = /^[a-z][a-z0-9_]*$/;

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
      else if (e.id === 'users') errors.push(`entities[${i}].id: «users» зарезервировано PocketBase`);
      else if (ids.has(e.id)) errors.push(`entities[${i}].id: дубликат «${e.id}»`);
      else ids.add(e.id);
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
          else if (fieldIds.has(fld.id)) errors.push(`${fp}.id: дубликат «${fld.id}»`);
          else fieldIds.add(fld.id);
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

  return errors.length ? { ok: false, errors } : { ok: true, errors, schema: input as unknown as ClubSchema };
}
