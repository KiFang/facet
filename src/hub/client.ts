/** Клиент API Facet Hub для редактора: подключение клуба к хабу вуза и обновление его системы. */
import type { ClubSchema } from '@/types/schema';
import type { SeedBatch } from '@/store/useClubStore';

export interface HubInfo {
  hub: 'facet-hub';
  version: string;
  name: string;
  university: string;
  joinMode: 'invite' | 'approve' | 'open';
  universityAccess: 'reports' | 'full';
  allowEditorUpload: boolean;
  allowDraftData: boolean;
  allowCustomPlugins: boolean;
  allowedEmailDomains: string[];
}

export interface HubLink {
  /** Адрес хаба без завершающего «/». */
  hub: string;
  slug: string;
  token: string;
  name: string;
  url: string;
  status: 'active' | 'pending' | 'suspended';
}

export interface HubChange {
  severity: 'safe' | 'warning' | 'danger';
  text: string;
}

export interface HubUpdateResult {
  changes: HubChange[];
  danger: boolean;
  seeded: number;
  same: boolean;
  applied: boolean;
}

export class HubError extends Error {
  constructor(public status: number, message: string, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

/** «univer.ru/clubs» → «https://univer.ru/clubs». */
export function normalizeHubUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '').replace(/\/hub(\/.*)?$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `${/^(localhost|127\.|\[::1\])/.test(url) ? 'http' : 'https'}://${url}`;
  return url;
}

async function call<T>(hub: string, path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body) headers['content-type'] = 'application/json';
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let res: Response;
  try {
    res = await fetch(`${hub}${path}`, { ...init, headers });
  } catch {
    throw new HubError(0, 'unreachable');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errors = Array.isArray(data.errors) ? `: ${(data.errors as string[]).join('; ')}` : '';
    throw new HubError(res.status, `${String(data.message ?? res.status)}${errors}`, data);
  }
  return data as T;
}

export async function hubInfo(hub: string): Promise<HubInfo> {
  const info = await call<HubInfo>(hub, '/hub/api/info');
  if (info.hub !== 'facet-hub') throw new HubError(0, 'not-a-hub');
  return info;
}

const seedRows = (seeds: Record<string, SeedBatch>) => Object.fromEntries(Object.entries(seeds).map(([id, b]) => [id, b.rows]));

export async function joinHub(
  hub: string,
  opts: { invite: string; slug: string; schema: ClubSchema; seeds: Record<string, SeedBatch>; secrets: Record<string, Record<string, string>>; chair: { name: string; email: string; password: string } },
): Promise<HubLink> {
  const res = await call<{ slug: string; name: string; status: HubLink['status']; token: string; url: string }>(hub, '/hub/api/join', {
    method: 'POST',
    body: JSON.stringify({ invite: opts.invite, slug: opts.slug, name: opts.schema.clubName, schema: opts.schema, seeds: seedRows(opts.seeds), secrets: opts.secrets, chair: opts.chair }),
  });
  return { hub, slug: res.slug, token: res.token, name: res.name, url: res.url, status: res.status };
}

export async function linkByToken(hub: string, token: string): Promise<HubLink & { schema: string | null }> {
  const res = await call<{ slug: string; name: string; status: HubLink['status']; url: string; schema: string | null }>(hub, '/hub/api/club', { token });
  return { hub, token, slug: res.slug, name: res.name, url: res.url, status: res.status, schema: res.schema };
}

export function updateInHub(
  link: HubLink,
  opts: { schema: ClubSchema; seeds?: Record<string, SeedBatch>; secrets: Record<string, Record<string, string>>; dryRun: boolean; accept?: boolean; locale: 'ru' | 'en' },
): Promise<HubUpdateResult> {
  return call<HubUpdateResult>(link.hub, '/hub/api/club/update', {
    method: 'POST',
    token: link.token,
    body: JSON.stringify({ schema: opts.schema, seeds: opts.seeds ? seedRows(opts.seeds) : undefined, secrets: opts.secrets, dryRun: opts.dryRun, accept: opts.accept, locale: opts.locale }),
  });
}
