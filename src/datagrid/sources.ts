import type { ClubEntity, ClubSchema } from '@/types/schema';
import { useClubStore } from '@/store/useClubStore';
import { resolveRelations } from '@/utils/relations';
import { parseDateValue, parseNumberValue, splitLinks } from '@/utils/migrations/seeds';
import type { CellValue, DataSourceApi, GridColumn, RelationOption, SaveChanges, SaveResult } from './types';

/* --------------------------------- columns ---------------------------------- */

export function columnsOf(schema: ClubSchema, entity: ClubEntity): GridColumn[] {
  const cols: GridColumn[] = entity.fields.map((f) => ({
    key: f.id,
    label: f.name,
    type: f.type,
    required: f.required,
    options: f.options,
    target: f.type === 'relation' ? f.targetEntityId : undefined,
    multiple: false,
  }));
  for (const r of resolveRelations(entity, schema)) {
    if (entity.fields.some((f) => f.id === r.name)) continue;
    cols.push({ key: r.name, label: r.label, type: 'relation', required: false, target: r.targetEntityId, multiple: r.multiple });
  }
  return cols;
}

const titleKey = (schema: ClubSchema, entityId: string) => {
  const e = schema.entities.find((x) => x.id === entityId);
  return (e?.fields.find((f) => f.type === 'text') ?? e?.fields[0])?.id ?? 'id';
};

/* -------------------------------- values ------------------------------------ */


/**
 * Даты в Facet OS — «настенное» время в UTC (как их хранит и показывает PocketBase):
 * «2026-10-20 18:30» везде остаётся 18:30, без сдвига часового пояса.
 */
export function toPbDate(value: string): string {
  const iso = parseDateValue(value);
  return iso ?? '';
}

/** «2026-10-20 18:30:00.000Z» → «2026-10-20 18:30» (для <input type="datetime-local"> через T). */
export function fromPbDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  return m ? `${m[1]} ${m[2]}:${m[3]}` : value;
}

export function displayDate(value: CellValue, locale: string): string {
  if (typeof value !== 'string' || !value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/.exec(value);
  if (!m) return value;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)));
  const hasTime = !!m[4] && (m[4] !== '00' || m[5] !== '00');
  return d.toLocaleString(locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

/** Проверка значения на клиенте: обязательность и формат. */
export function validateCell(col: GridColumn, value: CellValue): string | null {
  const empty = value === null || value === '' || (Array.isArray(value) && !value.length);
  if (empty) return col.required ? 'required' : null;
  if (col.type === 'number' && typeof value === 'string' && parseNumberValue(value) === null) return 'number';
  if (col.type === 'date' && typeof value === 'string' && !parseDateValue(value)) return 'date';
  if ((col.type === 'select' || col.type === 'status') && col.options && !col.options.includes(String(value))) return 'option';
  return null;
}

/* ---------------------------------- draft ------------------------------------ */

/** Черновик: строки, которые войдут в следующий экспорт (миграция наполнения). */
export function draftSource(): DataSourceApi {
  const schema = () => useClubStore.getState().schema;
  return {
    kind: 'draft',
    label: 'draft',
    files: false,
    async columns(entity) {
      return columnsOf(schema(), entity);
    },
    async load(entity, columns) {
      const batch = useClubStore.getState().seeds[entity.id];
      return (batch?.rows ?? []).map((row, i) => ({
        key: `d${i}`,
        values: Object.fromEntries(
          columns.map((c) => {
            const raw = row[c.key] ?? '';
            if (c.type === 'relation') return [c.key, splitLinks(raw)];
            if (c.type === 'date') return [c.key, raw ? fromPbDate(parseDateValue(raw) ?? raw) : ''];
            if (c.type === 'number') return [c.key, raw === '' ? '' : (parseNumberValue(raw) ?? raw)];
            return [c.key, raw];
          }),
        ),
      }));
    },
    async save(entity, columns, changes) {
      // Черновик хранится целиком: собираем итоговый список строк.
      const current = await this.load(entity, columns);
      const byKey = new Map(current.map((r) => [r.key, { ...r.values }]));
      for (const key of changes.deleted) byKey.delete(key);
      for (const u of changes.updated) byKey.set(u.key, { ...byKey.get(u.key), ...u.patch });
      for (const c of changes.created) byKey.set(c.key, c.values);
      const ordered = changes.order.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!);
      const rows = ordered.map((values) =>
        Object.fromEntries(
          columns
            .map((c) => {
              const v = values[c.key];
              if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return null;
              return [c.key, Array.isArray(v) ? v.join('; ') : String(v)] as const;
            })
            .filter((x): x is readonly [string, string] => !!x),
        ),
      );
      useClubStore.getState().setSeedRows(entity.id, rows, 'Редактор данных');
      return { errors: {}, saved: changes.created.length + changes.updated.length + changes.deleted.length };
    },
    async relationOptions(targetEntityId) {
      const s = schema();
      const key = titleKey(s, targetEntityId);
      const rows = useClubStore.getState().seeds[targetEntityId]?.rows ?? [];
      const labels = Array.from(new Set(rows.map((r) => r[key]).filter(Boolean)));
      return labels.map((l) => ({ value: l, label: l }));
    },
  };
}

/* ---------------------------------- server ----------------------------------- */

export interface ServerAuth {
  url: string;
  token: string;
  email: string;
}

