import type { ClubEntity } from '@/types/schema';
import type { DataSource, PortalRecord } from '../types';

const PAGE = 500;
const MAX_PAGES = 20;

/** Источник данных — REST API PocketBase того же сервера (Nginx проксирует /api). */
export function pocketbaseSource(base = ''): DataSource {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(base + path, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  };

  return {
    async list(entity: ClubEntity, expand: string[]) {
      const out: PortalRecord[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const params = new URLSearchParams({ page: String(page), perPage: String(PAGE), sort: '-created' });
        if (expand.length) params.set('expand', expand.join(','));
        const data = await get<{ items: PortalRecord[]; totalPages: number }>(
          `/api/collections/${encodeURIComponent(entity.id)}/records?${params}`,
        );
        out.push(...data.items);
        if (page >= data.totalPages) break;
      }
      return out;
    },
    fileUrl(_entity, record, filename, thumb) {
      if (!record.collectionId) return null;
      const url = `${base}/api/files/${encodeURIComponent(record.collectionId)}/${encodeURIComponent(record.id)}/${encodeURIComponent(filename)}`;
      return thumb ? `${url}?thumb=${encodeURIComponent(thumb)}` : url;
    },
    editUrl(entity, record) {
      const collection = record?.collectionId ?? entity.id;
      return `${base}/_/#/collections?collection=${encodeURIComponent(collection)}${record ? `&recordId=${encodeURIComponent(record.id)}` : ''}`;
    },
  };
}
