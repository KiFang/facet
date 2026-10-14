/**
 * Смоук-тест Facet Hub на настоящем PocketBase.
 *
 *   npm run build:hub && node scripts/hub-smoke.mjs --pb /path/to/pocketbase
 *
 * Сценарий: приглашение → подключение клуба из шаблона с черновыми данными → портал через прокси
 * (в браузере) → вход председателя → закрытые пути → обновление из редактора (просмотр, данные под угрозой,
 * применение) → сводка вуза → заявка с одобрением → приостановка → перезапуск хаба → удаление.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const PB = args[args.indexOf('--pb') + 1];
if (!args.includes('--pb') || !PB || !fs.existsSync(PB)) {
  console.error('Укажите путь к PocketBase: --pb /path/to/pocketbase');
  process.exit(1);
}
const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-hub-'));
const ADMIN = { email: 'admin@uni.test', password: 'hub-admin-password' };
let hub = null;
let cookie = '';

function check(cond, msg) {
  if (!cond) throw new Error(`✗ ${msg}`);
  console.log(`✓ ${msg}`);
}

async function startHub() {
  hub = spawn(process.execPath, ['hub/server.cjs'], {
    env: { ...process.env, HUB_DATA: DATA, HUB_PORT: String(PORT), HUB_HOST: '127.0.0.1', PB_BINARY: PB, HUB_ADMIN_EMAIL: ADMIN.email, HUB_ADMIN_PASSWORD: ADMIN.password, HUB_CLUB_PORT_BASE: String(PORT + 1) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  hub.stdout.on('data', (c) => { log += c; });
  hub.stderr.on('data', (c) => { log += c; });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return log;
    } catch {
      /* стартует */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Хаб не запустился:\n${log}`);
}

async function stopHub() {
  if (!hub) return;
  const proc = hub;
  hub = null;
  await new Promise((resolve) => {
    proc.once('exit', resolve);
    proc.kill('SIGTERM');
  });
}

async function api(method, url, { body, token, admin = false } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (admin) headers.cookie = cookie;
  const res = await fetch(`${BASE}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* html */
  }
  if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  await startHub();

  // Вход и приглашение
  check((await api('POST', '/hub/api/login', { body: { email: ADMIN.email, password: 'wrong' } })).status === 401, 'неверный пароль администратора отклонён');
  check((await api('POST', '/hub/api/login', { body: ADMIN })).status === 200 && cookie.startsWith('facet_hub='), 'администратор вуза вошёл');
  check((await api('GET', '/hub/api/admin/state')).status === 401, 'кабинет без входа закрыт');
  const invite = (await api('POST', '/hub/api/admin/invites', { admin: true, body: { note: 'Настолки', maxUses: 1 } })).data;
  check(invite.code?.startsWith('inv_'), 'приглашение создано');

  const chair = { email: 'chair@uni.test', password: 'chair-password', name: 'Аня' };
  check((await api('POST', '/hub/api/join', { body: { invite: 'inv_wrong', slug: 'x-club', name: 'X', chair } })).status === 403, 'без приглашения не подключиться');

  // Подключение из шаблона с черновыми данными
  const joined = await api('POST', '/hub/api/join', { body: { invite: invite.code, slug: 'boardgames', name: 'Клуб настолок', template: 'boardgames', packs: ['cash', 'equipment'], draft: true, chair } });
  check(joined.status === 200 && joined.data.status === 'active' && joined.data.token, `клуб подключён (${joined.data.url})`);
  const token = joined.data.token;
  check((await api('POST', '/hub/api/join', { body: { invite: invite.code, slug: 'other', name: 'Y', chair } })).status === 403, 'одноразовое приглашение больше не действует');

  // Прокси и права
  check((await api('GET', '/c/boardgames')).status === 301, '/c/<клуб> → /c/<клуб>/');
  const html = await api('GET', '/c/boardgames/');
  check(html.status === 200 && String(html.data).includes('src="portal.js"'), 'портал отдаётся через прокси с относительными путями');
  const login = await api('POST', '/c/boardgames/api/collections/staff/auth-with-password', { body: { identity: chair.email, password: chair.password } });
  check(login.status === 200 && login.data.record.role === 'chair', 'председатель входит в систему клуба');
  const staffToken = login.data.token;
  const anon = await api('GET', '/c/boardgames/api/collections/members/records');
  check(anon.data.totalItems === 0, 'без входа записи клуба не видны');
  const members = await api('GET', '/c/boardgames/api/collections/members/records', { token: staffToken });
  check(members.data.totalItems > 0, `черновые данные на месте (${members.data.totalItems} участников)`);
  const cash = await api('GET', '/c/boardgames/api/collections/reg_cash/records', { token: staffToken });
  check(cash.data.totalItems > 0, 'черновые операции проведены в кассу');
  check((await api('GET', '/c/boardgames/_/')).status === 403, 'админка PocketBase закрыта политикой «только отчёты»');
  check((await api('POST', '/c/boardgames/api/collections/_superusers/auth-with-password', { body: { identity: 'a', password: 'b' } })).status === 403, 'вход суперпользователя через прокси закрыт');
  check((await api('POST', '/hub/api/admin/clubs/boardgames/credentials', { admin: true, body: {} })).status === 403, 'вуз не получает пароль базы в режиме «только отчёты»');
  const env = fs.readFileSync(path.join(DATA, 'clubs/boardgames/system/.env'), 'utf8');
  check(!env.includes('FACET_CHAIR_PASSWORD') && !env.includes(chair.password), 'пароль председателя не остался на сервере');

  // Портал в браузере (ловит ошибки сборки portal.js)
  let chromium = null;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch {
    console.log('… Playwright не установлен — проверка в браузере пропущена');
  }
  if (chromium) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/c/boardgames/#/login`);
    await page.locator('input[type=email]').fill(chair.email);
    await page.locator('input[type=password]').fill(chair.password);
    await page.locator('input[type=password]').press('Enter');
    await page.waitForFunction(() => document.body.textContent.includes('Аня'), null, { timeout: 15000 });
    await page.goto(`${BASE}/c/boardgames/#/balances`);
    await page.waitForSelector('[data-reg-total], .fx-balances, table', { timeout: 15000 });
    check(!errors.length, `портал работает в браузере под /c/boardgames/${errors.length ? `: ${errors.join('; ')}` : ''}`);
    await browser.close();
  }

  // Обновление из редактора
  check((await api('GET', '/hub/api/club', { token: 'fct_wrong' })).status === 401, 'чужой ключ отклонён');
  const remote = (await api('GET', '/hub/api/club', { token })).data;
  const schema = JSON.parse(remote.schema);
  schema.entities[0].fields.push({ id: 'hub_note', name: 'Заметка', type: 'text', required: false });
  const dry = await api('POST', '/hub/api/club/update', { token, body: { schema, dryRun: true } });
  check(dry.status === 200 && !dry.data.applied && dry.data.changes.some((c) => c.text.includes('hub_note')), 'просмотр изменений без применения');
  const applied = await api('POST', '/hub/api/club/update', { token, body: { schema } });
  check(applied.data.applied, 'новое поле добавлено в систему клуба');
  const removed = structuredClone(schema);
  removed.entities[0].fields = removed.entities[0].fields.filter((f) => f.id !== 'hub_note');
  check((await api('POST', '/hub/api/club/update', { token, body: { schema: removed } })).status === 409, 'удаление поля требует подтверждения');
  check((await api('POST', '/hub/api/club/update', { token, body: { schema: removed, accept: true } })).data.applied, 'подтверждённое удаление применено');
  const evil = structuredClone(schema);
  evil.plugins = [...(evil.plugins ?? []), { id: 'evil-hook', enabled: true, settings: {}, manifest: { id: 'evil-hook', name: 'Evil', description: 'x', version: '1.0.0', contributes: { serverHook: 'onBootstrap((e) => { e.next(); });' } } }];
  check((await api('POST', '/hub/api/club/update', { token, body: { schema: evil } })).status === 403, 'сторонний плагин с кодом отклонён политикой');

  // Сводка вуза
  const summary = (await api('GET', '/hub/api/admin/summary?days=30', { admin: true })).data.clubs[0];
  check(summary.staff === 1 && summary.sections.length > 0 && summary.registers.some((r) => r.id === 'cash'), 'сводка: разделы, актив, итоги регистров');
  check(!JSON.stringify(summary).includes('Варя'), 'в сводке нет персональных данных');

  // Заявка с одобрением
  await api('PUT', '/hub/api/admin/policy', { admin: true, body: { joinMode: 'approve', allowedEmailDomains: 'uni.test' } });
  check((await api('POST', '/hub/api/join', { body: { slug: 'chess', name: 'Шахматы', template: 'general', chair: { ...chair, email: 'a@gmail.com' } } })).status === 400, 'почта не с домена вуза отклонена');
  const req = await api('POST', '/hub/api/join', { body: { slug: 'chess', name: 'Шахматы', template: 'general', chair: { ...chair, email: 'chess@uni.test' } } });
  check(req.data.status === 'pending', 'заявка клуба ждёт одобрения');
  check((await api('GET', '/c/chess/')).status === 503, 'до одобрения система клуба закрыта');
  check((await api('POST', '/hub/api/admin/clubs/chess/approve', { admin: true, body: {} })).status === 200, 'заявка одобрена');
  check((await api('POST', '/c/chess/api/collections/staff/auth-with-password', { body: { identity: 'chess@uni.test', password: chair.password } })).status === 200, 'после одобрения председатель входит');

  // Приостановка и перезапуск хаба
  await api('POST', '/hub/api/admin/clubs/chess/suspend', { admin: true, body: {} });
  check((await api('GET', '/c/chess/api/health')).status === 503, 'приостановленный клуб недоступен');
  await stopHub();
  await startHub();
  check((await api('GET', '/c/boardgames/api/health')).status === 200, 'после перезапуска хаба клубы снова работают');
  check((await api('GET', '/c/chess/api/health')).status === 503, 'приостановленный клуб не запустился');
  cookie = '';
  await api('POST', '/hub/api/login', { body: ADMIN });
  check((await api('POST', '/hub/api/admin/clubs/chess/delete', { admin: true, body: { confirm: 'wrong' } })).status === 400, 'удаление требует ввести адрес клуба');
  check((await api('POST', '/hub/api/admin/clubs/chess/delete', { admin: true, body: { confirm: 'chess' } })).status === 200 && !fs.existsSync(path.join(DATA, 'clubs/chess')), 'клуб удалён вместе с данными');
  const audit = (await api('GET', '/hub/api/admin/state', { admin: true })).data.audit;
  check(audit.length >= 8, `журнал действий ведётся (${audit.length} записей)`);
}

main()
  .then(async () => {
    await stopHub();
    fs.rmSync(DATA, { recursive: true, force: true });
    console.log('Facet Hub: все проверки пройдены');
  })
  .catch(async (err) => {
    console.error(err.message);
    await stopHub();
    console.error(`Данные оставлены для разбора: ${DATA}`);
    process.exit(1);
  });
