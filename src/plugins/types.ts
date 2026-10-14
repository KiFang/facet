import type { ClubEntity, FieldType, ThemeColors } from '@/types/schema';

/** Строка на двух языках (или одна для всех). */
export type LocalizedText = string | { ru: string; en: string };

export type PluginSettingType =
  | 'text' | 'textarea' | 'secret' | 'boolean' | 'number' | 'select'
  | 'entity' | 'entities' | 'field';

export interface PluginSetting {
  key: string;
  label: LocalizedText;
  type: PluginSettingType;
  description?: LocalizedText;
  required?: boolean;
  default?: string | number | boolean | string[];
  /** select: варианты. */
  options?: { value: string; label: LocalizedText }[];
  /** field: ключ настройки типа entity, из полей которой выбирать. */
  fieldOf?: string;
  /** field: допустимые типы полей. */
  fieldTypes?: FieldType[];
  placeholder?: string;
}

export interface PluginContributes {
  /**
   * Серверный хук PocketBase (pb_hooks, JavaScript).
   * __FACET_SETTINGS__ заменяется JSON-литералом настроек (без секретов) — используйте его
   * внутри обработчиков: PocketBase изолирует их от переменных файла.
   * Секреты: $os.getenv("FACET_PLUGIN_<ID>_<KEY>").
   */
  serverHook?: string;
  /** CSS, добавляемый к теме портала (и в превью). */
  portalCss?: string;
  /** JS для портала (web/plugins/<id>.js). API: window.FacetPortal. В превью редактора не выполняется. */
  portalScript?: string;
  /** Заготовки модулей для «Новый модуль». */
  templates?: Omit<ClubEntity, 'id'>[];
  /** Дополнительные палитры. */
  palettes?: { id: string; name: LocalizedText; colors: ThemeColors }[];
  /** Разделы, которые добавляются в схему при включении плагина. */
  entities?: ClubEntity[];
  /** Встроенные возможности портала. */
  portalFeatures?: ('csv' | 'print')[];
}

export interface PluginManifest {
  /** a-z, 0-9, дефис. */
  id: string;
  name: LocalizedText;
  version: string;
  description: LocalizedText;
  author?: string;
  homepage?: string;
  /** Имя иконки из набора разделов (src/portal/icons.ts). */
  icon?: string;
  settings?: PluginSetting[];
  contributes?: PluginContributes;
}

/** Плагин в схеме клуба (club-schema.json). Секреты здесь не хранятся. */
export interface InstalledPlugin {
  id: string;
  enabled: boolean;
  settings: Record<string, string | number | boolean | string[]>;
  /** Манифест стороннего плагина (у встроенных — берётся из каталога). */
  manifest?: PluginManifest;
}
