#!/usr/bin/env node
/**
 * Facet Hub — сервер клубов вуза.
 *
 *   /                  главная: клубы и кнопка «Подключить клуб»
 *   /hub/join          подключение клуба по приглашению (шаблон + черновые данные)
 *   /hub/admin         кабинет вуза: клубы, заявки, приглашения, сводка, настройки
 *   /hub/api/*         API (редактор Facet OS подключается и обновляет систему клуба по ключу)
 *   /c/<клуб>/*        учётная система клуба (прокси на её PocketBase)
 *
 * Переменные окружения: HUB_ADMIN_EMAIL, HUB_ADMIN_PASSWORD (первый администратор),
 * HUB_DATA (папка данных), HUB_PORT, HUB_HOST, HUB_PUBLIC_URL, HUB_CLUB_PORT_BASE, PB_BINARY, HUB_TRUST_PROXY.
 */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { HubState, HubError } = require('./state.cjs');
const { ClubManager } = require('./clubs.cjs');

const ROOT = __dirname;
const DATA = path.resolve(process.env.HUB_DATA || path.join(ROOT, '..', 'hub-data'));
const PORT = Number(process.env.HUB_PORT || 8080);
const HOST = process.env.HUB_HOST || '0.0.0.0';
const PUBLIC_URL = (process.env.HUB_PUBLIC_URL || '').replace(/\/+$/, '');
const TRUST_PROXY = process.env.HUB_TRUST_PROXY === '1';
const PB_BINARY = process.env.PB_BINARY || path.join(ROOT, '..', 'desktop', 'bin', `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'}-${process.arch}`, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const MAX_BODY = 12 * 1024 * 1024;
const COOKIE = 'facet_hub';

let core;
try {
  core = require('./dist/core.cjs');
} catch {
  console.error('Не найдено ядро хаба (hub/dist/core.cjs). Соберите его: npm run build:hub');
  process.exit(1);
}

const state = new HubState(DATA);
if (state.ensureAdmin(process.env.HUB_ADMIN_EMAIL, process.env.HUB_ADMIN_PASSWORD)) {
  console.log(`[hub] администратор: ${process.env.HUB_ADMIN_EMAIL}`);
}
if (!state.data.admins.length) console.warn('[hub] нет ни одного администратора — задайте HUB_ADMIN_EMAIL и HUB_ADMIN_PASSWORD');
const clubs = new ClubManager({ state, core, dataDir: DATA, pbBinary: PB_BINARY, portBase: Number(process.env.HUB_CLUB_PORT_BASE || 9100) });

/* --------------------------------- helpers --------------------------------- */

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
const HUB_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress ?? '';
}

const isHttps = (req) => (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https') || !!req.socket.encrypted;

function originOf(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = isHttps(req) ? 'https' : 'http';
  return `${proto}://${req.headers.host ?? `localhost:${PORT}`}`;
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HubError(413, 'Слишком большой запрос'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HubError(400, 'Некорректный JSON'));
      }
    });
    req.on('error', reject);
  });
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Простой лимит попыток: ключ → окно 10 минут. */
const attempts = new Map();
function rateLimit(key, max) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + 10 * 60_000 });
    return;
  }
  entry.count++;
  if (entry.count > max) throw new HubError(429, 'Слишком много попыток — подождите 10 минут');
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
}, 60_000).unref();

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ------------------------------ статика хаба ------------------------------- */

const STATIC = {
  'hub.css': 'text/css; charset=utf-8',
  'admin.js': 'text/javascript; charset=utf-8',
  'join.js': 'text/javascript; charset=utf-8',
};

