/**
 * Facet OS — декларативная модель клубного портала.
 * Этот файл — единственный источник правды для редактора, превью и экспортёра.
 */

export type ShadowIntensity = 'none' | 'soft' | 'medium' | 'colored';
export type DividerStyle = 'solid' | 'dashed' | 'gradient' | 'minimal';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type EditorMode = 'easy' | 'advanced' | 'pro';
export type PresetId = 'gaming' | 'boardgames' | 'media' | 'general';
export type Locale = 'ru' | 'en';
export type FontFamily = 'inter' | 'manrope' | 'rubik' | 'pt-serif' | 'jetbrains' | 'system';

export interface ThemeColors {
  primary: string;
  background: string;
  surface: string;
  accent: string;
  text: string;
}

export interface ThemeTokens {
  /** Скругление углов карточек и кнопок, px (0–28). */
  borderRadius: number;
  /** Толщина рамок, px (0–4). */
  borderWidth: number;
  shadowIntensity: ShadowIntensity;
  dividerStyle: DividerStyle;
  density: Density;
  colors: ThemeColors;
  /** Шрифт портала. По умолчанию `inter`. */
  font?: FontFamily;
  /** Логотип клуба как data:URL (PNG/WebP, ≤ 256px). */
  logo?: string;
}

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'status' | 'file' | 'relation';

export interface EntityField {
  /**
   * Системное имя колонки в PocketBase (латиница).
   */
  id: string;
  /**
   * Неизменяемый ключ для сравнения версий схемы. Появляется при первом переименовании `id`;
   * пока его нет, ключом служит `id`.
   */
  uid?: string;
  name: string;
  type: FieldType;
  required: boolean;
  /** Варианты для типов `select` и `status`. */
  options?: string[];
  /** Целевая сущность для типа `relation`. */
  targetEntityId?: string;
}

export type RelationType = 'one-to-many' | 'many-to-many';

export interface EntityRelation {
  targetEntityId: string;
  /**
   * `one-to-many` — каждая запись этой сущности ссылается на одну запись цели
   * (у одной цели много записей этой сущности).
   * `many-to-many` — запись может ссылаться на несколько записей цели.
   */
  type: RelationType;
}

export type ViewType = 'cards' | 'table' | 'kanban' | 'calendar';

export interface EntityView {
  type: ViewType;
  /** Поле `status`/`select` для колонок канбана. */
  groupBy?: string;
  /** Поле `date` для календаря. */
  dateField?: string;
}

export interface ClubEntity {
  /** Имя коллекции PocketBase (латиница). */
  id: string;
  /** Неизменяемый ключ сущности (см. EntityField.uid). */
  uid?: string;
  name: string;
  pluralName: string;
  /** Имя иконки из набора lucide (см. src/lib/icons.ts). */
  icon: string;
  fields: EntityField[];
  relations: EntityRelation[];
  /** Вид раздела в портале. По умолчанию — карточки. */
  view?: EntityView;
}

export type DashboardWidget = 'stats' | 'upcoming' | 'statuses' | 'recent';

export interface DashboardConfig {
  enabled: boolean;
  widgets: DashboardWidget[];
}

export interface ClubSchema {
  clubName: string;
  motto: string;
  theme: ThemeTokens;
  entities: ClubEntity[];
  editorMode: EditorMode;
  /** Язык портала. */
  locale?: Locale;
  /** Главная страница-дашборд. */
  dashboard?: DashboardConfig;
}

export const DEFAULT_DASHBOARD: DashboardConfig = { enabled: true, widgets: ['stats', 'upcoming', 'statuses', 'recent'] };

/** Ключ сущности/поля для сравнения версий схемы. */
export const keyOf = (x: { id: string; uid?: string }): string => x.uid ?? x.id;

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Текст',
  number: 'Число',
  date: 'Дата',
  select: 'Выбор',
  status: 'Статус',
  file: 'Файл',
  relation: 'Связь',
};

export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  'one-to-many': 'Один → много',
  'many-to-many': 'Много ↔ много',
};
