/**
 * Facet Hub: учётные системы клубов. Каждая — отдельный PocketBase на 127.0.0.1 со своей базой
 * в hub-data/clubs/<slug>; наружу они видны только через прокси хаба (/c/<slug>/).
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { LocalServer } = require('../desktop/local-server.cjs');
const { HubError, randomToken, sha256 } = require('./state.cjs');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const RESERVED_SLUGS = new Set(['hub', 'api', 'admin', 'static', 'www', 'new', 'join', 'login']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const randomPassword = () => crypto.randomBytes(18).toString('base64url');

/** Окружение для PocketBase клубов: без секретов самого хаба. */
function clubBaseEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^HUB_/.test(k)) env[k] = v;
  return env;
}

class ClubManager {
  /**
   * @param {{ state: import('./state.cjs').HubState, core: any, dataDir: string, pbBinary: string, portBase: number }} opts
   */
  constructor({ state, core, dataDir, pbBinary, portBase }) {
    this.state = state;
    this.core = core;
    this.clubsDir = path.join(dataDir, 'clubs');
    this.pbBinary = pbBinary;
    this.portBase = portBase;
    this.servers = new Map();
    this.tokens = new Map();
    /** Операции над одним клубом идут по очереди. */
    this.locks = new Map();
    fs.mkdirSync(this.clubsDir, { recursive: true });
  }

  dir(slug) {
    return path.join(this.clubsDir, slug);
  }

  server(slug) {
    let s = this.servers.get(slug);
    if (!s) {
      s = new LocalServer({ baseDir: this.dir(slug), pbBinary: this.pbBinary, baseEnv: clubBaseEnv(), keepBackups: this.state.policy.keepBackups });
      this.servers.set(slug, s);
    }
    s.keepBackups = this.state.policy.keepBackups;
    return s;
  }

  async locked(slug, fn) {
    const prev = this.locks.get(slug) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this.locks.set(slug, next.catch(() => {}));
    return next;
  }

  /** Адрес PocketBase клуба для прокси (или null, если не запущен). */
  target(slug) {
    const s = this.servers.get(slug);
    return s && s.proc && s.port ? { host: '127.0.0.1', port: s.port } : null;
  }

  running(slug) {
    return !!this.target(slug);
  }

  /**
   * После обновления хаба: портал и хуки клуба пересобираются новой версией (структура и данные не меняются).
   * Возвращает true, если файлы изменились.
   */
  async refresh(slug) {
    const base = this.baseline(slug);
    const prepared = this.core.prepareSchema(base.schema);
    if (!prepared.ok) return false;
    const bundle = await this.core.buildUpdateBundle(base, prepared.schema, {}, {});
    if (bundle.diff.ops.length) return false; // структура разошлась — это уже обновление, не обновляем молча
    const system = this.server(slug).systemDir;
    const changed = bundle.files.some((f) => {
      if (!f.path.startsWith('payload/') || f.path.startsWith('payload/.facet/') || f.encoding) return false;
      const target = path.join(system, f.path.slice('payload/'.length));
      return !fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== f.content;
    });
    if (changed) await this.server(slug).apply({ kind: 'update', files: bundle.files });
    return changed;
  }

  async startAll(log = console.log) {
    for (const club of this.state.data.clubs) {
      if (club.status !== 'active') continue;
      try {
        if (await this.locked(club.slug, () => this.refresh(club.slug))) log(`[hub] клуб ${club.slug}: портал обновлён до ${this.core.FACET_VERSION}`);
      } catch (err) {
        log(`[hub] клуб ${club.slug}: не удалось обновить портал: ${err.message}`);
      }
      try {
        await this.server(club.slug).start();
        log(`[hub] клуб ${club.slug} запущен на порту ${this.server(club.slug).port}`);
      } catch (err) {
        log(`[hub] клуб ${club.slug} не запустился: ${err.message}`);
      }
    }
  }

  async stopAll() {
    await Promise.all([...this.servers.values()].map((s) => s.stop()));
  }

  /* ------------------------------- подключение ------------------------------- */

  /** Проверка заявки на подключение: адрес, председатель, структура. Возвращает готовые данные для развёртывания. */
  prepareJoin(body) {
    const policy = this.state.policy;
    const slug = String(body.slug ?? '').trim().toLowerCase();
    if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) throw new HubError(400, 'Адрес клуба: 3–40 латинских букв, цифр и дефисов');
    if (this.state.club(slug) || fs.existsSync(this.dir(slug))) throw new HubError(409, 'Этот адрес уже занят');
    if (this.state.data.clubs.length >= policy.maxClubs) throw new HubError(403, 'В хабе достигнут лимит клубов');