function page(res, file, vars = {}) {
  let html = fs.readFileSync(path.join(ROOT, 'web', file), 'utf8');
  const policy = state.policy;
  const all = { hubName: policy.hubName, university: policy.university, accent: policy.accent, version: core.FACET_VERSION, ...vars };
  html = html.replace(/\{\{(\w+)\}\}/g, (_, k) => escapeHtml(all[k] ?? ''));
  html = html.replace(/<!--raw:(\w+)-->/g, (_, k) => vars[`raw_${k}`] ?? '');
  send(res, 200, html, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': HUB_CSP });
}

function landing(req, res) {
  const policy = state.policy;
  const active = state.data.clubs.filter((c) => c.status === 'active').sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const list = policy.catalogPublic && active.length
    ? `<ul class="clubs">${active.map((c) => `<li><a href="/c/${escapeHtml(c.slug)}/"><span class="dot"></span><span><b>${escapeHtml(c.name)}</b><small>/c/${escapeHtml(c.slug)}/</small></span></a></li>`).join('')}</ul>`
    : `<p class="muted">${policy.catalogPublic ? 'Пока ни один клуб не подключён.' : 'Адрес своей системы клуб получает при подключении.'}</p>`;
  page(res, 'index.html', {
    raw_clubs: list,
    joinHint: { invite: 'Подключение — по приглашению вуза.', approve: 'Заявку клуба одобряет вуз.', open: 'Подключиться может любой клуб.' }[policy.joinMode],
  });
}

/* ---------------------------------- API ------------------------------------ */

function requireAdmin(req) {
  const email = state.readSession(cookies(req)[COOKIE]);
  if (!email) throw new HubError(401, 'Войдите как администратор хаба');
  return email;
}

function requireClub(req) {
  const auth = String(req.headers.authorization ?? '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const club = state.clubByToken(token);
  if (!club) throw new HubError(401, 'Неверный ключ клуба');
  return club;
}

const clubUrl = (req, slug) => `${originOf(req)}/c/${slug}/`;

function publicInfo() {
  const p = state.policy;
  return {
    hub: 'facet-hub',
    version: core.FACET_VERSION,
    name: p.hubName,
    university: p.university,
    accent: p.accent,
    joinMode: p.joinMode,
    universityAccess: p.universityAccess,
    allowEditorUpload: p.allowEditorUpload,
    allowDraftData: p.allowDraftData,
    allowCustomPlugins: p.allowCustomPlugins,
    allowedEmailDomains: p.allowedEmailDomains,
  };
}

function clubView(c) {
  return {
    slug: c.slug,
    name: c.name,
    status: c.status,
    chairEmail: c.chairEmail,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    running: clubs.running(c.slug),
    backups: c.status === 'pending' ? [] : clubs.server(c.slug).backups().slice(0, 10),
  };
}

const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, pattern, handler, ...opts });

// Публичное (CORS: редактор Facet OS работает с другого адреса)
route('GET', /^\/hub\/api\/info$/, () => publicInfo(), { cors: true });
route('GET', /^\/hub\/api\/catalog$/, () => ({ ...core.catalog(), policy: publicInfo() }), { cors: true });

route('POST', /^\/hub\/api\/join$/, async (req) => {
  const ip = clientIp(req);
  rateLimit(`join:${ip}`, 20);
  const body = await readJson(req);
  const policy = state.policy;
  let invite = null;
  if (policy.joinMode === 'invite') {
    invite = state.findInvite(body.invite);
    if (!invite) throw new HubError(403, 'Приглашение не найдено или уже использовано');
  }
  const prepared = clubs.prepareJoin(body);
  const status = policy.joinMode === 'approve' ? 'pending' : 'active';
  const { club, token } = clubs.register(prepared, status, `клуб (${prepared.chair.email})`);
  if (invite) state.useInvite(invite.code);
  if (status === 'active') {
    try {
      await clubs.deploy(prepared);
    } catch (err) {
      await clubs.remove(club.slug).catch(() => {});
      throw new HubError(500, `Не удалось развернуть систему клуба: ${err.message.split('\n')[0]}`);
    }
  }
  return { slug: club.slug, name: club.name, status, token, url: clubUrl(req, club.slug), hub: originOf(req) };
}, { cors: true });

// Ключ клуба (редактор)
route('GET', /^\/hub\/api\/club$/, (req) => {
  const club = requireClub(req);
  let schema = null;
  try {
    schema = club.status === 'active' ? clubs.baseline(club.slug).raw : null;
  } catch {
    /* ещё не развёрнут */
  }
  return { slug: club.slug, name: club.name, status: club.status, url: clubUrl(req, club.slug), schema, policy: publicInfo() };
}, { cors: true });

route('POST', /^\/hub\/api\/club\/update$/, async (req) => {
  const club = requireClub(req);
  const body = await readJson(req);
  const result = await clubs.update(club.slug, body);
  if (result.applied) state.log(`клуб (${club.slug})`, 'структура обновлена из редактора', club.slug);
  return result;
}, { cors: true });

// Вход администратора вуза
route('POST', /^\/hub\/api\/login$/, async (req, res) => {
  rateLimit(`login:${clientIp(req)}`, 10);
  const body = await readJson(req);
  const email = state.verifyAdmin(body.email, body.password);
  if (!email) throw new HubError(401, 'Неверная почта или пароль');
  const token = state.issueSession(email);
  res.setHeader('set-cookie', `${COOKIE}=${token}; Path=/hub; HttpOnly; SameSite=Strict; Max-Age=43200${isHttps(req) ? '; Secure' : ''}`);
  state.log(email, 'вход в кабинет');
  return { email };
});

route('POST', /^\/hub\/api\/logout$/, (req, res) => {
  res.setHeader('set-cookie', `${COOKIE}=; Path=/hub; HttpOnly; SameSite=Strict; Max-Age=0`);
  return { ok: true };
});

