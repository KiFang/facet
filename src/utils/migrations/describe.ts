import type { Locale } from '@/types/schema';
import type { SchemaChange } from './diff';

const RU: Record<SchemaChange['kind'], string> = {
  'collection-added': 'Новый раздел «{collection}»',
  'collection-removed': 'Раздел «{collection}» будет удалён вместе со всеми записями',
  'collection-renamed': 'Раздел «{from}» переименован в «{to}» — записи сохранятся',
  'field-added': '{collection}: новое поле «{field}»',
  'field-removed': '{collection}: поле «{field}» будет удалено вместе с данными',
  'field-renamed': '{collection}: поле «{from}» переименовано в «{to}» — данные сохранятся',
  'field-recreated': '{collection}: поле «{field}» меняет тип ({from} → {to}) — старые значения будут потеряны',
  'field-required': '{collection}: поле «{field}» стало обязательным — старые записи без значения нельзя будет сохранить, пока его не заполнят',
  'field-values-removed': '{collection}: из «{field}» убраны варианты {values} — записи с ними сохранят старое значение, но при редактировании придётся выбрать новое',
  'field-values-added': '{collection}: в «{field}» добавлены варианты {values}',
  'relation-narrowed': '{collection}: связь «{field}» теперь одиночная — у записей останется только первая ссылка',
  'relation-widened': '{collection}: связь «{field}» теперь допускает несколько записей',
};

const EN: Record<SchemaChange['kind'], string> = {
  'collection-added': 'New section “{collection}”',
  'collection-removed': 'Section “{collection}” will be deleted with all its records',
  'collection-renamed': 'Section “{from}” renamed to “{to}” — records are kept',
  'field-added': '{collection}: new field “{field}”',
  'field-removed': '{collection}: field “{field}” will be deleted with its data',
  'field-renamed': '{collection}: field “{from}” renamed to “{to}” — data is kept',
  'field-recreated': '{collection}: field “{field}” changes type ({from} → {to}) — old values will be lost',
  'field-required': '{collection}: field “{field}” is now required — old records without a value must be filled before saving',
  'field-values-removed': '{collection}: options {values} removed from “{field}” — records keep the old value, but editing will require picking a new one',
  'field-values-added': '{collection}: options {values} added to “{field}”',
  'relation-narrowed': '{collection}: link “{field}” is now single — records keep only the first link',
  'relation-widened': '{collection}: link “{field}” now allows multiple records',
};

export function describeChange(change: SchemaChange, locale: Locale = 'ru'): string {
  const tpl = (locale === 'en' ? EN : RU)[change.kind];
  const params: Record<string, string> = {
    collection: change.collection,
    field: change.field ?? '',
    from: change.from ?? '',
    to: change.to ?? '',
    values: (change.values ?? []).map((v) => `«${v}»`).join(', '),
  };
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '');
}

export const SEVERITY_MARK: Record<SchemaChange['severity'], string> = { safe: '+', warning: '!', danger: '✗' };
