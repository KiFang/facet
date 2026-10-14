import type { ClubEntity, ClubSchema, FieldType } from '@/types/schema';
import { BUILTIN_BY_ID } from './catalog';
import type { InstalledPlugin, LocalizedText, PluginManifest, PluginSetting } from './types';

export const PLUGIN_ID = /^[a-z][a-z0-9-]{1,40}$/;
const SETTING_TYPES = ['text', 'textarea', 'secret', 'boolean', 'number', 'select', 'entity', 'entities', 'field'];
const MAX_CODE = 200_000;

export function tr(text: LocalizedText | undefined, locale: 'ru' | 'en'): string {
  if (!text) return '';
  return typeof text === 'string' ? text : (text[locale] ?? text.ru);
}

export function manifestOf(plugin: InstalledPlugin): PluginManifest | null {
  return BUILTIN_BY_ID.get(plugin.id)?.manifest ?? plugin.manifest ?? null;
}

export const isBuiltin = (id: string) => BUILTIN_BY_ID.has(id);

export function enabledPlugins(schema: ClubSchema): { plugin: InstalledPlugin; manifest: PluginManifest }[] {
  return (schema.plugins ?? [])
    .filter((p) => p.enabled)
    .map((plugin) => ({ plugin, manifest: manifestOf(plugin) }))
    .filter((x): x is { plugin: InstalledPlugin; manifest: PluginManifest } => !!x.manifest);
}

/** Имя переменной окружения для секрета плагина. */
export function secretEnvName(pluginId: string, key: string): string {
  return `FACET_PLUGIN_${pluginId.replace(/-/g, '_')}_${key}`.toUpperCase();
}

export function defaultSettings(manifest: PluginManifest): InstalledPlugin['settings'] {
  const out: InstalledPlugin['settings'] = {};
  for (const s of manifest.settings ?? []) {
    if (s.type === 'secret') continue;
    if (s.default !== undefined) out[s.key] = s.default;
    else if (s.type === 'boolean') out[s.key] = false;
    else if (s.type === 'entities') out[s.key] = [];
  }
  return out;
}

/** Проблемы настройки плагина (обязательные поля, ссылки на несуществующие разделы/поля). */
export function settingsProblems(schema: ClubSchema, manifest: PluginManifest, plugin: InstalledPlugin, secrets: Record<string, string> = {}): string[] {
  const problems: string[] = [];
  for (const s of manifest.settings ?? []) {
    const value = s.type === 'secret' ? secrets[s.key] : plugin.settings[s.key];
    const empty = value === undefined || value === '' || (Array.isArray(value) && !value.length);
    if (s.required && empty) problems.push(s.key);
    if (!empty && s.type === 'entity' && !schema.entities.some((e) => e.id === value)) problems.push(s.key);
    if (!empty && s.type === 'entities' && (value as string[]).some((id) => !schema.entities.some((e) => e.id === id))) problems.push(s.key);
    if (!empty && s.type === 'field') {
      const entity = schema.entities.find((e) => e.id === plugin.settings[s.fieldOf ?? '']);
      const field = entity?.fields.find((f) => f.id === value);
      if (!field || (s.fieldTypes && !s.fieldTypes.includes(field.type))) problems.push(s.key);
    }
  }
  return Array.from(new Set(problems));
}

/** Настройки для хука: без секретов + вычисляемые параметры встроенного плагина. */
export function hookSettings(schema: ClubSchema, plugin: InstalledPlugin, manifest: PluginManifest): Record<string, unknown> {
  const base: Record<string, unknown> = { ...defaultSettings(manifest), ...plugin.settings };
  for (const s of manifest.settings ?? []) if (s.type === 'secret') delete base[s.key];
  const extra = BUILTIN_BY_ID.get(plugin.id)?.resolve?.(schema, base) ?? {};
  return { ...base, ...extra };
}

export interface PluginExportFile {
  path: string;
  content: string;
  description: string;
}

/** Файлы плагинов для архива экспорта: хуки PocketBase и скрипты портала. */
export function pluginFiles(schema: ClubSchema): PluginExportFile[] {
  const files: PluginExportFile[] = [];
  for (const { plugin, manifest } of enabledPlugins(schema)) {
    const c = manifest.contributes ?? {};
    if (c.serverHook) {
      const settings = JSON.stringify(hookSettings(schema, plugin, manifest));
      files.push({
        path: `pocketbase/pb_hooks/plugin-${plugin.id}.pb.js`,
        content: `/// <reference path="../pb_data/types.d.ts" />\n// Плагин Facet OS «${tr(manifest.name, 'ru')}» ${manifest.version}${manifest.author ? ` — ${manifest.author}` : ''}\n// Сгенерировано из настроек плагина. Не редактируйте вручную.\n\n${c.serverHook.split('__FACET_SETTINGS__').join(`(${settings})`)}\n`,
        description: `Плагин: ${tr(manifest.name, 'ru')}`,
      });
    }
    if (c.portalScript) {
      files.push({
        path: `web/plugins/${plugin.id}.js`,
        content: `/* Плагин Facet OS «${tr(manifest.name, 'ru')}» */\n${c.portalScript}\n`,
        description: `Плагин: ${tr(manifest.name, 'ru')} (портал)`,
      });
    }
  }
  return files;
}

