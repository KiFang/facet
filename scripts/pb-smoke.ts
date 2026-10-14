/**
 * Интеграционная проверка экспорта на настоящем PocketBase (без Docker).
 *
 *   npx vite-node scripts/pb-smoke.ts -- --pb /path/to/pocketbase [--keep]
 *
 * 1. Каждый пресет: установка → миграции → проверка коллекций, прав, хуков, портала, импорта данных.
 * 2. Обновление: реальные данные + переименования/смена типов/удаления/перестановка имён/
 *    переименование раздела/новый раздел с импортом → миграция обновления → данные целы.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPresetSchema } from '@/data/presets';
import { buildInstallBundle, buildUpdateBundle, generateSchemaJson, type ExportBundle } from '@/utils/exporter';
import { normalizeSchema } from '@/utils/normalize';
import { toPhysical } from '@/utils/migrations/physical';
import { useClubStore, type SeedBatch } from '@/store/useClubStore';
import type { ClubSchema, PresetId } from '@/types/schema';
import { writeBundle } from './lib';
import { serverSource } from '@/datagrid/sources';

const args = process.argv.slice(2).filter((a) => a !== '--');
const PB = path.resolve(args[args.indexOf('--pb') + 1] ?? '');
const KEEP = args.includes('--keep');
if (!fs.existsSync(PB)) {
  console.error('Укажите путь к бинарнику PocketBase: --pb /path/to/pocketbase');
  process.exit(1);
}

const PASSWORD = 'smoke-password-123';
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-smoke-'));
let failures = 0;
let port = 18090;

function check(cond: unknown, message: string) {
  if (cond) console.log(`  ✓ ${message}`);
  else {
    failures++;
    console.log(`  ✗ ${message}`);
  }
}

const seedBatch = (entityId: string, rows: Record<string, string>[]): SeedBatch => ({ entityId, rows, source: 'smoke', importedAt: '' });

interface Server {
  url: string;
  proc: ChildProcess;
  token: string;
  log: () => string;
}

function env(bundleRoot: string): NodeJS.ProcessEnv {
  const vars: Record<string, string> = Object.fromEntries(
    fs.readFileSync(path.join(bundleRoot, '.env'), 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
  );
  return { ...process.env, ...vars, FACET_CLUB_NAME: 'Smoke Club' };
}

function migrate(root: string, dataDir: string) {
  execFileSync(PB, ['migrate', 'up', `--dir=${dataDir}`, `--migrationsDir=${path.join(root, 'pocketbase/pb_migrations')}`], {
    env: env(root),
    stdio: 'pipe',
  });
}

async function serve(root: string, dataDir: string): Promise<Server> {
  const pub = path.join(WORK, `pub-${port}`);
  fs.cpSync(path.join(root, 'web'), pub, { recursive: true });
  fs.copyFileSync(path.join(root, 'club-schema.json'), path.join(pub, 'club-schema.json'));
  const url = `http://127.0.0.1:${port++}`;
  let output = '';
  const proc = spawn(PB, [
    'serve', `--http=${url.slice(7)}`, `--dir=${dataDir}`,
    `--migrationsDir=${path.join(root, 'pocketbase/pb_migrations')}`,
    `--hooksDir=${path.join(root, 'pocketbase/pb_hooks')}`, `--publicDir=${pub}`,
  ], { env: env(root) });
  proc.stdout.on('data', (d) => (output += d));
  proc.stderr.on('data', (d) => (output += d));
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch {
      /* ещё стартует */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const auth = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: env(root).PB_ADMIN_EMAIL, password: PASSWORD }),
  }).then((r) => r.json() as Promise<{ token?: string }>);
  if (!auth.token) throw new Error(`Не удалось войти суперпользователем:\n${output}`);
  return { url, proc, token: auth.token, log: () => output };
}