// Кабинет вуза
route('GET', /^\/hub\/api\/admin\/state$/, (req) => {
  const me = requireAdmin(req);
  return {
    me,
    version: core.FACET_VERSION,
    policy: state.policy,
    admins: state.data.admins.map((a) => ({ email: a.email, createdAt: a.createdAt })),
    invites: state.data.invites,
    clubs: state.data.clubs.map(clubView),
    audit: state.data.audit.slice(0, 200),
    origin: originOf(req),
  };
});

route('PUT', /^\/hub\/api\/admin\/policy$/, async (req) => {
  const me = requireAdmin(req);
  const policy = state.setPolicy(await readJson(req));
  state.log(me, 'настройки хаба изменены');
  return policy;
});

route('POST', /^\/hub\/api\/admin\/admins$/, async (req) => {
  const me = requireAdmin(req);
  const body = await readJson(req);
  state.addAdmin(body.email, body.password);
  state.log(me, `добавлен администратор ${body.email}`);
  return { ok: true };
});

route('DELETE', /^\/hub\/api\/admin\/admins\/([^/]+)$/, (req, res, [email]) => {
  const me = requireAdmin(req);
  state.removeAdmin(decodeURIComponent(email), me);
  state.log(me, `удалён администратор ${decodeURIComponent(email)}`);
  return { ok: true };
});

route('POST', /^\/hub\/api\/admin\/invites$/, async (req) => {
  const me = requireAdmin(req);
  const invite = state.createInvite(await readJson(req), me);
  state.log(me, `создано приглашение${invite.note ? ` «${invite.note}»` : ''}`);
  return { ...invite, link: `${originOf(req)}/hub/join?invite=${invite.code}` };
});

route('DELETE', /^\/hub\/api\/admin\/invites\/([\w-]+)$/, (req, res, [code]) => {
  const me = requireAdmin(req);
  state.removeInvite(code);
  state.log(me, 'приглашение отозвано');
  return { ok: true };
});

const clubAction = (name, fn, what) => route('POST', new RegExp(`^/hub/api/admin/clubs/([a-z0-9-]+)/${name}$`), async (req, res, [slug]) => {
  const me = requireAdmin(req);
  if (!state.club(slug)) throw new HubError(404, 'Клуб не найден');
  const body = await readJson(req);
  const result = await fn(slug, body, me, req);
  state.log(me, what, slug);
  return result ?? { ok: true };
});

clubAction('approve', (slug) => clubs.approve(slug), 'заявка одобрена');
clubAction('reject', async (slug) => clubs.remove(slug), 'заявка отклонена');
clubAction('suspend', (slug) => clubs.suspend(slug), 'клуб приостановлен');
clubAction('resume', (slug) => clubs.resume(slug), 'клуб возобновлён');
clubAction('rollback', async (slug) => {
  await clubs.rollback(slug);
  return { ok: true };
}, 'откат последнего обновления');
clubAction('token', (slug) => ({ token: clubs.rotateToken(slug) }), 'выдан новый ключ редактора');
clubAction('delete', async (slug, body) => {
  const club = state.club(slug);
  if (body.confirm !== club.slug) throw new HubError(400, 'Для удаления введите адрес клуба');
  await clubs.remove(slug);
}, 'клуб удалён вместе с данными');
clubAction('credentials', (slug) => {
  if (state.policy.universityAccess !== 'full') throw new HubError(403, 'Политика хаба: вузу доступны только сводные отчёты');
  return { ...clubs.credentials(slug), adminUrl: `/c/${slug}/_/` };
}, 'открыт полный доступ к базе клуба');

route('GET', /^\/hub\/api\/admin\/summary$/, async (req) => {
  requireAdmin(req);
  const days = Math.max(1, Math.min(365, Number(new URL(req.url, 'http://x').searchParams.get('days')) || 30));
  const out = [];
  for (const c of state.data.clubs) {
    try {
      out.push(await clubs.summary(c.slug, days));
    } catch (err) {
      out.push({ slug: c.slug, name: c.name, status: c.status, error: err.message });
    }
  }
  return { days, clubs: out, at: new Date().toISOString() };
});

/* ---------------------------------- прокси ---------------------------------- */

/** Пути PocketBase, которые закрыты снаружи (кроме режима полного доступа вуза). */
function blockedPath(p) {
  return /^\/_(\/|$)/.test(p) || /^\/api\/collections\/_superusers\//.test(p) || /^\/api\/(backups|settings|logs|crons)(\/|$)/.test(p);
}

