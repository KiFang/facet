import type { ClubEntity } from '@/types/schema';
import { apiFetch } from '../session';
import type { DataSource, PortalRecord, RecordPayload } from '../types';

const PAGE = 500;
const MAX_PAGES = 20;

function body(payload: RecordPayload): BodyInit {
  const fileKeys = Object.keys(payload.files);
  if (!fileKeys.length) return JSON.stringify(payload.values);
  const form = new FormData();
  for (const [k, v] of Object.entries(payload.values)) {
    if (Array.isArray(v)) {
      if (!v.length) form.append(k, '');
      v.forEach((x) => form.append(k, String(x)));
    } else form.append(k, v === null || v === undefined ? '' : String(v));
  }
  for (const [k, f] of Object.entries(payload.files)) form.append(k, f ?? '');
  return form;
}

/**
 * Источник данных — REST API PocketBase того же сервера (Nginx проксирует /api).
 * `token` — учётная запись сотрудника: правила доступа решают, что видно и что можно менять.
 */
export function pocketbaseSource(base = '', token: () => string | null = () => null): DataSource {
  const col = (entity: ClubEntity) => `${base}/api/collections/${encodeURIComponent(entity.id)}/records`;
  return {
    async list(entity: ClubEntity, expand: string[]) {
      const out: PortalRecord[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const params = new URLSearchParams({ page: String(page), perPage: String(PAGE), sort: '-created' });
        if (expand.length) params.set('expand', expand.join(','));
        const data = await apiFetch<{ items: PortalRecord[]; totalPages: number }>(`${col(entity)}?${params}`, {}, token());
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
    create: (entity, payload) => apiFetch<PortalRecord>(col(entity), { method: 'POST', body: body(payload) }, token()),
    update: (entity, id, payload) =>
      apiFetch<PortalRecord>(`${col(entity)}/${encodeURIComponent(id)}`, { method: 'PATCH', body: body(payload) }, token()),
    remove: async (entity, id) => {
      await apiFetch(`${col(entity)}/${encodeURIComponent(id)}`, { method: 'DELETE' }, token());
    },
  };
}