    const chair = body.chair ?? {};
    const email = String(chair.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HubError(400, 'Укажите почту председателя');
    if (policy.allowedEmailDomains.length && !policy.allowedEmailDomains.some((d) => email.endsWith(`@${d}`) || email.endsWith(`.${d}`))) {
      throw new HubError(400, `Почта председателя — на домене ${policy.allowedEmailDomains.join(', ')}`);
    }
    const password = String(chair.password ?? '');
    if (password.length < 8) throw new HubError(400, 'Пароль председателя — не короче 8 символов');

    let schema;
    if (body.schema !== undefined) {
      if (!policy.allowEditorUpload) throw new HubError(403, 'В этом хабе клубы подключаются только из шаблонов');
      const prepared = this.core.prepareSchema(body.schema);
      if (!prepared.ok) throw new HubError(400, 'Структура клуба не прошла проверку', { errors: prepared.errors.slice(0, 20) });
      schema = prepared.schema;
      if (body.name) schema.clubName = String(body.name).slice(0, 80);
    } else {
      schema = this.core.schemaFromTemplate(String(body.template ?? ''), String(body.name ?? ''), Array.isArray(body.packs) ? body.packs : []);
    }
    if (!schema.clubName?.trim()) throw new HubError(400, 'Укажите название клуба');
    this.checkPlugins(schema);

    let seeds = {};
    if (body.draft && policy.allowDraftData) seeds = this.core.draftSeeds(schema);
    else if (body.seeds) seeds = this.limitSeeds(this.core.seedsFrom(body.seeds, schema));

    return {
      slug,
      name: schema.clubName,
      schema,
      seeds,
      secrets: body.secrets && typeof body.secrets === 'object' ? body.secrets : {},
      chair: { email, password, name: String(chair.name ?? '').slice(0, 80) },
    };
  }

  checkPlugins(schema) {
    if (this.state.policy.allowCustomPlugins) return;
    const custom = this.core.customPlugins(schema).filter((p) => p.server || p.portal);
    if (custom.length) {
      throw new HubError(403, `Сторонние плагины с кодом в этом хабе запрещены: ${custom.map((p) => p.name || p.id).join(', ')}. Отключите их или попросите вуз разрешить.`);
    }
  }

  limitSeeds(seeds) {
    let left = this.state.policy.maxSeedRows;
    for (const batch of Object.values(seeds)) {
      batch.rows = batch.rows.slice(0, Math.max(0, left));
      left -= batch.rows.length;
    }
    return seeds;
  }

