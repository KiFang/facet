import type { ClubEntity, ClubSchema, EntityField, PresetId } from '@/types/schema';

type PresetSchema = Omit<ClubSchema, 'editorMode'>;

const f = (
  id: string,
  name: string,
  type: EntityField['type'],
  required = false,
  extra: Partial<EntityField> = {},
): EntityField => ({ id, name, type, required, ...extra });

const STATUS_EVENT = ['Запланировано', 'Идёт сейчас', 'Завершено', 'Отменено'];
const STATUS_ITEM = ['Доступно', 'Выдано', 'В ремонте', 'Списано'];

/* ---------------------------------- general --------------------------------- */

const generalEntities: ClubEntity[] = [
  {
    id: 'events',
    name: 'Мероприятие',
    pluralName: 'Мероприятия',
    icon: 'Calendar',
    fields: [
      f('title', 'Название', 'text', true),
      f('starts_at', 'Дата начала', 'date', true),
      f('location', 'Место', 'text'),
      f('status', 'Статус', 'status', true, { options: STATUS_EVENT }),
      f('capacity', 'Мест', 'number'),
      f('poster', 'Афиша', 'file'),
    ],
    relations: [{ targetEntityId: 'members', type: 'many-to-many' }],
  },
  {
    id: 'members',
    name: 'Активист',
    pluralName: 'Активисты',
    icon: 'Users',
    fields: [
      f('full_name', 'Имя и фамилия', 'text', true),
      f('role', 'Роль', 'select', true, { options: ['Президент', 'Организатор', 'Медиа', 'Участник'] }),
      f('faculty', 'Факультет', 'text'),
      f('joined_at', 'В клубе с', 'date'),
      f('telegram', 'Telegram', 'text'),
    ],
    relations: [],
  },
  {
    id: 'inventory',
    name: 'Реквизит',
    pluralName: 'Инвентарь / Реквизит',
    icon: 'Package',
    fields: [
      f('item', 'Предмет', 'text', true),
      f('quantity', 'Количество', 'number', true),
      f('state', 'Состояние', 'status', true, { options: STATUS_ITEM }),
      f('holder', 'У кого сейчас', 'relation', false, { targetEntityId: 'members' }),
      f('photo', 'Фото', 'file'),
    ],
    relations: [],
  },
];

/* ---------------------------------- gaming ---------------------------------- */

const gamingEntities: ClubEntity[] = [
  {
    id: 'tournaments',
    name: 'Турнир',
    pluralName: 'Турниры',
    icon: 'Trophy',
    fields: [
      f('title', 'Название', 'text', true),
      f('game', 'Дисциплина', 'select', true, { options: ['CS2', 'Dota 2', 'Valorant', 'League of Legends', 'Tekken 8'] }),
      f('starts_at', 'Старт', 'date', true),
      f('prize_pool', 'Призовой фонд, ₽', 'number'),
      f('status', 'Статус', 'status', true, { options: ['Регистрация', 'Сетка', 'Плей-офф', 'Завершён'] }),
      f('bracket', 'Сетка (PDF)', 'file'),
    ],
    relations: [{ targetEntityId: 'teams', type: 'many-to-many' }],
  },
  {
    id: 'teams',
    name: 'Команда',
    pluralName: 'Команды',
    icon: 'Swords',
    fields: [
      f('name', 'Название', 'text', true),
      f('tag', 'Тег', 'text', true),
      f('rating', 'Рейтинг', 'number'),
      f('logo', 'Логотип', 'file'),
    ],
    relations: [],
  },
  {
    id: 'players',
    name: 'Игрок',
    pluralName: 'Игроки',
    icon: 'Gamepad2',
    fields: [
      f('nickname', 'Никнейм', 'text', true),
      f('role', 'Позиция', 'select', false, { options: ['Капитан', 'Entry', 'Support', 'Снайпер', 'Запасной'] }),
      f('steam_id', 'Steam ID', 'text'),
      f('mmr', 'MMR', 'number'),
    ],
    relations: [{ targetEntityId: 'teams', type: 'one-to-many' }],
  },
  {
    id: 'events',
    name: 'Мероприятие',
    pluralName: 'Мероприятия',
    icon: 'Calendar',
    fields: [
      f('title', 'Название', 'text', true),
      f('starts_at', 'Дата', 'date', true),
      f('status', 'Статус', 'status', true, { options: STATUS_EVENT }),
    ],
    relations: [],
  },
  {
    id: 'gear',
    name: 'Девайс',
    pluralName: 'Инвентарь / Девайсы',
    icon: 'Package',
    fields: [
      f('item', 'Девайс', 'text', true),
      f('quantity', 'Количество', 'number', true),
      f('state', 'Состояние', 'status', true, { options: STATUS_ITEM }),
      f('holder', 'У кого', 'relation', false, { targetEntityId: 'players' }),
    ],
    relations: [],
  },
];

/* -------------------------------- boardgames -------------------------------- */