async function api<T = any>(s: Server, method: string, p: string, body?: unknown, anonymous = false): Promise<{ status: number; data: T }> {
  const res = await fetch(s.url + p, {
    method,
    headers: { 'content-type': 'application/json', ...(anonymous ? {} : { Authorization: s.token }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T };
}

const list = async (s: Server, c: string, extra = '') =>
  (await api<{ items: any[] }>(s, 'GET', `/api/collections/${c}/records?perPage=500${extra}`)).data.items;

async function checkStructure(s: Server, schema: ClubSchema) {
  const cols = (await api<{ items: any[] }>(s, 'GET', '/api/collections?perPage=200')).data.items;
  for (const pc of toPhysical(schema)) {
    const col = cols.find((c) => c.name === pc.name);
    check(col, `коллекция ${pc.name} существует`);
    if (!col) continue;
    for (const pf of pc.fields) {
      const f = col.fields.find((x: any) => x.name === pf.name);
      const ok = f && f.type === pf.type && !!f.required === pf.required &&
        (pf.values === undefined || JSON.stringify(f.values) === JSON.stringify(pf.values)) &&
        (pf.type !== 'relation' || (f.maxSelect || 1) === pf.maxSelect);
      check(ok, `  ${pc.name}.${pf.name}: ${pf.type}${pf.required ? ', обяз.' : ''}${pf.maxSelect && pf.maxSelect > 1 ? `, max ${pf.maxSelect}` : ''}`);
    }
    const extra = col.fields.filter((f: any) => !f.system && !['id', 'created', 'updated'].includes(f.name) && !pc.fields.some((pf) => pf.name === f.name));
    check(!extra.length, `  ${pc.name}: нет лишних полей${extra.length ? ` (${extra.map((f: any) => f.name).join(', ')})` : ''}`);
  }
  const stale = cols.filter((c) => !c.system && !['users', 'staff'].includes(c.name) && !c.name.startsWith('reg_') && !schema.entities.some((e) => e.id === c.name));
  check(!stale.length, `нет лишних коллекций${stale.length ? ` (${stale.map((c) => c.name).join(', ')})` : ''}`);
}

function install(bundle: ExportBundle, name: string) {
  const root = writeBundle(bundle, path.join(WORK, name));
  const data = path.join(WORK, name, 'pb_data');
  migrate(root, data);
  return { root, data };
}

/* --------------------------------- presets ---------------------------------- */

async function presets() {
  for (const preset of ['general', 'gaming', 'boardgames', 'media'] as PresetId[]) {
    console.log(`\n▶ Пресет ${preset}`);
    const schema = normalizeSchema({ ...buildPresetSchema(preset), editorMode: 'easy' });
    const seeds: Record<string, SeedBatch> = preset === 'general'
      ? {
          members: seedBatch('members', [
            { full_name: 'Аня Морозова', role: 'Президент', joined_at: '01.09.2025' },
            { full_name: 'Тимур Галиев', role: 'медиа', telegram: '@timur' },
            { full_name: 'Без роли', role: 'Неизвестная роль' },
          ]),
          events: seedBatch('events', [
            { title: 'Кикофф', starts_at: '20.10.2026 18:30', status: 'Запланировано', capacity: '1 200', members: 'Аня Морозова; Тимур Галиев' },
          ]),
        }
      : {};
    const bundle = await buildInstallBundle(schema, seeds, { password: PASSWORD });
    const { root, data } = install(bundle, preset);
    const s = await serve(root, data);
    try {
      await checkStructure(s, schema);
      const first = schema.entities[0].id;
      check((await api(s, 'GET', `/api/collections/${first}/records`, undefined, true)).status === 200, 'аноним читает записи');
      check((await api(s, 'POST', `/api/collections/${first}/records`, {}, true)).status >= 400, 'аноним не может создавать записи');
      const settings = (await api<any>(s, 'GET', '/api/settings')).data;
      check(settings.backups?.cron === '0 3 * * *' && settings.backups?.cronMaxKeep === 14, 'хук применил расписание бэкапов');
      check(settings.meta?.appName === 'Smoke Club', 'хук применил имя клуба');
      check(settings.trustedProxy?.headers?.includes('X-Real-IP'), 'хук доверяет X-Real-IP от Nginx');
      const index = await fetch(`${s.url}/`).then((r) => r.text());
      check(index.includes('/portal.js'), 'портал отдаётся');
      check((await fetch(`${s.url}/portal.js`)).ok, 'portal.js отдаётся');
      if (preset === 'general') {
        const members = await list(s, 'members');
        check(members.length === 2, `импорт: 2 из 3 участников (третий с неверной ролью отклонён) — ${members.length}`);
        check(members.some((m) => m.full_name === 'Тимур Галиев' && m.role === 'Медиа'), 'импорт: вариант выбора без учёта регистра');
        check(members.some((m) => m.joined_at?.startsWith('2025-09-01')), 'импорт: дата ДД.ММ.ГГГГ');
        const events = await list(s, 'events', '&expand=members');
        check(events[0]?.capacity === 1200, 'импорт: число с пробелом');
        check(events[0]?.starts_at?.startsWith('2026-10-20 18:30'), 'импорт: дата со временем');
        check(events[0]?.expand?.members?.length === 2, 'импорт: связи по названию');
      }
    } finally {
      s.proc.kill();
    }
  }
}

/* --------------------------------- update ----------------------------------- */

async function update() {
  console.log('\n▶ Обновление развёрнутой системы');
  const store = useClubStore.getState();
  store.replaceSchema(normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'pro' }));
  const base = useClubStore.getState().schema;
  const baseRaw = generateSchemaJson(base);
  const { root, data } = install(await buildInstallBundle(base, {}, { password: PASSWORD }), 'update-base');

  let s = await serve(root, data);
  const anya = (await api(s, 'POST', '/api/collections/members/records', {
    full_name: 'Аня', role: 'Президент', telegram: '@anya', faculty: 'ФКН', joined_at: '2025-09-01 00:00:00.000Z',
  })).data;
  const tim = (await api(s, 'POST', '/api/collections/members/records', { full_name: 'Тимур', role: 'Медиа', telegram: '@tim' })).data;
  await api(s, 'POST', '/api/collections/events/records', {
    title: 'Кикофф', starts_at: '2026-10-20 18:00:00.000Z', status: 'Отменено', members: [anya.id, tim.id],
  });
  await api(s, 'POST', '/api/collections/events/records', {
    title: 'Квиз', starts_at: '2026-11-01 18:00:00.000Z', status: 'Запланировано', members: [tim.id],
  });
  await api(s, 'POST', '/api/collections/inventory/records', { item: 'Проектор', quantity: 1, state: 'Выдано', holder: anya.id });
  s.proc.kill();

  // Правки — теми же действиями стора, что вызывает редактор.
  const a = useClubStore.getState();
  a.renameFieldId('members', 'full_name', 'name');
  a.addField('members', { id: 'email', name: 'Почта', type: 'text', required: false });
  a.removeField('members', 'faculty');
  a.updateField('members', 'joined_at', { type: 'text' });
  // перестановка имён: role ↔ telegram
  a.renameFieldId('members', 'role', 'swap_tmp');
  a.renameFieldId('members', 'telegram', 'role');
  a.renameFieldId('members', 'swap_tmp', 'telegram');
  const events = useClubStore.getState().schema.entities.find((e) => e.id === 'events')!;
  a.updateField('events', 'status', { options: ['Запланировано', 'Идёт сейчас', 'Завершено', 'Перенесено'] });
  a.updateEntity('events', { relations: events.relations.map((r) => ({ ...r, type: 'one-to-many' as const })) });
  a.renameEntityId('inventory', 'props');
  a.addEntity({
    id: 'awards', name: 'Награда', pluralName: 'Награды', icon: 'Award',
    fields: [{ id: 'title', name: 'Название', type: 'text', required: true }],
    relations: [{ targetEntityId: 'members', type: 'many-to-many' }],
  });
  const next = useClubStore.getState().schema;

  const seeds = { awards: seedBatch('awards', [{ title: 'Лучший клуб', members: 'Аня; Тимур' }]) };
  const bundle = await buildUpdateBundle({ schema: base, raw: baseRaw, source: 'file', at: '' }, next, seeds);
  const kinds = bundle.diff.changes.map((c) => `${c.kind}:${c.field ?? c.collection}`);
  check(kinds.includes('field-renamed:name'), 'diff: переименование full_name → name');
  check(kinds.includes('field-recreated:joined_at'), 'diff: смена типа joined_at — опасно');
  check(kinds.includes('collection-renamed:props'), 'diff: переименование inventory → props');
  check(bundle.diff.changes.some((c) => c.kind === 'field-values-removed' && c.severity === 'warning'), 'diff: удалённый вариант статуса — предупреждение');
  check(!bundle.diff.changes.some((c) => c.kind === 'collection-removed'), 'diff: переименование раздела не выглядит как удаление');

  const updateRoot = writeBundle(bundle, path.join(WORK, 'update'));
  const hash = fs.readFileSync(path.join(updateRoot, '.facet/base-schema.sha256'), 'utf8').trim();
  const actual = execFileSync('sha256sum', [path.join(root, 'club-schema.json')]).toString().split(' ')[0];
  check(hash === actual, 'контрольная сумма базы совпадает с sha256sum файла на «сервере»');
  const migrationFile = fs.readdirSync(path.join(updateRoot, 'payload/pocketbase/pb_migrations'))[0];
  fs.copyFileSync(path.join(updateRoot, 'payload/pocketbase/pb_migrations', migrationFile), path.join(root, 'pocketbase/pb_migrations', migrationFile));
  fs.copyFileSync(path.join(updateRoot, 'payload/club-schema.json'), path.join(root, 'club-schema.json'));

  try {
    migrate(root, data);
    check(true, 'миграция обновления применилась');
  } catch (err) {
    check(false, `миграция обновления упала: ${(err as { stderr?: Buffer }).stderr?.toString() ?? err}`);
    return;
  }

  s = await serve(root, data);
  try {
    await checkStructure(s, next);
    const members = await list(s, 'members');
    const anya2 = members.find((m) => m.id === anya.id);
    check(anya2?.name === 'Аня', 'данные переименованного поля сохранились');
    check(anya2?.telegram === 'Президент' && anya2?.role === '@anya', 'перестановка имён role ↔ telegram сохранила данные');
    check(anya2 && !('faculty' in anya2), 'удалённое поле исчезло');
    check(anya2?.joined_at === '', 'поле со сменой типа пересоздано пустым');
    const evs = await list(s, 'events');
    check(evs.find((e) => e.title === 'Кикофф')?.status === 'Отменено', 'значение удалённого варианта сохранилось (как и обещает предупреждение)');
    check(evs.every((e) => typeof e.members === 'string'), 'связь стала одиночной');
    const props = await list(s, 'props', '&expand=holder');
    check(props.length === 1 && props[0].expand?.holder?.name === 'Аня', 'переименованный раздел сохранил записи и связи');
    const awards = await list(s, 'awards', '&expand=members');
    check(awards.length === 1 && awards[0].expand?.members?.length === 2, 'новый раздел с импортом и связями');
  } finally {
    s.proc.kill();
  }

  // Пустое обновление — без миграции.
  const noop = await buildUpdateBundle({ schema: next, raw: generateSchemaJson(next), source: 'export', at: '' }, next, {});
  check(!noop.files.some((f) => f.path.includes('pb_migrations')) && noop.diff.ops.length === 0, 'без изменений структуры миграция не создаётся');
}

/* --------------------------------- plugins ---------------------------------- */

async function plugins() {
  console.log('\n▶ Плагины');
  const store = useClubStore.getState();
  store.replaceSchema(normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'pro' }));
  const a = useClubStore.getState();
  a.addField('events', { id: 'number', name: 'Номер', type: 'text', required: false });
  a.installPlugin('autonumber');
  a.setPluginSettings('autonumber', { entity: 'events', field: 'number', prefix: 'EV-{YYYY}-', digits: 4 });
  a.installPlugin('audit-log');
  a.installPlugin('telegram');
  a.setPluginSettings('telegram', { chatId: '-100', entities: ['events'], onCreate: true, onUpdate: true, onDelete: false });
  a.setPluginSecret('telegram', 'bot_token', 'dummy-token');
  a.installPlugin('portal-tools');
  const schema = useClubStore.getState().schema;
  check(schema.entities.some((e) => e.id === 'audit_log'), 'журнал изменений добавил раздел audit_log');

  const bundle = await buildInstallBundle(schema, {}, { password: PASSWORD, secrets: useClubStore.getState().pluginSecrets });
  const hookFiles = bundle.files.filter((f) => f.path.includes('pb_hooks/plugin-')).map((f) => f.path.split('/').pop());
  check(hookFiles.length === 3, `хуки плагинов в архиве: ${hookFiles.join(', ')}`);
  const env = bundle.files.find((f) => f.path === '.env')!.content;
  check(env.includes('FACET_PLUGIN_TELEGRAM_BOT_TOKEN=dummy-token'), 'секрет Telegram — в .env');
  check(!bundle.files.find((f) => f.path === 'club-schema.json')!.content.includes('dummy-token'), 'секрет не попал в club-schema.json');

  const { root, data } = install(bundle, 'plugins');
  const s = await serve(root, data);
  try {
    const e1 = (await api(s, 'POST', '/api/collections/events/records', { title: 'Кикофф', starts_at: '2026-10-20 18:00:00.000Z', status: 'Запланировано' })).data;
    const e2 = (await api(s, 'POST', '/api/collections/events/records', { title: 'Квиз', starts_at: '2026-10-21 18:00:00.000Z', status: 'Запланировано' })).data;
    const e3 = (await api(s, 'POST', '/api/collections/events/records', { title: 'Ручной', number: 'MANUAL-1', starts_at: '2026-10-22 18:00:00.000Z', status: 'Запланировано' })).data;
    const year = new Date().getFullYear();
    check(e1.number === `EV-${year}-0001` && e2.number === `EV-${year}-0002`, `автонумерация: ${e1.number}, ${e2.number}`);
    check(e3.number === 'MANUAL-1', 'автонумерация не трогает заполненный номер');
    await api(s, 'PATCH', `/api/collections/events/records/${e1.id}`, { status: 'Завершено' });
    await api(s, 'DELETE', `/api/collections/events/records/${e2.id}`);
    const audit = await list(s, 'audit_log', '&sort=created');
    const actions = audit.map((r) => r.action);
    check(actions.filter((x) => x === 'Создание').length === 3 && actions.includes('Изменение') && actions.includes('Удаление'), `журнал: ${actions.join(', ')}`);
    const upd = audit.find((r) => r.action === 'Изменение');
    check(upd?.changes === 'Статус' && upd?.section === 'Мероприятие' && upd?.author === 'admin@gildiya-severnogo-kampusa.club', `журнал: поля «${upd?.changes}», автор ${upd?.author}`);
    check(audit.every((r) => r.record), 'журнал: названия записей');
    await new Promise((r) => setTimeout(r, 500));
    check(/\[facet:telegram\]/.test(s.log()), 'хук Telegram выполнился и отправил запрос');
    console.log(`    лог Telegram: ${(s.log().match(/\[facet:telegram\][^\n]*/) ?? ['(сеть до api.telegram.org — без ошибок)'])[0].slice(0, 120)}`);
    check((await fetch(`${s.url}/api/health`)).ok, 'сервер жив после всех хуков');
  } finally {
    s.proc.kill();
  }
}