  /** Создать запись клуба. Для заявки (pending) данные сохраняются до одобрения. */
  register(prepared, status, who) {
    const token = randomToken('fct_', 32);
    const club = {
      slug: prepared.slug,
      name: prepared.name,
      status,
      tokenHash: sha256(token),
      port: this.state.nextPort(this.portBase),
      chairEmail: prepared.chair.email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(this.dir(club.slug), { recursive: true });
    if (status === 'pending') {
      fs.writeFileSync(path.join(this.dir(club.slug), 'request.json'), JSON.stringify(prepared), { mode: 0o600 });
    }
    this.state.addClub(club);
    this.state.log(who, status === 'pending' ? 'заявка на подключение' : 'клуб подключён', club.slug);
    return { club, token };
  }

  /** Развернуть учётную систему клуба: сборка из схемы, база, председатель. */
  async deploy(prepared) {
    return this.locked(prepared.slug, async () => {
      const club = this.state.club(prepared.slug);
      const server = this.server(prepared.slug);
      const bundle = await this.core.buildInstallBundle(prepared.schema, prepared.seeds, { password: randomPassword(), secrets: prepared.secrets });
      const files = bundle.files.map((f) => (f.path === '.env' ? {
        ...f,
        content: `${f.content}\n# Первый председатель клуба (удаляется после запуска)\nFACET_CHAIR_EMAIL=${prepared.chair.email}\nFACET_CHAIR_PASSWORD=${prepared.chair.password.replace(/[\r\n]/g, '')}\nFACET_CHAIR_NAME=${(prepared.chair.name || 'Председатель').replace(/[\r\n]/g, '')}\n`,
      } : f));
      server.saveSettings({ port: club.port, lan: false });
      try {
        await server.apply({ kind: 'install', files });
      } finally {
        this.stripChair(prepared.slug);
        fs.rmSync(path.join(this.dir(prepared.slug), 'request.json'), { force: true });
      }
      return { changes: bundle.diff.changes.length, seeded: bundle.seededRows };
    });
  }

  /** Пароль председателя нужен только первой миграции — после запуска в .env его нет. */
  stripChair(slug) {
    const envFile = path.join(this.server(slug).systemDir, '.env');
    if (!fs.existsSync(envFile)) return;
    const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => !/^FACET_CHAIR_|^# Первый председатель/.test(l));
    fs.writeFileSync(envFile, `${lines.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 });
  }

  async approve(slug) {
    const club = this.state.club(slug);
    if (!club) throw new HubError(404, 'Клуб не найден');
    if (club.status !== 'pending') throw new HubError(400, 'Заявка уже рассмотрена');
    const file = path.join(this.dir(slug), 'request.json');
    if (!fs.existsSync(file)) throw new HubError(500, 'Данные заявки потеряны — попросите клуб подать её заново');
    const prepared = JSON.parse(fs.readFileSync(file, 'utf8'));
    const result = await this.deploy(prepared);
    this.state.updateClub(slug, { status: 'active' });
    return result;
  }

  /* -------------------------------- обновление ------------------------------- */

  baseline(slug) {
    const file = path.join(this.server(slug).systemDir, 'club-schema.json');
    if (!fs.existsSync(file)) throw new HubError(409, 'Система клуба ещё не развёрнута');
    const raw = fs.readFileSync(file, 'utf8');
    return { schema: JSON.parse(raw), raw, source: 'file', at: fs.statSync(file).mtime.toISOString() };
  }

  /**
   * Обновление структуры из редактора. dryRun — только список изменений.
   * Изменения, удаляющие данные, требуют accept (и одобрения вуза, если так настроено).
   */
  async update(slug, body) {
    const club = this.state.club(slug);
    if (!club) throw new HubError(404, 'Клуб не найден');
    if (club.status !== 'active') throw new HubError(409, club.status === 'pending' ? 'Заявка клуба ещё не одобрена' : 'Клуб приостановлен вузом');
    if (!this.state.policy.allowEditorUpload) throw new HubError(403, 'В этом хабе структура клубов меняется только вузом');
    const prepared = this.core.prepareSchema(body.schema);
    if (!prepared.ok) throw new HubError(400, 'Структура клуба не прошла проверку', { errors: prepared.errors.slice(0, 20) });
    const schema = prepared.schema;
    this.checkPlugins(schema);
    const seeds = body.seeds ? this.limitSeeds(this.core.seedsFrom(body.seeds, schema)) : {};

    return this.locked(slug, async () => {
      const base = this.baseline(slug);
      const bundle = await this.core.buildUpdateBundle(base, schema, seeds, { secrets: body.secrets && typeof body.secrets === 'object' ? body.secrets : {} });
      const changes = this.core.describeChanges(bundle.diff.changes, body.locale === 'en' ? 'en' : 'ru');
      const danger = bundle.diff.changes.some((c) => c.severity === 'danger');
      const same = base.raw === this.core.generateSchemaJson(schema) && !bundle.seededRows;
      const preview = { changes, danger, seeded: bundle.seededRows, same };
      if (body.dryRun || same) return { ...preview, applied: false };
      if (danger && !body.accept) throw new HubError(409, 'Обновление удалит данные — подтвердите его', preview);
      if (danger && this.state.policy.dangerNeedsApproval) {
        throw new HubError(403, 'Изменения, удаляющие данные, в этом хабе применяет вуз — напишите администратору хаба', preview);
      }
      await this.server(slug).apply({ kind: 'update', files: bundle.files });
      this.state.updateClub(slug, { name: schema.clubName });
      return { ...preview, applied: true };
    });
  }

  async rollback(slug) {
    return this.locked(slug, () => this.server(slug).rollback());
  }

  async suspend(slug) {
    await this.locked(slug, () => this.server(slug).stop());
    this.state.updateClub(slug, { status: 'suspended' });
  }

  async resume(slug) {
    await this.locked(slug, () => this.server(slug).start());
    this.state.updateClub(slug, { status: 'active' });
  }

  async remove(slug) {
    await this.locked(slug, async () => {
      await this.server(slug).stop();
      this.servers.delete(slug);
      fs.rmSync(this.dir(slug), { recursive: true, force: true });
    });
    this.tokens.delete(slug);
    this.state.removeClub(slug);
  }

  /** Новый ключ редактора (старый перестаёт работать). */
  rotateToken(slug) {
    const token = randomToken('fct_', 32);
    this.state.updateClub(slug, { tokenHash: sha256(token) });
    return token;
  }

  credentials(slug) {
    const env = this.server(slug).env();
    return env.PB_ADMIN_EMAIL ? { email: env.PB_ADMIN_EMAIL, password: env.PB_ADMIN_PASSWORD } : null;
  }

  /* ------------------------------- сводка для вуза ----------------------------- */

  async pb(slug, pathname, { method = 'GET', body } = {}) {
    const target = this.target(slug);
    if (!target) throw new HubError(503, 'Система клуба не запущена');
    const headers = { 'content-type': 'application/json' };
    if (!pathname.includes('auth-with-password')) headers.authorization = await this.superToken(slug);
    const res = await fetch(`http://${target.host}:${target.port}${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new HubError(502, `PocketBase клуба: ${data.message || res.status}`);
    return data;
  }

  async superToken(slug) {
    const cached = this.tokens.get(slug);
    if (cached && cached.exp > Date.now()) return cached.token;
    const creds = this.credentials(slug);
    if (!creds) throw new HubError(500, 'Нет учётной записи сервера клуба');
    const data = await this.pb(slug, '/api/collections/_superusers/auth-with-password', { method: 'POST', body: { identity: creds.email, password: creds.password } });
    this.tokens.set(slug, { token: data.token, exp: Date.now() + 10 * 60_000 });
    return data.token;
  }

  /**
   * Только сводные цифры: сколько записей в разделах, сколько новых за период, итоги регистров.
   * Сами записи (ФИО, суммы по людям) вуз здесь не получает.
   */
  async summary(slug, days = 30) {
    const club = this.state.club(slug);
    const base = { slug, name: club?.name ?? slug, status: club?.status ?? 'unknown', running: this.running(slug) };
    if (!club || club.status !== 'active' || !this.running(slug)) return base;
    const schema = this.baseline(slug).schema;
    const since = new Date(Date.now() - days * 86400_000).toISOString().replace('T', ' ');
    const q = (filter) => `?perPage=1&skipTotal=0&fields=id${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`;
    const sections = [];
    let lastActivity = '';
    for (const e of schema.entities) {
      const col = `/api/collections/${encodeURIComponent(e.id)}/records`;
      const [all, fresh, last] = await Promise.all([
        this.pb(slug, `${col}${q('')}`),
        this.pb(slug, `${col}${q(`created >= "${since}"`)}`),
        this.pb(slug, `${col}?perPage=1&skipTotal=1&sort=-updated&fields=updated`),
      ]);
      const updated = last.items?.[0]?.updated ?? '';
      if (updated > lastActivity) lastActivity = updated;
      sections.push({ id: e.id, name: e.pluralName || e.name, operation: e.kind === 'operation', total: all.totalItems ?? 0, recent: fresh.totalItems ?? 0 });
    }
    const staff = await this.pb(slug, `/api/collections/${this.core.STAFF_COLLECTION}/records${q('')}`).catch(() => ({ totalItems: 0 }));
    const registers = [];
    for (const reg of schema.registers ?? []) {
      const totals = Object.fromEntries(reg.resources.map((r) => [r.id, 0]));
      const turnover = Object.fromEntries(reg.resources.map((r) => [r.id, { in: 0, out: 0 }]));
      const fields = reg.resources.map((r) => this.core.resColumn(r.id));
      for (let page = 1; page <= 200; page++) {
        const data = await this.pb(slug, `/api/collections/${this.core.regCollection(reg.id)}/records?page=${page}&perPage=500&skipTotal=1&fields=period,${fields.join(',')}`);
        for (const row of data.items ?? []) {
          for (const r of reg.resources) {
            const v = Number(row[this.core.resColumn(r.id)]) || 0;
            totals[r.id] += v;
            if (row.period >= since) turnover[r.id][v >= 0 ? 'in' : 'out'] += Math.abs(v);
          }
        }
        if ((data.items ?? []).length < 500) break;
      }
      registers.push({ id: reg.id, name: reg.name, resources: reg.resources.map((r) => ({ id: r.id, name: r.name, total: round(totals[r.id]), in: round(turnover[r.id].in), out: round(turnover[r.id].out) })) });
    }
    return { ...base, days, staff: staff.totalItems ?? 0, sections, registers, lastActivity, createdAt: club.createdAt };
  }
}

const round = (n) => Math.round(n * 100) / 100;

module.exports = { ClubManager, SLUG_RE };
