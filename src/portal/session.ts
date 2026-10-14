import type { AccessLevel, ClubEntity, ClubRegister, ClubRole, ClubSchema } from '@/types/schema';
import { registerReaders } from '@/utils/registers';
import { accessOf, CHAIR_ROLE, STAFF_COLLECTION } from '@/utils/access';

/** Сотрудник (учётная запись актива). */
export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface StaffInput {
  email?: string;
  name?: string;
  role?: string;
  password?: string;
}

/**
 * Сессия рабочего места. На сервере — вход в PocketBase (коллекция staff),
 * в превью редактора — «смотреть как роль».
 */
export interface Session {
  user(): StaffUser | null;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  changePassword(oldPassword: string, password: string): Promise<void>;
  /** Заголовок Authorization для запросов к API (или null). */
  token(): string | null;
  subscribe(cb: () => void): () => void;
  /** Управление составом (для ролей с manageStaff). */
  staff: {
    list(): Promise<StaffUser[]>;
    create(input: StaffInput): Promise<void>;
    update(id: string, input: StaffInput): Promise<void>;
    remove(id: string): Promise<void>;
  };
}

/** Старая модель (без ролей): все разделы открыты на чтение, правка — в панели PocketBase. */
export const legacyMode = (schema: ClubSchema) => !schema.roles?.length;

export function roleOf(schema: ClubSchema, user: StaffUser | null): ClubRole | null {
  if (!user) return null;
  return schema.roles?.find((r) => r.id === user.role) ?? null;
}

/** Что текущий пользователь может делать с разделом. */
export function accessFor(schema: ClubSchema, user: StaffUser | null, entity: ClubEntity): AccessLevel {
  if (legacyMode(schema)) return 'read';
  if (!user) return entity.public ? 'read' : 'none';
  if (user.role === CHAIR_ROLE) return 'write';
  const role = roleOf(schema, user);
  if (!role) return entity.public ? 'read' : 'none';
  return accessOf(role, entity.id);
}

/** Видит ли пользователь остатки регистра (по доступу к операциям, которые в него пишут). */
export function canReadRegister(schema: ClubSchema, user: StaffUser | null, reg: ClubRegister): boolean {
  if (legacyMode(schema)) return true;
  if (!user) return false;
  return registerReaders(schema, reg).some((r) => r.id === user.role);
}

export function canManageStaff(schema: ClubSchema, user: StaffUser | null): boolean {
  if (!user || legacyMode(schema)) return false;
  if (user.role === CHAIR_ROLE) return true;
  return !!roleOf(schema, user)?.manageStaff;
}

/* ------------------------------ PocketBase ---------------------------------- */

const STORAGE_KEY = 'facet-staff-auth';

interface Stored {
  token: string;
  user: StaffUser;
}

const toUser = (r: Record<string, unknown>): StaffUser => ({
  id: String(r.id),
  email: String(r.email ?? ''),
  name: String(r.name ?? '') || String(r.email ?? ''),
  role: String(r.role ?? ''),
});

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields: Record<string, string> = {}) {
    super(message);
  }
}

export async function apiFetch<T>(url: string, init: RequestInit, token: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', token);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(url, { ...init, headers });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { message?: string; data?: Record<string, { message?: string }> };
    const fields = Object.fromEntries(Object.entries(d.data ?? {}).map(([k, v]) => [k, v?.message ?? '']));
    throw new ApiError(d.message || `HTTP ${res.status}`, res.status, fields);
  }
  return data as T;
}

/** Сессия на сервере клуба: токен хранится в localStorage этого браузера. */
export function pocketbaseSession(base = ''): Session {
  let stored: Stored | null = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    stored = null;
  }
  const listeners = new Set<() => void>();
  const save = (next: Stored | null) => {
    stored = next;
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* приватный режим: вход до закрытия вкладки */
    }
    listeners.forEach((l) => l());
  };
  const col = `${base}/api/collections/${STAFF_COLLECTION}`;
  const token = () => stored?.token ?? null;

  // Проверяем сохранённый токен (и обновляем роль, если её сменили).
  if (stored) {
    apiFetch<{ token: string; record: Record<string, unknown> }>(`${col}/auth-refresh`, { method: 'POST' }, stored.token)
      .then((r) => save({ token: r.token, user: toUser(r.record) }))
      .catch((err: ApiError) => {
        if (err.status === 401 || err.status === 403 || err.status === 404) save(null);
      });
  }

  const body = (input: StaffInput) => {
    const out: Record<string, unknown> = {};
    if (input.email !== undefined) out.email = input.email;
    if (input.name !== undefined) out.name = input.name;
    if (input.role !== undefined) out.role = input.role;
    if (input.password) {
      out.password = input.password;
      out.passwordConfirm = input.password;
    }
    return JSON.stringify(out);
  };

  return {
    user: () => stored?.user ?? null,
    token,
    async login(email, password) {
      const r = await apiFetch<{ token: string; record: Record<string, unknown> }>(
        `${col}/auth-with-password`,
        { method: 'POST', body: JSON.stringify({ identity: email, password }) },
        null,
      );
      save({ token: r.token, user: toUser(r.record) });
    },
    logout: () => save(null),
    async changePassword(oldPassword, password) {
      const user = stored?.user;
      if (!user) return;
      await apiFetch(`${col}/records/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ oldPassword, password, passwordConfirm: password }),
      }, token());
      // После смены пароля PocketBase отзывает токены — входим заново.
      await this.login(user.email, password);
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    staff: {
      async list() {
        const r = await apiFetch<{ items: Record<string, unknown>[] }>(`${col}/records?perPage=500&sort=name`, {}, token());
        return r.items.map(toUser);
      },
      async create(input) {
        await apiFetch(`${col}/records`, { method: 'POST', body: body({ ...input, email: input.email }) }, token());
      },
      async update(id, input) {
        await apiFetch(`${col}/records/${id}`, { method: 'PATCH', body: body(input) }, token());
      },
      async remove(id) {
        await apiFetch(`${col}/records/${id}`, { method: 'DELETE' }, token());
      },
    },
  };
}

/* -------------------------------- превью ------------------------------------ */

/** Сессия превью: «смотреть как роль», без пароля; состав — в памяти. */
export function previewSession(schema: ClubSchema, roleId: string | null): Session {
  const listeners = new Set<() => void>();
  const role = roleId ? schema.roles?.find((r) => r.id === roleId) : null;
  let user: StaffUser | null = role ? { id: 'preview', email: 'preview@club', name: role.name, role: role.id } : null;
  const team: StaffUser[] = (schema.roles ?? []).map((r, i) => ({ id: `s${i}`, email: `${r.id}@club.example`, name: r.name, role: r.id }));
  return {
    user: () => user,
    token: () => null,
    async login() {
      user = { id: 'preview', email: 'preview@club', name: schema.roles?.[0]?.name ?? 'Chair', role: CHAIR_ROLE };
      listeners.forEach((l) => l());
    },
    logout() {
      user = null;
      listeners.forEach((l) => l());
    },
    async changePassword() {},
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    staff: {
      list: async () => [...team],
      async create(input) {
        team.push({ id: `s${Date.now()}`, email: input.email ?? '', name: input.name ?? input.email ?? '', role: input.role ?? '' });
      },
      async update(id, input) {
        const s = team.find((x) => x.id === id);
        if (s) Object.assign(s, { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.role ? { role: input.role } : {}) });
      },
      async remove(id) {
        const i = team.findIndex((x) => x.id === id);
        if (i >= 0) team.splice(i, 1);
      },
    },
  };
}
