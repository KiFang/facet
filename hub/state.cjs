/**
 * Facet Hub: состояние хаба (hub.json) — администраторы вуза, политика, приглашения, клубы, журнал.
 * Пароли — scrypt, токены клубов — только хэш, сессии — HMAC-подпись без хранения на сервере.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** Политика по умолчанию: закрытая и осторожная, вуз меняет её в настройках хаба. */
const DEFAULT_POLICY = {
  hubName: 'Клубы университета',
  university: '',
  accent: '#4f46e5',
  /** Кто может подключить клуб: invite — по приглашению, approve — заявка с одобрением, open — любой. */
  joinMode: 'invite',
  /** Что видит вуз: reports — только сводные цифры, full — ещё и вход в админку базы клуба. */
  universityAccess: 'reports',
  /** Публичный список клубов на главной странице хаба. */
  catalogPublic: true,
  /** Клубы могут загружать собственную структуру из редактора Facet OS (а не только шаблоны). */
  allowEditorUpload: true,
  /** Черновые данные при подключении. */
  allowDraftData: true,
  /** Сторонние плагины с кодом (хуки сервера и скрипты портала). Встроенные плагины разрешены всегда. */
  allowCustomPlugins: false,
  /** Изменения, которые удаляют данные, применяются только после одобрения вуза. */
  dangerNeedsApproval: false,
  /** Почта председателя должна быть на этих доменах (пусто — любые). */
  allowedEmailDomains: [],
  maxClubs: 200,
  /** Сколько копий перед обновлениями хранить для каждого клуба. */
  keepBackups: 5,
  /** Сколько строк импорта принимать за один раз. */
  maxSeedRows: 5000,
};

const POLICY_KEYS = Object.keys(DEFAULT_POLICY);

function sanitizePolicy(input, base = DEFAULT_POLICY) {
  const out = { ...base };
  if (!input || typeof input !== 'object') return out;
  for (const key of POLICY_KEYS) {
    if (!(key in input)) continue;
    const v = input[key];
    const def = DEFAULT_POLICY[key];
    if (typeof def === 'boolean') out[key] = !!v;
    else if (typeof def === 'number') {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n) && n >= 0 && n <= 100000) out[key] = n;
    } else if (Array.isArray(def)) {
      const list = Array.isArray(v) ? v : String(v ?? '').split(/[\s,;]+/);
      out[key] = list.map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 50);
    } else if (key === 'joinMode') {
      if (['invite', 'approve', 'open'].includes(v)) out[key] = v;
    } else if (key === 'universityAccess') {
      if (['reports', 'full'].includes(v)) out[key] = v;
    } else if (key === 'accent') {
      if (/^#[0-9a-f]{6}$/i.test(String(v))) out[key] = String(v);
    } else out[key] = String(v ?? '').slice(0, 120);
  }
  return out;
}

/* --------------------------------- crypto ---------------------------------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function checkPassword(password, { salt, hash }) {
  const got = crypto.scryptSync(String(password), salt, 64);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
const randomToken = (prefix, bytes = 24) => `${prefix}${crypto.randomBytes(bytes).toString('base64url')}`;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------------------------------- store ---------------------------------- */

