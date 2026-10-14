import portalJs from 'virtual:facet-portal';
import portalBaseCss from '@/portal/portal.css?raw';
import nginxConf from '@/export-templates/nginx.conf?raw';
import nginxProxy from '@/export-templates/nginx-proxy.conf?raw';
import nginxHeaders from '@/export-templates/nginx-headers.conf?raw';
import nginxCsp from '@/export-templates/nginx-csp.conf?raw';
import caddyfile from '@/export-templates/Caddyfile?raw';
import pocketbaseDockerfile from '@/export-templates/Dockerfile?raw';
import pbHooks from '@/export-templates/facet.pb.js?raw';
import superuserMigration from '@/export-templates/superuser-migration.js?raw';
import installSh from '@/export-templates/install.sh?raw';
import backupSh from '@/export-templates/backup.sh?raw';
import restoreSh from '@/export-templates/restore.sh?raw';
import applyUpdateSh from '@/export-templates/apply-update.sh?raw';
import type { ClubSchema } from '@/types/schema';
import type { Baseline, SeedBatch } from '@/store/useClubStore';
import { slugify } from '@/lib/id';
import { generateSchemaJson } from '@/utils/schemaJson';
import { resolveRelations } from '@/utils/relations';
import { cssVarsToText, dividerCss, fontStylesheetUrl, themeToCssVars } from '@/utils/theme';
import { planMigration, renderMigrationFile } from '@/utils/migrations/generate';
import { buildSeedOp, orderSeedOps } from '@/utils/migrations/seeds';
import { describeChange, SEVERITY_MARK } from '@/utils/migrations/describe';
import type { SchemaDiff } from '@/utils/migrations/diff';

export const FACET_VERSION = '0.2.0';
export const PB_VERSION = '0.25.9';

export interface ExportFile {
  path: string;
  content: string;
  /** Короткое пояснение для диалога экспорта. */
  description: string;
  /** base64 — бинарный файл (логотип). */
  encoding?: 'base64';
  /** Исполняемый файл (скрипты .sh). */
  executable?: boolean;
}

export interface ExportBundle {
  kind: 'install' | 'update';
  folder: string;
  files: ExportFile[];
  diff: SchemaDiff;
  /** Сколько импортированных строк вошло в миграцию. */
  seededRows: number;
}

export interface ExportOptions {
  now?: Date;
  /** Пароль администратора (по умолчанию — случайный). */
  password?: string;
}

/* ---------------------------------- helpers --------------------------------- */

export function projectSlug(schema: ClubSchema): string {
  return slugify(schema.clubName).replace(/_/g, '-');
}