function proxy(req, res, slug, rest) {
  const club = state.club(slug);
  if (!club) return send(res, 404, notFound('Такого клуба в хабе нет.'), { 'content-type': 'text/html; charset=utf-8' });
  if (club.status !== 'active') {
    return send(res, 503, notFound(club.status === 'pending' ? 'Заявка клуба ещё на рассмотрении у вуза.' : 'Система клуба временно приостановлена вузом.'), { 'content-type': 'text/html; charset=utf-8' });
  }
  if (blockedPath(rest) && state.policy.universityAccess !== 'full') {
    return send(res, 403, { message: 'Закрыто политикой хаба' });
  }
  const target = clubs.target(slug);
  if (!target) return send(res, 503, notFound('Система клуба запускается — обновите страницу через минуту.'), { 'content-type': 'text/html; charset=utf-8' });

  const headers = { ...req.headers };
  delete headers.cookie; // куки хаба клубу не нужны
  headers['x-forwarded-for'] = clientIp(req);
  headers['x-forwarded-proto'] = isHttps(req) ? 'https' : 'http';
  headers['x-forwarded-prefix'] = `/c/${slug}`;
  const upstream = http.request({ host: target.host, port: target.port, method: req.method, path: rest, headers }, (up) => {
    const out = { ...up.headers };
    if (typeof out.location === 'string' && out.location.startsWith('/')) out.location = `/c/${slug}${out.location}`;
    delete out['set-cookie'];
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!(k in out)) out[k] = v;
    res.writeHead(up.statusCode ?? 502, out);
    up.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) send(res, 502, { message: 'Система клуба не отвечает' });
    else res.destroy();
  });
  req.pipe(upstream);
}

function notFound(text) {
  const p = state.policy;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(p.hubName)}</title><link rel="stylesheet" href="/hub/static/hub.css"></head><body><main class="narrow"><h1>${escapeHtml(p.hubName)}</h1><p>${escapeHtml(text)}</p><p><a href="/">← Все клубы</a></p></main></body></html>`;
}

/* --------------------------------- роутинг --------------------------------- */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '600',
};

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://hub');
  const p = url.pathname;

  const club = /^\/c\/([a-z0-9-]+)(\/.*)?$/.exec(p);
  if (club) {
    if (!club[2]) return send(res, 301, '', { location: `/c/${club[1]}/${url.search}` });
    return proxy(req, res, club[1], `${club[2]}${url.search}`);
  }

  if (req.method === 'GET' && p === '/') return landing(req, res);
  if (req.method === 'GET' && (p === '/hub/admin' || p === '/hub/admin/')) return page(res, 'admin.html');
  if (req.method === 'GET' && (p === '/hub/join' || p === '/hub/join/')) return page(res, 'join.html');
  if (req.method === 'GET' && p === '/healthz') return send(res, 200, { ok: true, clubs: state.data.clubs.length });
  const stat = /^\/hub\/static\/([\w.-]+)$/.exec(p);
  if (req.method === 'GET' && stat && STATIC[stat[1]]) {
    return send(res, 200, fs.readFileSync(path.join(ROOT, 'web', stat[1])), { 'content-type': STATIC[stat[1]], 'cache-control': 'no-cache' });
  }

  if (p.startsWith('/hub/api/')) {
    const matches = routes.filter((r) => r.pattern.test(p));
    if (req.method === 'OPTIONS' && matches.some((r) => r.cors)) return send(res, 204, '', CORS);
    const r = matches.find((x) => x.method === req.method);
    if (!r) return send(res, matches.length ? 405 : 404, { message: 'Нет такого метода API' });
    const extra = r.cors ? CORS : {};
    // Защита от CSRF для кабинета: только запросы со своей страницы.
    if (!r.cors && req.method !== 'GET') {
      const origin = req.headers.origin;
      let host = null;
      try {
        host = origin ? new URL(origin).host : req.headers.host;
      } catch {
        /* «null» и прочее — чужой источник */
      }
      if (host !== req.headers.host && origin !== originOf(req)) return send(res, 403, { message: 'Чужой источник запроса' });
    }
    try {
      const result = await r.handler(req, res, r.pattern.exec(p).slice(1));
      return send(res, 200, result ?? { ok: true }, extra);
    } catch (err) {
      const status = err instanceof HubError ? err.status : 500;
      if (status === 500) console.error('[hub]', err);
      return send(res, status, { message: err.message, ...(err.extra ?? {}) }, extra);
    }
  }

  send(res, 404, notFound('Страница не найдена.'), { 'content-type': 'text/html; charset=utf-8' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('[hub]', err);
    if (!res.headersSent) send(res, 500, { message: 'Внутренняя ошибка хаба' });
  });
});
server.requestTimeout = 0; // realtime PocketBase держит соединение открытым
server.headersTimeout = 60_000;

async function main() {
  await clubs.startAll();
  server.listen(PORT, HOST, () => console.log(`[hub] Facet Hub ${core.FACET_VERSION}: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (данные: ${DATA})`));
}

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  await clubs.stopAll();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