/** CSS плагинов для портала (превью и экспорт). */
export function pluginCss(schema: ClubSchema): string {
  return enabledPlugins(schema)
    .map(({ plugin, manifest }) => {
      const parts = [manifest.contributes?.portalCss ?? ''];
      if (plugin.id === 'custom-css' && typeof plugin.settings.css === 'string') parts.push(plugin.settings.css);
      const css = parts.filter(Boolean).join('\n');
      return css ? `/* plugin: ${plugin.id} */\n${css}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

export function portalFeatures(schema: ClubSchema): Set<'csv' | 'print'> {
  return new Set(enabledPlugins(schema).flatMap(({ manifest }) => manifest.contributes?.portalFeatures ?? []));
}

export function pluginScripts(schema: ClubSchema): string[] {
  return enabledPlugins(schema).filter(({ manifest }) => manifest.contributes?.portalScript).map(({ plugin }) => `/plugins/${plugin.id}.js`);
}

/** Строки .env с секретами плагинов (для установки и обновления). */
export function pluginEnvLines(
  schema: ClubSchema,
  secrets: Record<string, Record<string, string>>,
  { includeEmpty = true }: { includeEmpty?: boolean } = {},
): string[] {
  const lines: string[] = [];
  for (const { plugin, manifest } of enabledPlugins(schema)) {
    for (const s of manifest.settings ?? []) {
      if (s.type !== 'secret') continue;
      const value = secrets[plugin.id]?.[s.key] ?? '';
      // В обновлении пустой секрет не отправляем — иначе затрём значение на сервере.
      if (!value && !includeEmpty) continue;
      lines.push(`${secretEnvName(plugin.id, s.key)}=${value.replace(/[\r\n]/g, '')}`);
    }
  }
  return lines;
}

export function pluginTemplates(schema: ClubSchema): { plugin: string; template: Omit<ClubEntity, 'id'> }[] {
  return enabledPlugins(schema).flatMap(({ plugin, manifest }) => (manifest.contributes?.templates ?? []).map((template) => ({ plugin: plugin.id, template })));
}

export function pluginPalettes(schema: ClubSchema) {
  return enabledPlugins(schema).flatMap(({ manifest }) => manifest.contributes?.palettes ?? []);
}

/* ------------------------------ manifest checks ------------------------------ */

const isText = (v: unknown) => typeof v === 'string' || (typeof v === 'object' && v !== null && typeof (v as { ru?: unknown }).ru === 'string');
const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'status', 'file', 'relation'];

/** Проверка манифеста стороннего плагина. Возвращает список ошибок. */
export function validateManifest(input: unknown): { ok: boolean; errors: string[]; manifest?: PluginManifest } {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) return { ok: false, errors: ['манифест должен быть объектом'] };
  const m = input as Record<string, unknown>;
  if (typeof m.id !== 'string' || !PLUGIN_ID.test(m.id)) errors.push('id: латиница a-z, цифры и дефис, 2–41 символ');
  else if (BUILTIN_BY_ID.has(m.id)) errors.push(`id: «${m.id}» занят встроенным плагином`);
  if (!isText(m.name)) errors.push('name: строка или { ru, en }');
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+/.test(m.version)) errors.push('version: семантическая версия, например 1.0.0');
  if (!isText(m.description)) errors.push('description: строка или { ru, en }');
  if (m.settings !== undefined) {
    if (!Array.isArray(m.settings)) errors.push('settings: массив');
    else
      (m.settings as PluginSetting[]).forEach((s, i) => {
        if (!s || typeof s.key !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(s.key)) errors.push(`settings[${i}].key: латиница`);
        if (!SETTING_TYPES.includes(s?.type)) errors.push(`settings[${i}].type: ${SETTING_TYPES.join(' | ')}`);
        if (!isText(s?.label)) errors.push(`settings[${i}].label: строка`);
        if (s?.fieldTypes && !s.fieldTypes.every((t) => FIELD_TYPES.includes(t))) errors.push(`settings[${i}].fieldTypes`);
      });
  }
  const c = m.contributes as Record<string, unknown> | undefined;
  if (c !== undefined) {
    if (typeof c !== 'object' || c === null) errors.push('contributes: объект');
    else {
      for (const key of ['serverHook', 'portalCss', 'portalScript']) {
        if (c[key] !== undefined && (typeof c[key] !== 'string' || (c[key] as string).length > MAX_CODE)) errors.push(`contributes.${key}: строка до 200 КБ`);
      }
      for (const key of ['templates', 'palettes', 'entities', 'portalFeatures']) {
        if (c[key] !== undefined && !Array.isArray(c[key])) errors.push(`contributes.${key}: массив`);
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors, manifest: input as PluginManifest };
}

/** Что умеет плагин — для предупреждения перед установкой стороннего. */
export function pluginCapabilities(manifest: PluginManifest): ('server' | 'script' | 'css' | 'entities' | 'templates' | 'palettes')[] {
  const c = manifest.contributes ?? {};
  const caps: ('server' | 'script' | 'css' | 'entities' | 'templates' | 'palettes')[] = [];
  if (c.serverHook) caps.push('server');
  if (c.portalScript) caps.push('script');
  if (c.portalCss) caps.push('css');
  if (c.entities?.length) caps.push('entities');
  if (c.templates?.length) caps.push('templates');
  if (c.palettes?.length) caps.push('palettes');
  return caps;
}