async function dataEditor() {
  console.log('\n▶ Редактор данных (живой сервер)');
  useClubStore.getState().replaceSchema(normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'pro' }));
  useClubStore.getState().clearSeeds();
  const schema = useClubStore.getState().schema;
  const bundle = await buildInstallBundle(schema, { members: seedBatch('members', [{ full_name: 'Анна Иванова', role: 'Президент' }, { full_name: 'Борис Петров', role: 'Президент' }]) }, { password: PASSWORD });
  const { root, data } = install(bundle, 'datagrid');
  const s = await serve(root, data);
  try {
    const src = serverSource({ url: s.url, token: s.token, email: 'admin' });
    const events = schema.entities.find((e) => e.id === 'events')!;
    const cols = await src.columns(events);
    check(cols.some((c) => c.key === 'members' && c.type === 'relation' && c.multiple) && !cols.some((c) => c.missing), `колонки: ${cols.map((c) => c.key).join(', ')}`);
    const opts = await src.relationOptions('members');
    check(opts.length === 2 && opts.some((o) => o.label === 'Анна Иванова'), 'варианты связи — записи участников по названию');
    for (const title of ['Кикофф', 'Квиз']) await api(s, 'POST', '/api/collections/events/records', { title, starts_at: '2026-10-01 18:00:00.000Z', status: 'Запланировано' });
    const before = await src.load(events, cols);
    check(before.length === 2 && before[0].values.starts_at === '2026-10-01 18:00', `загрузка записей: ${before.length}`);
    const ids = opts.map((o) => o.value);
    const poster = new File([new Uint8Array([137, 80, 78, 71])], 'poster.png', { type: 'image/png' });
    const res = await src.save(events, cols, {
      created: [
        { key: 'n1', values: { title: 'Турнир', starts_at: '2026-10-20 18:30', status: 'Запланировано', capacity: 12, members: ids }, files: { poster } },
        { key: 'n2', values: { title: '', starts_at: '2026-10-21 10:00', status: 'Запланировано' }, files: {} },
      ],
      updated: [{ key: before[0].key, patch: { location: 'Актовый зал' }, files: {} }],
      deleted: [before[1].key],
      order: [],
    });
    check(res.saved === 3, `сохранено: ${res.saved} (создание, изменение, удаление)`);
    check(Object.keys(res.errors).join() === 'n2' && !!res.errors.n2.title, `ошибка сервера по строке: ${JSON.stringify(res.errors)}`);
    const after = await src.load(events, cols);
    const created = after.find((r) => r.values.title === 'Турнир');
    check(created?.values.starts_at === '2026-10-20 18:30', `дата без сдвига часового пояса: ${created?.values.starts_at}`);
    check(JSON.stringify(created?.values.members) === JSON.stringify(ids) && created?.values.capacity === 12, 'связь «много» и число сохранены');
    check(Array.isArray(created?.values.poster) && String((created?.values.poster as string[])[0]).startsWith('poster'), `файл загружен: ${created?.values.poster}`);
    const href = created && src.fileUrl?.(events, created, (created.values.poster as string[])[0]);
    check(!!href && (await fetch(href)).ok, 'файл доступен по ссылке');
    check(after.find((r) => r.key === before[0].key)?.values.location === 'Актовый зал', 'изменение записи сохранено');
    check(!after.some((r) => r.key === before[1].key), 'удаление записи');
    // Раздел, которого ещё нет на сервере
    const extra = { ...events, id: 'not_deployed', fields: events.fields.slice(0, 1), relations: [] };
    const missing = await src.columns(extra).then(() => 'ok', (e: Error) => e.message);
    check(missing.startsWith('collection-missing'), `раздел без коллекции: ${missing}`);
    const withNewField = { ...events, fields: [...events.fields, { id: 'new_field', name: 'Новое', type: 'text' as const, required: false }] };
    const cols2 = await src.columns(withNewField);
    check(cols2.find((c) => c.key === 'new_field')?.missing === true, 'поле без колонки на сервере — только чтение');
  } finally {
    s.proc.kill();
  }
}