const boardgameEntities: ClubEntity[] = [
  {
    id: 'game_nights',
    name: 'Игротека',
    pluralName: 'Игротеки',
    icon: 'Dice5',
    fields: [
      f('title', 'Тема вечера', 'text', true),
      f('starts_at', 'Дата', 'date', true),
      f('location', 'Аудитория', 'text', true),
      f('seats', 'Мест за столами', 'number'),
      f('status', 'Статус', 'status', true, { options: STATUS_EVENT }),
    ],
    relations: [
      { targetEntityId: 'games', type: 'many-to-many' },
      { targetEntityId: 'members', type: 'many-to-many' },
    ],
  },
  {
    id: 'games',
    name: 'Настолка',
    pluralName: 'Библиотека игр',
    icon: 'Puzzle',
    fields: [
      f('title', 'Название', 'text', true),
      f('players', 'Игроков', 'text', true),
      f('duration', 'Партия, мин', 'number'),
      f('complexity', 'Сложность', 'select', false, { options: ['Лёгкая', 'Средняя', 'Хардкор'] }),
      f('state', 'Состояние', 'status', true, { options: ['На полке', 'На руках', 'Не хватает компонентов'] }),
      f('rules', 'Правила (PDF)', 'file'),
    ],
    relations: [],
  },
  {
    id: 'members',
    name: 'Участник',
    pluralName: 'Участники',
    icon: 'Users',
    fields: [
      f('full_name', 'Имя', 'text', true),
      f('role', 'Роль', 'select', false, { options: ['Мастер игры', 'Хранитель полки', 'Участник'] }),
      f('telegram', 'Telegram', 'text'),
    ],
    relations: [],
  },
];

/* ----------------------------------- media ---------------------------------- */

const mediaEntities: ClubEntity[] = [
  {
    id: 'publications',
    name: 'Публикация',
    pluralName: 'Публикации',
    icon: 'FileText',
    fields: [
      f('title', 'Заголовок', 'text', true),
      f('format', 'Формат', 'select', true, { options: ['Статья', 'Видео', 'Подкаст', 'Фоторепортаж'] }),
      f('publish_at', 'Дата выхода', 'date', true),
      f('status', 'Статус', 'status', true, { options: ['Идея', 'В работе', 'На вычитке', 'Опубликовано'] }),
      f('cover', 'Обложка', 'file'),
    ],
    relations: [{ targetEntityId: 'authors', type: 'many-to-many' }],
  },
  {
    id: 'authors',
    name: 'Автор',
    pluralName: 'Редакция',
    icon: 'Mic',
    fields: [
      f('full_name', 'Имя', 'text', true),
      f('role', 'Роль', 'select', true, { options: ['Главред', 'Автор', 'Оператор', 'Монтажёр', 'Дизайнер'] }),
      f('portfolio', 'Портфолио', 'text'),
    ],
    relations: [],
  },
  {
    id: 'equipment',
    name: 'Техника',
    pluralName: 'Техника / Реквизит',
    icon: 'Camera',
    fields: [
      f('item', 'Устройство', 'text', true),
      f('serial', 'Серийный номер', 'text'),
      f('state', 'Состояние', 'status', true, { options: STATUS_ITEM }),
      f('holder', 'У кого', 'relation', false, { targetEntityId: 'authors' }),
      f('return_at', 'Вернуть до', 'date'),
    ],
    relations: [],
  },
];

export const PRESETS: Record<PresetId, PresetSchema> = {
  general: {
    clubName: 'Гильдия Северного кампуса',
    motto: 'Делаем студенческую жизнь громче',
    theme: {
      borderRadius: 14,
      borderWidth: 1,
      shadowIntensity: 'soft',
      dividerStyle: 'gradient',
      density: 'comfortable',
      colors: { primary: '#6d28d9', background: '#f6f5fb', surface: '#ffffff', accent: '#f59e0b', text: '#1e1b2e' },
    },
    entities: generalEntities,
  },
  gaming: {
    clubName: 'Киберклуб «Respawn»',
    motto: 'GG WP — и снова в бой',
    theme: {
      borderRadius: 6,
      borderWidth: 1,
      shadowIntensity: 'colored',
      dividerStyle: 'solid',
      density: 'compact',
      colors: { primary: '#22d3ee', background: '#0b0f1a', surface: '#131a2b', accent: '#f43f5e', text: '#e6edf7' },
    },
    entities: gamingEntities,
  },
  boardgames: {
    clubName: 'Клуб настольных игр «Мипл»',
    motto: 'Ещё одну партию — и по домам',
    theme: {
      borderRadius: 22,
      borderWidth: 2,
      shadowIntensity: 'medium',
      dividerStyle: 'dashed',
      density: 'spacious',
      colors: { primary: '#b45309', background: '#fbf6ee', surface: '#fffdf8', accent: '#15803d', text: '#3b2a1a' },
    },
    entities: boardgameEntities,
  },
  media: {
    clubName: 'Студмедиа «Кадр»',
    motto: 'Снимаем, пишем, монтируем',
    theme: {
      borderRadius: 2,
      borderWidth: 0,
      shadowIntensity: 'none',
      dividerStyle: 'minimal',
      density: 'comfortable',
      colors: { primary: '#111827', background: '#fafafa', surface: '#ffffff', accent: '#ef4444', text: '#111827' },
    },
    entities: mediaEntities,
  },
};

export const PRESET_META: Record<PresetId, { title: string; description: string; icon: string }> = {
  general: { title: 'Студенческая гильдия', description: 'Мероприятия, активисты, реквизит', icon: 'Flag' },
  gaming: { title: 'Киберспорт', description: 'Турниры, команды, игроки, девайсы', icon: 'Gamepad2' },
  boardgames: { title: 'Настольные игры', description: 'Игротеки, библиотека игр, участники', icon: 'Dice5' },
  media: { title: 'Студмедиа', description: 'Публикации, редакция, техника', icon: 'Camera' },
};

export function buildPresetSchema(preset: PresetId): PresetSchema {
  return structuredClone(PRESETS[preset]);
}
