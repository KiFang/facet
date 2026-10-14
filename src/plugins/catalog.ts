import telegramHook from './builtin/telegram.pb.js?raw';
import autonumberHook from './builtin/autonumber.pb.js?raw';
import auditHook from './builtin/audit-log.pb.js?raw';
import type { ClubSchema } from '@/types/schema';
import type { PluginManifest } from './types';

/** Встроенный плагин: манифест + вычисление служебных параметров хука из схемы клуба. */
export interface BuiltinPlugin {
  manifest: PluginManifest;
  resolve?: (schema: ClubSchema, settings: Record<string, unknown>) => Record<string, unknown>;
}

const titleOf = (schema: ClubSchema, id: string) => {
  const e = schema.entities.find((x) => x.id === id);
  return (e?.fields.find((f) => f.type === 'text') ?? e?.fields[0])?.id ?? 'id';
};

const labelsFor = (schema: ClubSchema, ids: string[]) => ({
  labels: Object.fromEntries(ids.map((id) => [id, schema.entities.find((e) => e.id === id)?.name ?? id])),
  titles: Object.fromEntries(ids.map((id) => [id, titleOf(schema, id)])),
});

export const BUILTIN_PLUGINS: BuiltinPlugin[] = [
  {
    manifest: {
      id: 'telegram',
      name: { ru: 'Уведомления в Telegram', en: 'Telegram notifications' },
      version: '1.0.0',
      description: {
        ru: 'Бот пишет в чат клуба о новых, изменённых и удалённых записях выбранных разделов — например, о новых заявках или смене статуса задачи.',
        en: 'A bot posts to the club chat about new, changed and deleted records in selected sections.',
      },
      author: 'Facet OS',
      icon: 'Megaphone',
      settings: [
        {
          key: 'bot_token', type: 'secret', required: true,
          label: { ru: 'Токен бота', en: 'Bot token' },
          description: { ru: 'Выдаёт @BotFather. Хранится только в .env сервера, в схему не попадает.', en: 'Issued by @BotFather. Stored only in the server .env.' },
          placeholder: '123456:ABC-DEF…',
        },
        {
          key: 'chatId', type: 'text', required: true,
          label: { ru: 'ID чата', en: 'Chat ID' },
          description: { ru: 'Добавьте бота в чат и узнайте ID, например через @getmyid_bot. Для групп — число со знаком минус.', en: 'Add the bot to the chat and get its ID (e.g. via @getmyid_bot).' },
          placeholder: '-1001234567890',
        },
        { key: 'entities', type: 'entities', required: true, label: { ru: 'Разделы', en: 'Sections' } },
        { key: 'onCreate', type: 'boolean', default: true, label: { ru: 'Новые записи', en: 'New records' } },
        { key: 'onUpdate', type: 'boolean', default: false, label: { ru: 'Изменения (со сменой статуса)', en: 'Changes (with status change)' } },
        { key: 'onDelete', type: 'boolean', default: false, label: { ru: 'Удаления', en: 'Deletions' } },
      ],
      contributes: { serverHook: telegramHook },
    },
    resolve: (schema, s) => {
      const ids = (s.entities as string[] | undefined) ?? [];
      return {
        ...labelsFor(schema, ids),
        statuses: Object.fromEntries(ids.map((id) => [id, schema.entities.find((e) => e.id === id)?.fields.find((f) => f.type === 'status')?.id ?? ''])),
      };
    },
  },
  {
    manifest: {
      id: 'autonumber',
      name: { ru: 'Автонумерация документов', en: 'Document numbering' },
      version: '1.0.0',
      description: {
        ru: 'Каждой новой записи раздела присваивается номер по порядку: «ДОК-2026-00001», «ЗАЯВКА-00042». Как нумерация документов в 1С.',
        en: 'Every new record gets a sequential number such as “DOC-2026-00001”.',
      },
      author: 'Facet OS',
      icon: 'FileText',
      settings: [
        { key: 'entity', type: 'entity', required: true, label: { ru: 'Раздел', en: 'Section' } },
        {
          key: 'field', type: 'field', required: true, fieldOf: 'entity', fieldTypes: ['text'],
          label: { ru: 'Поле для номера', en: 'Number field' },
          description: { ru: 'Текстовое поле. Если оно заполнено вручную, номер не перезаписывается.', en: 'A text field. A manually filled value is kept.' },
        },
        {
          key: 'prefix', type: 'text', default: 'ДОК-{YYYY}-',
          label: { ru: 'Префикс', en: 'Prefix' },
          description: { ru: '{YYYY} заменяется текущим годом — нумерация начнётся заново каждый год.', en: '{YYYY} becomes the current year — numbering restarts yearly.' },
        },
        { key: 'digits', type: 'number', default: 5, label: { ru: 'Цифр в номере', en: 'Digits' } },
      ],
      contributes: { serverHook: autonumberHook },
    },
  },
  {
    manifest: {
      id: 'audit-log',
      name: { ru: 'Журнал изменений', en: 'Audit log' },
      version: '1.0.0',
      description: {
        ru: 'Добавляет раздел «Журнал изменений»: кто, когда и что создал, изменил или удалил. Помогает разобраться, откуда взялась ошибка в данных.',
        en: 'Adds an “Audit log” section: who created, changed or deleted what and when.',
      },
      author: 'Facet OS',
      icon: 'Archive',
      settings: [{ key: 'collections', type: 'entities', label: { ru: 'Отслеживать разделы', en: 'Track sections' }, description: { ru: 'Пусто — все разделы.', en: 'Empty — all sections.' } }],
      contributes: {
        serverHook: auditHook,
        entities: [
          {
            id: 'audit_log',
            name: 'Запись журнала',
            pluralName: 'Журнал изменений',
            icon: 'Archive',
            view: { type: 'table' },
            fields: [
              { id: 'record', name: 'Запись', type: 'text', required: false },
              { id: 'action', name: 'Действие', type: 'status', required: true, options: ['Создание', 'Изменение', 'Удаление'] },
              { id: 'section', name: 'Раздел', type: 'text', required: false },
              { id: 'author', name: 'Кто', type: 'text', required: false },
              { id: 'changes', name: 'Изменённые поля', type: 'text', required: false },
              { id: 'record_id', name: 'ID записи', type: 'text', required: false },
            ],
            relations: [],
          },
        ],
      },
    },
    resolve: (schema, s) => {
      const chosen = (s.collections as string[] | undefined) ?? [];
      const ids = (chosen.length ? chosen : schema.entities.map((e) => e.id)).filter((id) => id !== 'audit_log');
      return {
        collections: ids,
        ...labelsFor(schema, ids),
        fieldLabels: Object.fromEntries(ids.map((id) => [id, Object.fromEntries((schema.entities.find((e) => e.id === id)?.fields ?? []).map((f) => [f.id, f.name]))])),
      };
    },
  },
  {
    manifest: {
      id: 'portal-tools',
      name: { ru: 'Печать и выгрузка на портале', en: 'Print and export on the portal' },
      version: '1.0.0',
      description: {
        ru: 'Кнопки «Печать» и «CSV» в каждом разделе портала: печатная форма списка или карточки и выгрузка таблицы для Excel с учётом поиска.',
        en: '“Print” and “CSV” buttons in every portal section, respecting the current search.',
      },
      author: 'Facet OS',
      icon: 'Ticket',
      contributes: { portalFeatures: ['csv', 'print'] },
    },
  },
  {
    manifest: {
      id: 'custom-css',
      name: { ru: 'Свой стиль портала', en: 'Custom portal CSS' },
      version: '1.0.0',
      description: {
        ru: 'Дополнительный CSS поверх темы: свои отступы, шрифты заголовков, скрытие элементов. Сразу виден в превью.',
        en: 'Extra CSS on top of the theme. Applied in the preview immediately.',
      },
      author: 'Facet OS',
      icon: 'Star',
      settings: [
        {
          key: 'css', type: 'textarea',
          label: { ru: 'CSS', en: 'CSS' },
          description: { ru: 'Классы портала начинаются с .fx- (например .fx-hero, .fx-card, .fx-table).', en: 'Portal classes start with .fx- (e.g. .fx-hero, .fx-card).' },
          placeholder: '.fx-hero h1 { letter-spacing: 0; }',
        },
      ],
    },
  },
];

export const BUILTIN_BY_ID = new Map(BUILTIN_PLUGINS.map((p) => [p.manifest.id, p]));
