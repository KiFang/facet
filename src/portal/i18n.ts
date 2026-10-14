import type { Locale } from '@/types/schema';

const ru = {
  home: 'Главная',
  admin: 'Панель управления',
  search: 'Поиск…',
  refresh: 'Обновить',
  loading: 'Загрузка…',
  nothingFound: 'Ничего не найдено',
  tryAnother: 'Попробуйте другой запрос.',
  empty: 'Пока пусто',
  addFirst: 'Добавьте первую запись «{name}» через панель управления.',
  openCollection: 'Открыть коллекцию',
  loadError: 'Не удалось загрузить данные',
  loadErrorHint: 'Проверьте, что контейнер pocketbase запущен: docker compose ps',
  noEntities: 'В схеме нет разделов',
  noEntitiesHint: 'Добавьте их в Facet OS и экспортируйте заново.',
  footer: 'Собрано в Facet OS · данные хранятся на вашем сервере',
  back: 'Назад',
  edit: 'Изменить',
  related: 'Связанные записи',
  noRelated: 'Других записей, ссылающихся на эту, нет.',
  details: 'Реквизиты',
  created: 'Создано',
  updated: 'Изменено',
  recordNotFound: 'Запись не найдена',
  recordNotFoundHint: 'Возможно, её удалили.',
  noValue: 'Без значения',
  today: 'Сегодня',
  upcoming: 'Ближайшее',
  nothingUpcoming: 'Нет запланированных записей с датой в будущем.',
  statuses: 'Статусы',
  recent: 'Последние изменения',
  more: 'ещё {n}',
  noDate: 'Без даты: {n}',
  untitled: 'Без названия',
  'view.cards': 'Карточки',
  'view.table': 'Таблица',
  'view.kanban': 'Канбан',
  'view.calendar': 'Календарь',
  sortBy: 'Сортировать по «{name}»',
  print: 'Печать',
  csv: 'CSV',
  csvTitle: 'Скачать таблицу для Excel (с учётом поиска)',
};

export type PortalStrings = typeof ru;

const en: PortalStrings = {
  home: 'Home',
  admin: 'Admin panel',
  search: 'Search…',
  refresh: 'Refresh',
  loading: 'Loading…',
  nothingFound: 'Nothing found',
  tryAnother: 'Try a different query.',
  empty: 'Nothing here yet',
  addFirst: 'Add the first “{name}” record in the admin panel.',
  openCollection: 'Open collection',
  loadError: 'Could not load data',
  loadErrorHint: 'Make sure the pocketbase container is running: docker compose ps',
  noEntities: 'The schema has no sections',
  noEntitiesHint: 'Add them in Facet OS and export again.',
  footer: 'Built with Facet OS · your data stays on your server',
  back: 'Back',
  edit: 'Edit',
  related: 'Linked records',
  noRelated: 'No other records link to this one.',
  details: 'Details',
  created: 'Created',
  updated: 'Updated',
  recordNotFound: 'Record not found',
  recordNotFoundHint: 'It may have been deleted.',
  noValue: 'No value',
  today: 'Today',
  upcoming: 'Upcoming',
  nothingUpcoming: 'No upcoming dated records.',
  statuses: 'Statuses',
  recent: 'Recent changes',
  more: '{n} more',
  noDate: 'No date: {n}',
  untitled: 'Untitled',
  'view.cards': 'Cards',
  'view.table': 'Table',
  'view.kanban': 'Kanban',
  'view.calendar': 'Calendar',
  sortBy: 'Sort by “{name}”',
  print: 'Print',
  csv: 'CSV',
  csvTitle: 'Download the table for Excel (respects search)',
};

const DICTS: Record<Locale, PortalStrings> = { ru, en };

export type PortalT = (key: keyof PortalStrings, params?: Record<string, string | number>) => string;

export function portalT(locale: Locale): PortalT {
  const dict = DICTS[locale] ?? ru;
  return (key, params) =>
    dict[key].replace(/\{(\w+)\}/g, (_, p: string) => (params && p in params ? String(params[p]) : `{${p}}`));
}

const PLURALS: Record<Locale, { one: string; few: string; many: string; other: string }> = {
  ru: { one: 'запись', few: 'записи', many: 'записей', other: 'записи' },
  en: { one: 'record', few: 'records', many: 'records', other: 'records' },
};

export function recordsLabel(locale: Locale, n: number): string {
  const rule = new Intl.PluralRules(locale).select(n) as keyof (typeof PLURALS)['ru'];
  return `${n} ${PLURALS[locale][rule] ?? PLURALS[locale].other}`;
}
