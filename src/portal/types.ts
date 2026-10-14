import type { ClubEntity, ClubRegister } from '@/types/schema';

export interface PortalRecord {
  id: string;
  collectionId?: string;
  collectionName?: string;
  created?: string;
  updated?: string;
  expand?: Record<string, PortalRecord | PortalRecord[] | undefined>;
  [field: string]: unknown;
}

/** Данные формы записи: значения полей и новые файлы (null — удалить файл). */
export interface RecordPayload {
  values: Record<string, unknown>;
  files: Record<string, File | null>;
}

/** Откуда портал берёт записи: PocketBase на сервере или примеры в редакторе. */
export interface DataSource {
  /** Все записи сущности (для клуба это сотни, не миллионы), новые сверху. */
  list(entity: ClubEntity, expand: string[]): Promise<PortalRecord[]>;
  fileUrl(entity: ClubEntity, record: PortalRecord, filename: string, thumb?: string): string | null;
  /** Ссылка на запись (или коллекцию) в панели управления; null — панели нет (превью). */
  editUrl(entity: ClubEntity, record?: PortalRecord): string | null;
  /** Запись данных (рабочее место). Нет методов — только просмотр. */
  create?(entity: ClubEntity, payload: RecordPayload): Promise<PortalRecord>;
  update?(entity: ClubEntity, id: string, payload: RecordPayload): Promise<PortalRecord>;
  remove?(entity: ClubEntity, id: string): Promise<void>;
  /** Движения регистра остатков (учёт). */
  movements?(register: ClubRegister): Promise<{ dims: Record<string, string>; res: Record<string, number>; period: string; op_collection?: string; op_id?: string }[]>;
}

export interface Router {
  get(): string;
  go(path: string): void;
  listen(cb: (path: string) => void): () => void;
}

export interface PortalAssets {
  logoUrl?: string;
}