export function exportFolderName(schema: ClubSchema): string {
  return `${projectSlug(schema)}-portal`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomPassword(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const LOGO_RE = /^data:image\/(png|webp|jpeg|svg\+xml);base64,(.+)$/;

function logoFile(schema: ClubSchema): { path: string; base64: string } | null {
  const m = schema.theme.logo ? LOGO_RE.exec(schema.theme.logo) : null;
  if (!m) return null;
  const ext = m[1] === 'svg+xml' ? 'svg' : m[1] === 'jpeg' ? 'jpg' : m[1];
  return { path: `logo.${ext}`, base64: m[2] };
}

const stamp = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;

/* ------------------------------ club-schema.json ----------------------------- */

export { generateSchemaJson };

/* ------------------------------ docker-compose.yml --------------------------- */

/** Строка для YAML в двойных кавычках, без подстановок переменных compose. */
const yamlString = (s: string) => JSON.stringify(s).replace(/\$/g, '$$$$');

export function generateDockerCompose(schema: ClubSchema): string {
  return `# ${schema.clubName} — self-hosted система управления клубом, собранная в Facet OS
# Запуск:   ./install.sh            (или: docker compose up -d --build)
# HTTPS:    DOMAIN=club.example.ru и COMPOSE_PROFILES=https в .env
# Имя проекта (и тома с базой) закреплено в .env — COMPOSE_PROJECT_NAME, — поэтому
# переименование клуба в редакторе не создаёт новую пустую базу при обновлении.

services:
  pocketbase:
    build:
      context: ./pocketbase
      args:
        PB_VERSION: "${PB_VERSION}"
    restart: unless-stopped
    environment:
      PB_ADMIN_EMAIL: \${PB_ADMIN_EMAIL:?Укажите PB_ADMIN_EMAIL в .env}
      PB_ADMIN_PASSWORD: \${PB_ADMIN_PASSWORD:?Укажите PB_ADMIN_PASSWORD в .env}
      FACET_CLUB_NAME: ${yamlString(schema.clubName)}
      DOMAIN: \${DOMAIN:-}
      BACKUP_CRON: \${BACKUP_CRON:-0 3 * * *}
      BACKUP_KEEP: \${BACKUP_KEEP:-14}
      BACKUP_S3_BUCKET: \${BACKUP_S3_BUCKET:-}
      BACKUP_S3_REGION: \${BACKUP_S3_REGION:-}
      BACKUP_S3_ENDPOINT: \${BACKUP_S3_ENDPOINT:-}
      BACKUP_S3_ACCESS_KEY: \${BACKUP_S3_ACCESS_KEY:-}
      BACKUP_S3_SECRET: \${BACKUP_S3_SECRET:-}
    volumes:
      - pb_data:/pb/pb_data
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:8090/api/health"]
      interval: 10s
      timeout: 3s
      retries: 6
      start_period: 5s

  web:
    image: nginx:1.27-alpine
    restart: unless-stopped
    depends_on:
      pocketbase:
        condition: service_healthy
    ports:
      - "\${PORTAL_BIND:-0.0.0.0}:\${PORTAL_PORT:-8080}:80"
    volumes:
      - ./web:/usr/share/nginx/html:ro
      - ./club-schema.json:/usr/share/nginx/club-schema.json:ro
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./nginx/snippets:/etc/nginx/snippets:ro
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1/"]
      interval: 10s
      timeout: 3s
      retries: 6

  # HTTPS с автоматическим сертификатом Let's Encrypt. Включается COMPOSE_PROFILES=https.
  caddy:
    image: caddy:2.8-alpine
    profiles: ["https"]
    restart: unless-stopped
    depends_on:
      web:
        condition: service_healthy
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    environment:
      DOMAIN: \${DOMAIN:-localhost}
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  pb_data:
  caddy_data:
  caddy_config:
`;
}

/* ----------------------------------- .env ------------------------------------ */

export const ENV_DEFAULTS = `# Порт портала и интерфейс. С HTTPS ставится 127.0.0.1 — снаружи доступ только через Caddy.
PORTAL_PORT=8080
PORTAL_BIND=0.0.0.0

# HTTPS: домен (A-запись на IP сервера) и включение Caddy.
DOMAIN=
COMPOSE_PROFILES=

# Автоматические резервные копии PocketBase: расписание cron и сколько хранить.
BACKUP_CRON="0 3 * * *"
BACKUP_KEEP=14

# Необязательно: выгрузка копий в S3-совместимое хранилище (Yandex Object Storage, Selectel, MinIO…).
BACKUP_S3_BUCKET=
BACKUP_S3_REGION=
BACKUP_S3_ENDPOINT=
BACKUP_S3_ACCESS_KEY=
BACKUP_S3_SECRET=
`;

export function generateEnv(schema: ClubSchema, password = randomPassword()): string {
  return `# Секреты портала «${schema.clubName}». Не публикуйте этот файл.
PB_ADMIN_EMAIL=admin@${projectSlug(schema)}.club
PB_ADMIN_PASSWORD=${password}

# Имя Docker-проекта = имя тома с базой. Не меняйте после установки — иначе Docker создаст новую пустую базу.
COMPOSE_PROJECT_NAME=${projectSlug(schema)}

${ENV_DEFAULTS}`;
}

/* -------------------------------------- web ---------------------------------- */

export function generatePortalCss(schema: ClubSchema): string {
  return `/* Тема «${schema.clubName}» — сгенерировано Facet OS ${FACET_VERSION} */
${cssVarsToText(themeToCssVars(schema.theme))}

html, body { margin: 0; min-height: 100%; background: var(--fx-bg); }

${dividerCss(schema.theme)}

${portalBaseCss}`;
}

export function generatePortalHtml(schema: ClubSchema): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const logo = logoFile(schema);
  const font = fontStylesheetUrl(schema.theme.font);
  return `<!doctype html>
<html lang="${schema.locale ?? 'ru'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${esc(schema.motto)}" />
    <meta name="theme-color" content="${schema.theme.colors.primary}" />
    <title>${esc(schema.clubName)}</title>
${logo ? `    <link rel="icon" href="/${logo.path}" />\n` : ''}${font ? `    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n    <link rel="stylesheet" href="${font}" />\n` : ''}    <link rel="stylesheet" href="/portal.css" />
  </head>
  <body>
    <div id="app"${logo ? ` data-logo="/${logo.path}"` : ''}><div class="fx-root"><div class="fx-shell"><div class="fx-empty">…</div></div></div></div>
    <script src="/portal.js" defer></script>
  </body>
</html>
`;
}

/* ------------------------------------ DEPLOY.md ------------------------------ */

export function generateDeployMd(schema: ClubSchema): string {
  const folder = exportFolderName(schema);
  const entityList = schema.entities
    .map((e) => {
      const rels = resolveRelations(e, schema);
      const relText = rels.length
        ? rels.map((r) => `\`${r.name}\` → \`${r.targetEntityId}\`${r.multiple ? ' (много)' : ''}`).join(', ')
        : '—';
      return `| \`${e.id}\` | ${e.pluralName} | ${e.fields.length} | ${relText} |`;
    })
    .join('\n');

  return `# 🚀 Система клуба «${schema.clubName}»

> ${schema.motto || 'Собрано в Facet OS.'}

Эта папка — готовая к запуску система управления клубом: база данных и панель управления (PocketBase), рабочий портал с таблицами, канбаном, календарём и карточками записей, HTTPS и резервные копии.

| Файл / папка | Что это |
| --- | --- |
| \`install.sh\` | Установка одной командой (ставит Docker, при желании включает HTTPS) |
| \`backup.sh\` / \`restore.sh\` | Ручная резервная копия и восстановление |
| \`docker-compose.yml\` | Контейнеры: **pocketbase** (база + API + админка), **web** (Nginx + портал), **caddy** (HTTPS, по желанию) |
| \`.env\` | Логин/пароль администратора, порт, домен, настройки бэкапов. **Не публикуйте!** |
| \`club-schema.json\` | Слепок структуры клуба. Нужен для будущих обновлений — не редактируйте вручную |
| \`pocketbase/\` | Образ, миграции (создают разделы и связи) и хуки (настройки из \`.env\`) |
| \`nginx/\`, \`caddy/\` | Веб-сервер с защитными заголовками и лимитами, HTTPS-шлюз |
| \`web/\` | Сам портал (HTML + CSS + JS, без сборки) |

> 💡 \`.env\` начинается с точки и в macOS/Linux скрыт: \`ls -la\` или \`Cmd+Shift+.\` в Finder.

---

## Вариант А. Сервер в интернете (VPS) — рекомендуемый

Подойдёт любой VPS с Ubuntu 22.04+ и 1 ГБ RAM.

\`\`\`bash
# на своём компьютере: скопировать папку на сервер
scp -r ${folder} root@IP_СЕРВЕРА:/opt/

# на сервере
ssh root@IP_СЕРВЕРА
cd /opt/${folder}
sudo ./install.sh club.example.ru     # или без домена: sudo ./install.sh
\`\`\`

Скрипт сам поставит Docker, соберёт контейнеры и выведет адрес портала, логин и пароль.

**С доменом:** заранее создайте у регистратора A-запись \`club.example.ru → IP сервера\` и откройте порты 80 и 443. Сертификат HTTPS выпустится и будет продлеваться автоматически.

**Без домена:** портал будет на \`http://IP_СЕРВЕРА:8080\`. Подойдёт для пробы, но пароли передаются без шифрования.

## Вариант Б. Свой компьютер

1. Установите [Docker Desktop](https://www.docker.com/products/docker-desktop/) и запустите его.
2. В папке портала выполните \`docker compose up -d --build\`.
3. Откройте http://localhost:8080, панель управления — http://localhost:8080/_/ (логин и пароль — в \`.env\`).

---

## Разделы системы

| Коллекция | Раздел | Полей | Связи |
| --- | --- | --- | --- |
${entityList}

Записи добавляются и меняются в панели управления \`/_/\`. На портале у каждой записи есть кнопка «Изменить», которая открывает её в панели.

## Резервные копии

- **Автоматически:** каждую ночь в 03:00 (настраивается \`BACKUP_CRON\` в \`.env\`), хранятся последние 14. Список и скачивание — \`/_/\` → *Settings → Backups*.
- **В облако:** заполните \`BACKUP_S3_*\` в \`.env\` и выполните \`docker compose up -d\`.
- **Вручную:** \`./backup.sh\` → архив в папке \`backups/\`. Скопируйте его к себе: \`scp root@IP:/opt/${folder}/backups/*.tar.gz .\`
- **Восстановить:** \`./restore.sh backups/pb_data-ДАТА.tar.gz\` (текущее состояние перед этим тоже сохранится).

## Как обновить структуру клуба

Добавили раздел, поле или связь в Facet OS? Данные терять не нужно:

1. В Facet OS нажмите **Экспорт → Обновление**. Если редактор открыт на другом компьютере, загрузите \`club-schema.json\` с сервера кнопкой «Версия на сервере».
2. Проверьте список изменений — опасные (удаление данных) подсвечены красным.
3. Скачайте архив обновления, скопируйте на сервер и выполните:
   \`\`\`bash
   ./apply-update.sh /opt/${folder}
   \`\`\`
   Скрипт проверит, что обновление собрано именно для вашей версии, сделает полную копию (база + файлы), применит миграцию и перезапустит систему.
4. Что-то пошло не так? \`./restore.sh backups/update-ДАТА\` вернёт всё как было.

## Безопасность

- Чтение записей открыто всем, кто знает адрес портала; изменение — только администраторам.
  Ограничить просмотр можно в \`/_/\` → *Collections → ⚙ → API Rules* (например, \`@request.auth.id != ""\`).
- Вход в панель ограничен 10 попытками в минуту с одного IP; API — 30 запросами в секунду.
- Поменяйте пароль администратора после первого входа: \`/_/\` → *System → Superusers*.
- Добавить ещё администратора — там же, кнопка *New*.

## Полезные команды

| Задача | Команда |
| --- | --- |
| Статус контейнеров | \`docker compose ps\` |
| Логи | \`docker compose logs -f\` |
| Перезапуск | \`docker compose restart\` |
| Остановить | \`docker compose down\` |
| Применить изменения \`.env\` | \`docker compose up -d\` |

## Что-то не работает?

| Симптом | Решение |
| --- | --- |
| \`port is already allocated\` | Порт занят — поменяйте \`PORTAL_PORT\` в \`.env\` |
| HTTPS не выпускается | Проверьте A-запись домена и что порты 80/443 открыты: \`docker compose logs caddy\` |
| «Не удалось загрузить данные» | \`docker compose logs pocketbase\` — смотрите ошибку миграции |
| Забыли пароль администратора | \`docker compose exec pocketbase /pb/pocketbase superuser upsert EMAIL НОВЫЙ_ПАРОЛЬ --dir=/pb/pb_data\` |
| \`exec format error\` на ARM-сервере | \`docker compose build --no-cache\` |

---

Собрано в **Facet OS ${FACET_VERSION}**
`;
}

function generateUpdateMd(schema: ClubSchema, diff: SchemaDiff, seededRows: number, baseHash: string): string {
  const folder = exportFolderName(schema);
  const lines = diff.changes.map((c) => `- ${c.severity === 'danger' ? '🔴' : c.severity === 'warning' ? '🟡' : '🟢'} ${describeChange(c, 'ru')}`);
  if (seededRows) lines.push(`- 🟢 Импорт данных: ${seededRows} записей`);
  return `# Обновление системы «${schema.clubName}»

## Что изменится

${lines.length ? lines.join('\n') : '- Структура базы не меняется — обновятся тема, портал и настройки.'}

## Как применить

1. Скопируйте эту папку на сервер (рядом с порталом):
   \`\`\`bash
   scp -r ${projectSlug(schema)}-update-* root@IP_СЕРВЕРА:/opt/
   \`\`\`
2. На сервере:
   \`\`\`bash
   cd /opt/${projectSlug(schema)}-update-*
   ./apply-update.sh /opt/${folder}
   \`\`\`

Скрипт:
- убедится, что обновление собрано для версии, которая стоит на сервере (SHA-256 \`club-schema.json\` = \`${baseHash.slice(0, 16)}…\`);
- сохранит полную копию базы и файлов в \`backups/update-ДАТА\`;
- положит новые файлы (\`.env\` не трогается — только допишет новые настройки);
- пересоберёт контейнеры — PocketBase применит миграцию автоматически.

## Откат

\`\`\`bash
cd /opt/${folder}
./restore.sh backups/update-ДАТА
\`\`\`
`;
}

/* --------------------------------- bundles ----------------------------------- */

/** Файлы, общие для установки и обновления (всё, кроме .env и уже применённых миграций). */
function sharedFiles(schema: ClubSchema): ExportFile[] {
  const files: ExportFile[] = [
    { path: 'docker-compose.yml', content: generateDockerCompose(schema), description: 'PocketBase + Nginx + Caddy (HTTPS)' },
    { path: 'club-schema.json', content: generateSchemaJson(schema), description: 'Слепок структуры — база для обновлений' },
    { path: 'DEPLOY.md', content: generateDeployMd(schema), description: 'Инструкция: установка, HTTPS, бэкапы, обновления' },
    { path: 'install.sh', content: installSh, description: 'Установка на сервер одной командой', executable: true },
    { path: 'backup.sh', content: backupSh, description: 'Ручная резервная копия', executable: true },
    { path: 'restore.sh', content: restoreSh, description: 'Восстановление и откат обновления', executable: true },
    { path: 'pocketbase/Dockerfile', content: pocketbaseDockerfile, description: 'Образ PocketBase' },
    { path: 'pocketbase/pb_hooks/facet.pb.js', content: pbHooks, description: 'Настройки из .env: бэкапы, S3, домен' },
    { path: 'nginx/default.conf', content: nginxConf, description: 'Портал, прокси API, лимиты запросов' },
    { path: 'nginx/snippets/facet-proxy.conf', content: nginxProxy, description: 'Параметры проксирования' },
    { path: 'nginx/snippets/facet-headers.conf', content: nginxHeaders, description: 'Защитные заголовки' },
    { path: 'nginx/snippets/facet-csp.conf', content: nginxCsp, description: 'Content-Security-Policy портала' },
    { path: 'caddy/Caddyfile', content: caddyfile, description: 'HTTPS с автосертификатом' },
    { path: 'web/index.html', content: generatePortalHtml(schema), description: 'Точка входа портала' },
    { path: 'web/portal.css', content: generatePortalCss(schema), description: 'Тема клуба в CSS-переменных' },
    { path: 'web/portal.js', content: portalJs, description: 'Портал: дашборд, таблицы, канбан, календарь' },
  ];
  const logo = logoFile(schema);
  if (logo) files.push({ path: `web/${logo.path}`, content: logo.base64, encoding: 'base64', description: 'Логотип клуба' });
  return files;
}

function seedOpsFor(schema: ClubSchema, seeds: Record<string, SeedBatch>) {
  const ops = orderSeedOps(
    schema.entities
      .filter((e) => seeds[e.id]?.rows.length)
      .map((e) => buildSeedOp(schema, e, seeds[e.id])),
  );
  return { ops, rows: ops.reduce((n, op) => n + op.rows.length, 0) };
}

function manifest(kind: ExportBundle['kind'], now: Date, schemaHash: string, migrations: string[], baseHash?: string): string {
  return `${JSON.stringify({ facet: FACET_VERSION, kind, exportedAt: now.toISOString(), schemaSha256: schemaHash, baseSchemaSha256: baseHash, migrations }, null, 2)}\n`;
}

/** Полная установка с нуля. */
export async function buildInstallBundle(
  schema: ClubSchema,
  seeds: Record<string, SeedBatch> = {},
  options: ExportOptions = {},
): Promise<ExportBundle> {
  const now = options.now ?? new Date();
  const ts = Math.floor(now.getTime() / 1000);
  const diff = planMigration(null, schema);
  const seed = seedOpsFor(schema, seeds);
  const initName = `${ts}_facet_init.js`;
  const files = sharedFiles(schema);
  files.push(
    { path: '.env', content: generateEnv(schema, options.password), description: 'Логин и случайный пароль администратора, настройки' },
    {
      path: `pocketbase/pb_migrations/${initName}`,
      content: renderMigrationFile({ title: `структура клуба «${schema.clubName}»`, ops: [...diff.ops, ...seed.ops] }),
      description: seed.rows ? `Разделы, связи и импорт ${seed.rows} записей` : 'Разделы и связи',
    },
    { path: `pocketbase/pb_migrations/${ts + 1}_facet_superuser.js`, content: superuserMigration, description: 'Администратор из .env' },
    {
      path: '.facet/manifest.json',
      content: manifest('install', now, await sha256Hex(generateSchemaJson(schema)), [initName]),
      description: 'Версия сборки',
    },
  );
  return { kind: 'install', folder: exportFolderName(schema), files, diff, seededRows: seed.rows };
}

/** Обновление уже развёрнутой системы: только разница с версией на сервере. */
export async function buildUpdateBundle(
  baseline: Baseline,
  schema: ClubSchema,
  seeds: Record<string, SeedBatch> = {},
  options: ExportOptions = {},
): Promise<ExportBundle> {
  const now = options.now ?? new Date();
  const ts = Math.floor(now.getTime() / 1000);
  const diff = planMigration(baseline.schema, schema);
  const seed = seedOpsFor(schema, seeds);
  const baseHash = await sha256Hex(baseline.raw);
  const migrationName = `${ts}_facet_update.js`;
  const hasMigration = diff.ops.length > 0 || seed.ops.length > 0;

  const payload = sharedFiles(schema).map((f) => ({ ...f, path: `payload/${f.path}` }));
  if (hasMigration) {
    payload.push({
      path: `payload/pocketbase/pb_migrations/${migrationName}`,
      content: renderMigrationFile({ title: `обновление структуры «${schema.clubName}»`, ops: [...diff.ops, ...seed.ops] }),
      description: `${diff.ops.length} изменений структуры${seed.rows ? `, импорт ${seed.rows} записей` : ''}`,
    });
  }
  payload.push({
    path: 'payload/.facet/manifest.json',
    content: manifest('update', now, await sha256Hex(generateSchemaJson(schema)), hasMigration ? [migrationName] : [], baseHash),
    description: 'Версия сборки',
  });

  const changesTxt = [
    ...diff.changes.map((c) => `  ${SEVERITY_MARK[c.severity]} ${describeChange(c, 'ru')}`),
    ...(seed.rows ? [`  + Импорт данных: ${seed.rows} записей`] : []),
  ];

  const files: ExportFile[] = [
    { path: 'UPDATE.md', content: generateUpdateMd(schema, diff, seed.rows, baseHash), description: 'Что изменится и как применить' },
    { path: 'apply-update.sh', content: applyUpdateSh, description: 'Проверка версии, бэкап, применение', executable: true },
    { path: 'CHANGES.txt', content: `${changesTxt.length ? changesTxt.join('\n') : '  Структура базы не меняется.'}\n`, description: 'Список изменений' },
    { path: 'env.defaults', content: ENV_DEFAULTS, description: 'Новые настройки для .env' },
    { path: '.facet/base-schema.sha256', content: `${baseHash}\n`, description: 'Контрольная сумма версии на сервере' },
    ...payload,
  ];
  return { kind: 'update', folder: `${projectSlug(schema)}-update-${stamp(now)}`, files, diff, seededRows: seed.rows };
}
