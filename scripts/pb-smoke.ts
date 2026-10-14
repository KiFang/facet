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
  const stale = cols.filter((c) => !c.system && c.name !== 'users' && !schema.entities.some((e) => e.id === c.name));
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

try {
  await presets();
  await update();
} catch (err) {
  failures++;
  console.error(err);
} finally {
  if (!KEEP) fs.rmSync(WORK, { recursive: true, force: true });
  else console.log(`\nФайлы сохранены: ${WORK}`);
}
console.log(failures ? `\n✗ Проблем: ${failures}` : '\n✓ Все проверки пройдены');
process.exit(failures ? 1 : 0);
