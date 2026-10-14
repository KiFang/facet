import type { ClubEntity, FieldType } from '@/types/schema';

/** Значение ячейки. Связи — массив (id записей на сервере или названий в черновике). */
export type CellValue = string | number | string[] | null;

export interface GridColumn {
  /** id поля или имя связи уровня раздела. */
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  /** relation: раздел-цель и допускается ли несколько. */
  target?: string;
  multiple?: boolean;
  /** Колонки нет на сервере (структура не обновлена) — только чтение. */
  missing?: boolean;
}

export interface GridRecord {
  key: string;
  values: Record<string, CellValue>;
  meta?: { collectionId?: string; created?: string; updated?: string };
}

export interface RelationOption {
  value: string;
  label: string;
}

export interface SaveChanges {
  created: { key: string; values: Record<string, CellValue>; files: Record<string, File | null> }[];
  updated: { key: string; patch: Record<string, CellValue>; files: Record<string, File | null> }[];
  deleted: string[];
  /** Порядок всех оставшихся строк в таблице (для черновика, который хранится целиком). */
  order: string[];
}

export interface SaveResult {
  /** Ошибки по строкам: поле → текст (или _row для общей ошибки). */
  errors: Record<string, Record<string, string>>;
  saved: number;
}

export type SourceKind = 'draft' | 'server' | 'local';

export interface DataSourceApi {
  kind: SourceKind;
  /** Подпись в строке состояния. */
  label: string;
  /** Колонки с учётом того, что есть на сервере. */
  columns(entity: ClubEntity): Promise<GridColumn[]>;
  load(entity: ClubEntity, columns: GridColumn[]): Promise<GridRecord[]>;
  save(entity: ClubEntity, columns: GridColumn[], changes: SaveChanges): Promise<SaveResult>;
  relationOptions(targetEntityId: string): Promise<RelationOption[]>;
  fileUrl?(entity: ClubEntity, record: GridRecord, name: string): string | null;
  /** Поддерживается загрузка файлов. */
  files: boolean;
}