async function asUser(s: Server, collection: string, email: string, password: string): Promise<Server> {
  const res = await fetch(`${s.url}/api/collections/${collection}/auth-with-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  }).then((r) => r.json() as Promise<{ token?: string; message?: string }>);
  if (!res.token) throw new Error(`вход ${email}: ${res.message}`);
  return { ...s, token: res.token };
}

async function applyUpdate(root: string, data: string, base: ClubSchema, next: ClubSchema, name: string) {
  const bundle = await buildUpdateBundle({ schema: base, raw: generateSchemaJson(base), source: 'file', at: '' }, next, {});
  const updateRoot = writeBundle(bundle, path.join(WORK, name));
  const dir = path.join(updateRoot, 'payload/pocketbase/pb_migrations');
  for (const f of fs.readdirSync(dir)) fs.copyFileSync(path.join(dir, f), path.join(root, 'pocketbase/pb_migrations', f));
  fs.copyFileSync(path.join(updateRoot, 'payload/club-schema.json'), path.join(root, 'club-schema.json'));
  migrate(root, data);
  return bundle;
}

async function roles() {
  console.log('\n▶ Роли актива и доступ по логину');
  // Система старой версии: без ролей, всё публично на чтение.
  const legacy = normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'pro' });
  const { root, data } = install(await buildInstallBundle(legacy, {}, { password: PASSWORD }), 'roles');
  let s = await serve(root, data);
  const adminEmail = env(root).PB_ADMIN_EMAIL!;
  await api(s, 'POST', '/api/collections/events/records', { title: 'Кикофф', starts_at: '2026-10-20 18:00:00.000Z', status: 'Запланировано' });
  check((await api<{ items: unknown[] }>(s, 'GET', '/api/collections/events/records', undefined, true)).data.items.length === 1, 'до обновления: аноним читает');
  s.proc.kill();

  // Обновление до модели с ролями — теми же действиями, что в редакторе.
  useClubStore.getState().replaceSchema(legacy);
  const a = useClubStore.getState();
  a.setRoleAccess('organizer', 'events', 'write');
  a.setRoleAccess('treasurer', 'inventory', 'none');
  const next = useClubStore.getState().schema;
  check(next.roles?.some((r) => r.id === 'chair'), 'в рабочей схеме появились роли');
  let bundle;
  try {
    bundle = await applyUpdate(root, data, legacy, next, 'roles-update');
    check(true, 'миграция с ролями применилась');
  } catch (err) {
    check(false, `миграция с ролями упала: ${(err as { stderr?: Buffer }).stderr?.toString() ?? err}`);
    return;
  }
  const kinds = bundle.diff.changes.map((c) => c.kind);
  check(kinds.includes('staff-enabled') && kinds.filter((k) => k === 'access-private').length === next.entities.length, `diff: вход для актива и закрытие разделов (${kinds.join(', ')})`);

  s = await serve(root, data);
  try {
    await checkStructure(s, next);
    const anon = await api<{ items: unknown[] }>(s, 'GET', '/api/collections/events/records', undefined, true);
    check(anon.status !== 200 || anon.data.items.length === 0, 'после обновления: аноним не видит записи');
    const chair = await asUser(s, 'staff', adminEmail, PASSWORD);
    check(true, 'председатель входит с данными администратора из .env');
    const me = (await api<{ items: any[] }>(chair, 'GET', '/api/collections/staff/records')).data.items;
    check(me.length === 1 && me[0].role === 'chair', 'учётная запись председателя создана');
    check((await api<{ items: unknown[] }>(chair, 'GET', '/api/collections/events/records')).data.items.length === 1, 'председатель читает разделы');

    const mk = async (email: string, role: string) =>
      api(chair, 'POST', '/api/collections/staff/records', { email, password: 'staff-pass-123', passwordConfirm: 'staff-pass-123', name: email, role });
    const mkRes = await mk('kazna@club.test', 'treasurer');
    check(mkRes.status === 200, `председатель добавляет казначея ${mkRes.status === 200 ? '' : JSON.stringify(mkRes.data)}`);
    check((await mk('org@club.test', 'organizer')).status === 200, 'председатель добавляет организатора');
    const treasurer = await asUser(s, 'staff', 'kazna@club.test', 'staff-pass-123');
    const organizer = await asUser(s, 'staff', 'org@club.test', 'staff-pass-123');

    check((await api<{ items: unknown[] }>(treasurer, 'GET', '/api/collections/events/records')).data.items.length === 1, 'казначей видит мероприятия (просмотр)');
    check((await api(treasurer, 'POST', '/api/collections/events/records', { title: 'X', starts_at: '2026-10-21 18:00:00.000Z', status: 'Запланировано' })).status >= 400, 'казначей не может создавать мероприятия');
    const inv = await api<{ items: unknown[] }>(treasurer, 'GET', '/api/collections/inventory/records');
    check(inv.status !== 200 || inv.data.items.length === 0, 'казначею закрыт инвентарь');
    const created = await api<any>(organizer, 'POST', '/api/collections/events/records', { title: 'Квиз', starts_at: '2026-10-22 18:00:00.000Z', status: 'Запланировано' });
    check(created.status === 200, 'организатор создаёт мероприятия');
    check((await api(organizer, 'POST', '/api/collections/staff/records', { email: 'x@club.test', password: 'staff-pass-123', passwordConfirm: 'staff-pass-123', role: 'chair' })).status >= 400, 'организатор не может добавлять сотрудников');
    const tId = (await api<{ items: any[] }>(treasurer, 'GET', '/api/collections/staff/records')).data.items.find((x) => x.email === 'kazna@club.test' || x.name === 'kazna@club.test')?.id;
    check((await api(treasurer, 'PATCH', `/api/collections/staff/records/${tId}`, { role: 'chair' })).status >= 400, 'сотрудник не может сам повысить себе роль');
    check((await api(treasurer, 'PATCH', `/api/collections/staff/records/${tId}`, { name: 'Казначей Катя' })).status === 200, 'сотрудник меняет своё имя');
  } finally {
    s.proc.kill();
  }

  // Публичный раздел (афиша) — виден без входа.
  useClubStore.getState().setEntityPublic('events', true);
  const pub = useClubStore.getState().schema;
  const b2 = await applyUpdate(root, data, next, pub, 'roles-public');
  check(b2.diff.changes.some((c) => c.kind === 'access-public' && c.collection === 'events'), 'diff: раздел стал публичным');
  s = await serve(root, data);
  try {
    check((await api<{ items: unknown[] }>(s, 'GET', '/api/collections/events/records', undefined, true)).data.items.length === 2, 'аноним видит публичный раздел');
    check((await api(s, 'POST', '/api/collections/events/records', { title: 'Y' }, true)).status >= 400, 'но не может в него писать');
  } finally {
    s.proc.kill();
  }

  // Новая установка с ролями сразу.
  const fresh = useClubStore.getState().schema;
  const f = install(await buildInstallBundle(fresh, {}, { password: PASSWORD }), 'roles-fresh');
  s = await serve(f.root, f.data);
  try {
    await checkStructure(s, fresh);
    await asUser(s, 'staff', env(f.root).PB_ADMIN_EMAIL!, PASSWORD);
    check(true, 'новая установка: председатель входит');
  } catch (err) {
    check(false, `новая установка с ролями: ${err}`);
  } finally {
    s.proc.kill();
  }
}

async function accounting() {
  console.log('\n▶ Учёт: операции и остатки');
  useClubStore.getState().replaceSchema(normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'pro' }));
  useClubStore.getState().clearSeeds();
  useClubStore.getState().addAccountingPack('cash');
  useClubStore.getState().addAccountingPack('equipment');
  const schema = useClubStore.getState().schema;
  check(schema.registers?.length === 2 && schema.entities.some((e) => e.id === 'cash_ops') && schema.entities.some((e) => e.id === 'issues'), 'готовые решения: касса и выдача инвентаря');
  check(!schema.entities.some((e) => e.id === 'inventory_2' || e.id === 'members_2'), 'выдача использует существующие разделы инвентаря и участников');
  const seeds = { cash_ops: seedBatch('cash_ops', [{ title: 'Взносы сентябрь', date: '01.09.2026', type: 'Поступление', amount: '5 000', article: 'Взносы' }]) };
  const bundle = await buildInstallBundle(schema, seeds, { password: PASSWORD });
  check(bundle.files.some((f) => f.path.endsWith('pb_hooks/facet-registers.pb.js')), 'хук проведения в архиве');
  const { root, data } = install(bundle, 'accounting');
  const s = await serve(root, data);
  const sum = async (reg: string, res: string, filter = '') => {
    const rows = (await api<{ items: any[] }>(s, 'GET', `/api/collections/reg_${reg}/records?perPage=500${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`)).data.items;
    return rows.reduce((n, r) => n + (r[`r_${res}`] ?? 0), 0);
  };
  try {
    await checkStructure(s, schema);
    const seededOps = (await api<{ items: any[] }>(s, 'GET', '/api/collections/cash_ops/records')).data.items;
    check(await sum('cash', 'amount') === 5000, `черновые операции проведены при установке: ${await sum('cash', 'amount')} (операций ${seededOps.length}, posted=${seededOps[0]?.posted})`);
    if (await sum('cash', 'amount') !== 5000) console.log(s.log().split('\n').filter((l) => /facet|rror/i.test(l)).slice(0, 15).join('\n'));
    const exp = await api<any>(s, 'POST', '/api/collections/cash_ops/records', { title: 'Пицца', date: '2026-09-05 12:00:00.000Z', type: 'Расход', amount: 1200, article: 'Мероприятия', posted: true });
    check(exp.status === 200, 'расход проведён');
    check(await sum('cash', 'amount') === 3800, `остаток кассы 3800: ${await sum('cash', 'amount')}`);
    check(await sum('cash', 'amount', 'd_article = "Мероприятия"') === -1200, 'остаток по статье');
    const draft = await api<any>(s, 'POST', '/api/collections/cash_ops/records', { title: 'Черновик', date: '2026-09-06 12:00:00.000Z', type: 'Расход', amount: 999, article: 'Прочее', posted: false });
    check(draft.status === 200 && await sum('cash', 'amount') === 3800, 'неподтверждённая операция не влияет на остаток');
    await api(s, 'PATCH', `/api/collections/cash_ops/records/${draft.data.id}`, { posted: true });
    check(await sum('cash', 'amount') === 2801, 'подтверждение проводит операцию');
    await api(s, 'PATCH', `/api/collections/cash_ops/records/${draft.data.id}`, { amount: 1 });
    check(await sum('cash', 'amount') === 3799, 'изменение суммы перепроводит');
    await api(s, 'DELETE', `/api/collections/cash_ops/records/${draft.data.id}`);
    check(await sum('cash', 'amount') === 3800, 'удаление снимает движения');

    const item = (await api<any>(s, 'POST', '/api/collections/inventory/records', { item: 'Проектор', quantity: 2, state: 'Доступно' })).data;
    const anya = (await api<any>(s, 'POST', '/api/collections/members/records', { full_name: 'Аня', role: 'Президент' })).data;
    const issue = await api<any>(s, 'POST', '/api/collections/issues/records', { date: '2026-09-10 10:00:00.000Z', type: 'Выдача', item: item.id, holder: anya.id, qty: 2, posted: true });
    check(issue.status === 200, 'выдача проведена');
    check(await sum('on_hand', 'qty', `d_holder = "${anya.id}"`) === 2, 'у Ани на руках 2');
    const tooMuch = await api<any>(s, 'POST', '/api/collections/issues/records', { date: '2026-09-11 10:00:00.000Z', type: 'Возврат', item: item.id, holder: anya.id, qty: 3, posted: true });
    check(tooMuch.status === 400 && /Недостаточно/.test(tooMuch.data?.message ?? ''), `вернуть больше, чем выдано, нельзя: ${tooMuch.data?.message}`);
    const ret = await api<any>(s, 'POST', '/api/collections/issues/records', { date: '2026-09-12 10:00:00.000Z', type: 'Возврат', item: item.id, holder: anya.id, qty: 2, posted: true });
    check(ret.status === 200 && await sum('on_hand', 'qty') === 0, 'возврат обнулил остаток');
    const shrink = await api<any>(s, 'PATCH', `/api/collections/issues/records/${issue.data.id}`, { qty: 1 });
    check(shrink.status === 400, 'нельзя уменьшить выдачу, если возврат уже больше');
    const del = await api<any>(s, 'DELETE', `/api/collections/issues/records/${issue.data.id}`);
    check(del.status === 400, 'нельзя удалить выдачу, по которой уже был возврат');
    const anon = await api<{ items: unknown[] }>(s, 'GET', '/api/collections/reg_cash/records', undefined, true);
    check(anon.status !== 200 || anon.data.items.length === 0, 'остатки закрыты для гостей');
    const writeReg = await api<any>(s, 'POST', '/api/collections/reg_cash/records', { r_amount: 1 }, true);
    check(writeReg.status >= 400, 'движения нельзя записать напрямую');
  } finally {
    s.proc.kill();
  }
}

try {
  await presets();
  await update();
  await plugins();
  await dataEditor();
  await roles();
  await accounting();
} catch (err) {
  failures++;
  console.error(err);
} finally {
  if (!KEEP) fs.rmSync(WORK, { recursive: true, force: true });
  else console.log(`\nФайлы сохранены: ${WORK}`);
}
console.log(failures ? `\n✗ Проблем: ${failures}` : '\n✓ Все проверки пройдены');
process.exit(failures ? 1 : 0);
