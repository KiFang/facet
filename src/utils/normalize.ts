import { DEFAULT_DASHBOARD, type ClubEntity, type ClubSchema, type EntityView } from '@/types/schema';

/** Корректный вид раздела: поля groupBy/dateField должны существовать и подходить по типу. */
export function normalizeView(entity: ClubEntity): EntityView {
  const view: EntityView = { type: entity.view?.type ?? 'cards' };
  const groupable = entity.fields.filter((f) => f.type === 'status' || f.type === 'select');
  const dated = entity.fields.filter((f) => f.type === 'date');
  const groupBy = groupable.find((f) => f.id === entity.view?.groupBy) ?? groupable.find((f) => f.type === 'status') ?? groupable[0];
  const dateField = dated.find((f) => f.id === entity.view?.dateField) ?? dated[0];
  if (groupBy) view.groupBy = groupBy.id;
  if (dateField) view.dateField = dateField.id;
  if (view.type === 'kanban' && !groupBy) view.type = 'cards';
  if (view.type === 'calendar' && !dateField) view.type = 'cards';
  return view;
}

/**
 * Приводит схему (в т.ч. сохранённую старой версией редактора или импортированную) к полному виду.
 * Не меняет исходный объект.
 */
export function normalizeSchema(schema: ClubSchema): ClubSchema {
  const s = structuredClone(schema);
  s.locale = s.locale === 'en' ? 'en' : 'ru';
  s.dashboard = s.dashboard
    ? { enabled: s.dashboard.enabled !== false, widgets: Array.from(new Set(s.dashboard.widgets ?? DEFAULT_DASHBOARD.widgets)) }
    : { ...DEFAULT_DASHBOARD, widgets: [...DEFAULT_DASHBOARD.widgets] };
  s.theme.font = s.theme.font ?? 'inter';
  s.entities = s.entities.map((e) => ({ ...e, relations: e.relations ?? [], view: normalizeView(e) }));
  return s;
}