export async function signIn(url: string, email: string, password: string): Promise<ServerAuth> {
  const base = url.replace(/\/+$/, '');
  const res = await fetch(`${base}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(data.message || `HTTP ${res.status}`);
  return { url: base, token: data.token, email };
}

type PbRecord = Record<string, unknown> & { id: string; collectionId?: string; created?: string; updated?: string };

/** Живая система: REST API PocketBase от имени администратора. */
export function serverSource(auth: ServerAuth, kind: 'server' | 'local' = 'server'): DataSourceApi {
  const schema = () => useClubStore.getState().schema;
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(`${auth.url}${path}`, { ...init, headers: { Authorization: auth.token, ...(init.headers ?? {}) } });
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error((data as { message?: string }).message || `HTTP ${res.status}`) as Error & { fields?: Record<string, string>; status?: number };
      err.status = res.status;
      const fields = (data as { data?: Record<string, { message?: string }> }).data;
      if (fields) err.fields = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.message ?? 'invalid']));
      throw err;
    }
    return data as T;
  };
  const listAll = async (collection: string, fields?: string): Promise<PbRecord[]> => {
    const out: PbRecord[] = [];
    for (let page = 1; page <= 20; page++) {
      const params = new URLSearchParams({ page: String(page), perPage: '500', sort: 'created' });
      if (fields) params.set('fields', fields);
      const data = await call<{ items: PbRecord[]; totalPages: number }>(`/api/collections/${encodeURIComponent(collection)}/records?${params}`);
      out.push(...data.items);
      if (page >= data.totalPages) break;
    }
    return out;
  };

  const toPb = (col: GridColumn, v: CellValue): unknown => {
    if (col.type === 'relation') {
      const ids = Array.isArray(v) ? v : v ? [String(v)] : [];
      return col.multiple ? ids : (ids[0] ?? '');
    }
    if (v === null || v === undefined) return col.type === 'number' ? null : '';
    if (col.type === 'number') return v === '' ? null : typeof v === 'number' ? v : parseNumberValue(String(v));
    if (col.type === 'date') return v ? toPbDate(String(v)) : '';
    return v;
  };

  const body = (columns: GridColumn[], values: Record<string, CellValue>, files: Record<string, File | null>) => {
    const fileKeys = Object.keys(files);
    const plain = Object.fromEntries(
      Object.entries(values)
        .filter(([k]) => !fileKeys.includes(k))
        .map(([k, v]) => {
          const col = columns.find((c) => c.key === k);
          return col && col.type !== 'file' && !col.missing ? [k, toPb(col, v)] : null;
        })
        .filter((x): x is [string, unknown] => !!x),
    );
    if (!fileKeys.length) return { body: JSON.stringify(plain), headers: { 'content-type': 'application/json' } as Record<string, string> };
    const form = new FormData();
    for (const [k, v] of Object.entries(plain)) {
      if (Array.isArray(v)) v.forEach((x) => form.append(k, String(x)));
      else form.append(k, v === null ? '' : String(v));
    }
    for (const [k, f] of Object.entries(files)) form.append(k, f ?? '');
    return { body: form, headers: {} as Record<string, string> };
  };

  return {
    kind,
    label: auth.url,
    files: true,
    async columns(entity) {
      const cols = columnsOf(schema(), entity);
      try {
        const col = await call<{ fields: { name: string }[] }>(`/api/collections/${encodeURIComponent(entity.id)}`);
        const names = new Set(col.fields.map((f) => f.name));
        return cols.map((c) => (names.has(c.key) ? c : { ...c, missing: true }));
      } catch (err) {
        if ((err as { status?: number }).status === 404) {
          throw new Error(`collection-missing:${entity.id}`);
        }
        throw err;
      }
    },
    async load(entity, columns) {
      const items = await listAll(entity.id);
      return items.map((r) => ({
        key: r.id,
        meta: { collectionId: r.collectionId, created: r.created, updated: r.updated },
        values: Object.fromEntries(
          columns.map((c) => {
            const v = r[c.key];
            if (c.type === 'relation' || c.type === 'file') return [c.key, Array.isArray(v) ? v.map(String) : v ? [String(v)] : []];
            if (c.type === 'date') return [c.key, fromPbDate(v)];
            if (c.type === 'number') return [c.key, v === null || v === undefined || v === '' ? '' : Number(v)];
            return [c.key, v === null || v === undefined ? '' : String(v)];
          }),
        ),
      }));
    },
    async save(entity, columns, changes: SaveChanges): Promise<SaveResult> {
      const errors: SaveResult['errors'] = {};
      let saved = 0;
      const base = `/api/collections/${encodeURIComponent(entity.id)}/records`;
      const fail = (key: string, err: unknown) => {
        const e = err as Error & { fields?: Record<string, string> };
        errors[key] = { ...(e.fields ?? {}), _row: e.message };
      };
      for (const id of changes.deleted) {
        try {
          await call(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
          saved++;
        } catch (err) {
          fail(id, err);
        }
      }
      for (const u of changes.updated) {
        try {
          const b = body(columns, u.patch, u.files);
          await call(`${base}/${encodeURIComponent(u.key)}`, { method: 'PATCH', ...b });
          saved++;
        } catch (err) {
          fail(u.key, err);
        }
      }
      for (const c of changes.created) {
        try {
          const b = body(columns, c.values, c.files);
          await call(base, { method: 'POST', ...b });
          saved++;
        } catch (err) {
          fail(c.key, err);
        }
      }
      return { errors, saved };
    },
    async relationOptions(targetEntityId): Promise<RelationOption[]> {
      const key = titleKey(schema(), targetEntityId);
      const items = await listAll(targetEntityId, `id,${key}`);
      return items.map((r) => ({ value: r.id, label: String(r[key] ?? r.id) || r.id }));
    },
    fileUrl(_entity, record, name) {
      return record.meta?.collectionId ? `${auth.url}/api/files/${record.meta.collectionId}/${record.key}/${encodeURIComponent(name)}` : null;
    },
  };
}