class HubState {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'hub.json');
    fs.mkdirSync(dataDir, { recursive: true });
    this.data = this.load();
  }

  load() {
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      /* первый запуск */
    }
    const data = {
      version: 1,
      secret: raw?.secret || crypto.randomBytes(32).toString('hex'),
      admins: Array.isArray(raw?.admins) ? raw.admins : [],
      policy: sanitizePolicy(raw?.policy),
      invites: Array.isArray(raw?.invites) ? raw.invites : [],
      clubs: Array.isArray(raw?.clubs) ? raw.clubs : [],
      audit: Array.isArray(raw?.audit) ? raw.audit : [],
    };
    return data;
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  log(who, what, slug) {
    this.data.audit.unshift({ at: new Date().toISOString(), who, what, ...(slug ? { slug } : {}) });
    this.data.audit.length = Math.min(this.data.audit.length, 1000);
    this.save();
  }

  get policy() {
    return this.data.policy;
  }

  setPolicy(patch) {
    this.data.policy = sanitizePolicy(patch, this.data.policy);
    this.save();
    return this.data.policy;
  }

  /* --------------------------- администраторы вуза --------------------------- */

  /** Администратор из переменных окружения при запуске: создаётся или получает новый пароль. */
  ensureAdmin(email, password) {
    if (!email || !password) return false;
    const key = String(email).trim().toLowerCase();
    const existing = this.data.admins.find((a) => a.email === key);
    if (existing && checkPassword(password, existing)) return false;
    const record = { email: key, ...hashPassword(password), createdAt: existing?.createdAt ?? new Date().toISOString() };
    this.data.admins = [...this.data.admins.filter((a) => a.email !== key), record];
    this.save();
    return true;
  }

  addAdmin(email, password) {
    const key = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) throw new HubError(400, 'Некорректная почта');
    if (String(password).length < 10) throw new HubError(400, 'Пароль — не короче 10 символов');
    if (this.data.admins.some((a) => a.email === key)) throw new HubError(409, 'Такой администратор уже есть');
    this.data.admins.push({ email: key, ...hashPassword(password), createdAt: new Date().toISOString() });
    this.save();
  }

  removeAdmin(email, self) {
    const key = String(email).trim().toLowerCase();
    if (key === self) throw new HubError(400, 'Нельзя удалить себя');
    if (this.data.admins.length <= 1) throw new HubError(400, 'Должен остаться хотя бы один администратор');
    this.data.admins = this.data.admins.filter((a) => a.email !== key);
    this.save();
  }

  verifyAdmin(email, password) {
    const key = String(email ?? '').trim().toLowerCase();
    const admin = this.data.admins.find((a) => a.email === key);
    // Сравнение выполняется и для несуществующей почты — по времени ответа не отличить.
    const ok = checkPassword(password ?? '', admin ?? { salt: 'x', hash: '00'.repeat(64) });
    return ok && admin ? admin.email : null;
  }

  /** Сессия администратора: email.срок.подпись (12 часов). */
  issueSession(email, ttlMs = 12 * 3600_000) {
    const exp = Date.now() + ttlMs;
    const body = `${Buffer.from(email).toString('base64url')}.${exp}`;
    return `${body}.${crypto.createHmac('sha256', this.data.secret).update(body).digest('base64url')}`;
  }

  readSession(token) {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 3) return null;
    const body = `${parts[0]}.${parts[1]}`;
    const sig = crypto.createHmac('sha256', this.data.secret).update(body).digest('base64url');
    if (!safeEqual(sig, parts[2]) || Number(parts[1]) < Date.now()) return null;
    const email = Buffer.from(parts[0], 'base64url').toString();
    return this.data.admins.some((a) => a.email === email) ? email : null;
  }

  /* ------------------------------- приглашения ------------------------------- */

  createInvite({ note = '', maxUses = 1, days = 14 } = {}, who) {
    const invite = {
      code: randomToken('inv_', 12),
      note: String(note).slice(0, 120),
      maxUses: Math.max(1, Math.min(1000, Math.floor(Number(maxUses) || 1))),
      uses: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + Math.max(1, Math.min(365, Number(days) || 14)) * 86400_000).toISOString(),
      createdBy: who,
    };
    this.data.invites.unshift(invite);
    this.save();
    return invite;
  }

  findInvite(code) {
    const invite = this.data.invites.find((i) => safeEqual(i.code, code ?? ''));
    if (!invite) return null;
    if (invite.uses >= invite.maxUses || Date.parse(invite.expiresAt) < Date.now()) return null;
    return invite;
  }

  useInvite(code) {
    const invite = this.findInvite(code);
    if (invite) {
      invite.uses++;
      this.save();
    }
  }

  removeInvite(code) {
    this.data.invites = this.data.invites.filter((i) => i.code !== code);
    this.save();
  }

  /* ---------------------------------- клубы ---------------------------------- */

  club(slug) {
    return this.data.clubs.find((c) => c.slug === slug) ?? null;
  }

  clubByToken(token) {
    if (!token) return null;
    const hash = sha256(token);
    return this.data.clubs.find((c) => c.tokenHash && safeEqual(c.tokenHash, hash)) ?? null;
  }

  nextPort(base) {
    const used = new Set(this.data.clubs.map((c) => c.port));
    let port = base;
    while (used.has(port)) port++;
    return port;
  }

  addClub(club) {
    this.data.clubs.push(club);
    this.save();
    return club;
  }

  updateClub(slug, patch) {
    const club = this.club(slug);
    if (!club) throw new HubError(404, 'Клуб не найден');
    Object.assign(club, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return club;
  }

  removeClub(slug) {
    this.data.clubs = this.data.clubs.filter((c) => c.slug !== slug);
    this.save();
  }
}

class HubError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

module.exports = { HubState, HubError, DEFAULT_POLICY, sanitizePolicy, hashPassword, checkPassword, sha256, randomToken, safeEqual };
