import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { ClubEntity, ClubSchema, EntityField } from '@/types/schema';
import { slugify } from '@/lib/id';
import { resolveRelations } from '@/utils/relations';
import { cssVarsToText, dividerCss, themeToCssVars } from '@/utils/theme';
import nginxConf from '@/export-templates/nginx.conf?raw';
import pocketbaseDockerfile from '@/export-templates/Dockerfile?raw';
import superuserMigration from '@/export-templates/superuser-migration.js?raw';
import portalBaseCss from '@/export-templates/portal.base.css?raw';
import portalJs from '@/export-templates/portal.js?raw';

export interface ExportFile {
  path: string;
  content: string;
  /** Короткое пояснение для диалога экспорта. */
  description: string;
}

export const PB_VERSION = '0.25.9';

/* ------------------------------ club-schema.json ----------------------------- */

export function generateSchemaJson(schema: ClubSchema): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

/* ------------------------------ docker-compose.yml --------------------------- */

export function generateDockerCompose(schema: ClubSchema): string {
  const project = slugify(schema.clubName).replace(/_/g, '-');
  return `# ${schema.clubName} — self-hosted портал, собранный в Facet OS
# Запуск: docker compose up -d   →   http://localhost:\${PORTAL_PORT:-8080}
name: ${project}

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
      - "\${PORTAL_PORT:-8080}:80"
    volumes:
      - ./web:/usr/share/nginx/html:ro
      - ./club-schema.json:/usr/share/nginx/club-schema.json:ro
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro

volumes:
  pb_data:
`;
}

/* ----------------------------------- .env ------------------------------------ */

function randomPassword(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function generateEnv(schema: ClubSchema, password = randomPassword()): string {
  return `# Секреты портала «${schema.clubName}». Не публикуйте этот файл.
PB_ADMIN_EMAIL=admin@${slugify(schema.clubName).replace(/_/g, '-')}.club
PB_ADMIN_PASSWORD=${password}
PORTAL_PORT=8080
`;
}

/* ----------------------------- PocketBase migration -------------------------- */

interface PbField {
  name: string;
  type: string;
  required: boolean;
  [key: string]: unknown;
}

function toPbField(field: EntityField): PbField | null {
  const base = { name: field.id, required: field.required };
  switch (field.type) {
    case 'text':
      return { ...base, type: 'text', max: 2000 };
    case 'number':
      return { ...base, type: 'number' };
    case 'date':
      return { ...base, type: 'date' };
    case 'select':
    case 'status':
      return { ...base, type: 'select', maxSelect: 1, values: field.options?.length ? field.options : ['—'] };
    case 'file':
      return {
        ...base,
        type: 'file',
        maxSelect: 1,
        maxSize: 10 * 1024 * 1024,
        mimeTypes: [],
        thumbs: ['480x270'],
      };
    case 'relation':
      return null; // создаются вторым проходом, когда известны id коллекций
  }
}

function collectionPlan(entity: ClubEntity) {
  return {
    name: entity.id,
    fields: [
      ...entity.fields.map(toPbField).filter((f): f is PbField => f !== null),
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false, required: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true, required: false },
    ],
  };
}

export function generatePocketbaseMigration(schema: ClubSchema): string {
  const collections = schema.entities.map(collectionPlan);
  const relations = schema.entities.flatMap((entity) =>
    resolveRelations(entity, schema).map((r) => ({
      collection: entity.id,
      name: r.name,
      target: r.targetEntityId,
      maxSelect: r.multiple ? 999 : 1,
      required: r.required,
    })),
  );

  return `/// <reference path="../pb_data/types.d.ts" />
// Facet OS: коллекции клуба «${schema.clubName}».
// Сгенерировано автоматически из club-schema.json — PocketBase применит миграцию при первом старте.
// Чтение — публичное (портал), запись — только через панель управления /_/ (суперпользователи).

const COLLECTIONS = ${JSON.stringify(collections, null, 2)};

const RELATIONS = ${JSON.stringify(relations, null, 2)};

migrate((app) => {
  for (const def of COLLECTIONS) {
    const collection = new Collection({
      type: "base",
      name: def.name,
      listRule: "",
      viewRule: "",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: def.fields,
    });
    app.save(collection);
  }

  for (const rel of RELATIONS) {
    const collection = app.findCollectionByNameOrId(rel.collection);
    const target = app.findCollectionByNameOrId(rel.target);
    collection.fields.add(new RelationField({
      name: rel.name,
      required: rel.required,
      collectionId: target.id,
      maxSelect: rel.maxSelect,
      cascadeDelete: false,
    }));
    app.save(collection);
  }
}, (app) => {
  for (const def of [...COLLECTIONS].reverse()) {
    try {
      app.delete(app.findCollectionByNameOrId(def.name));
    } catch (_) {
      // коллекция уже удалена
    }
  }
});
`;
}

/* -------------------------------------- web ---------------------------------- */

export function generatePortalCss(schema: ClubSchema): string {
  return `/* Токены темы «${schema.clubName}» — сгенерировано Facet OS */
${cssVarsToText(themeToCssVars(schema.theme))}

${dividerCss(schema.theme)}

${portalBaseCss}`;
}

export function generatePortalHtml(schema: ClubSchema): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${esc(schema.motto)}" />
    <meta name="theme-color" content="${schema.theme.colors.primary}" />
    <title>${esc(schema.clubName)}</title>
    <link rel="stylesheet" href="/portal.css" />
  </head>
  <body>
    <div id="app"><div class="fx-shell"><div class="fx-empty">Загрузка портала…</div></div></div>
    <script src="/portal.js" defer></script>
  </body>
</html>
`;
}

/* ------------------------------------ DEPLOY.md ------------------------------ */

export function generateDeployMd(schema: ClubSchema): string {
  const folder = `${slugify(schema.clubName).replace(/_/g, '-')}-portal`;
  const entityList = schema.entities
    .map((e) => {
      const rels = resolveRelations(e, schema);
      const relText = rels.length
        ? ` Связи: ${rels.map((r) => `\`${r.name}\` → \`${r.targetEntityId}\`${r.multiple ? ' (много)' : ''}`).join(', ')}.`
        : '';
      return `| \`${e.id}\` | ${e.pluralName} | ${e.fields.length} |${relText ? relText : ' —'} |`;
    })
    .join('\n');

  return `# 🚀 Как развернуть портал «${schema.clubName}»

> ${schema.motto || 'Портал клуба, собранный в Facet OS.'}

Эта папка — полностью готовый self-hosted портал. Внутри:

| Файл / папка | Что это |
| --- | --- |
| \`docker-compose.yml\` | Описание двух контейнеров: **pocketbase** (база данных + API + админка) и **web** (Nginx с порталом) |
| \`.env\` | Логин/пароль администратора и порт. **Поменяйте пароль перед запуском на сервере!** |
| \`club-schema.json\` | Декларативный слепок клуба: тема, сущности, поля, связи. Можно снова импортировать в Facet OS |
| \`pocketbase/\` | Dockerfile и миграции — коллекции создаются автоматически при первом старте |
| \`nginx/default.conf\` | Конфигурация веб-сервера: портал + проксирование \`/api\` и \`/_/\` |
| \`web/\` | Сам портал (HTML + CSS + JS без сборки) |

> 💡 Файл \`.env\` начинается с точки — в macOS/Linux он скрыт. Показать: \`ls -la\` или \`Cmd+Shift+.\` в Finder.

---

## Шаг 0. Установите Docker

- **Windows / macOS:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) → установить → запустить.
- **Linux:** \`curl -fsSL https://get.docker.com | sh\`

Проверка: \`docker compose version\` должен вывести версию (v2.x и новее).

---

## Шаг 1. Запуск на своём компьютере

\`\`\`bash
# 1. Распакуйте архив и перейдите в папку
cd ${folder}

# 2. Соберите и запустите контейнеры в фоне
docker compose up -d --build

# 3. Убедитесь, что оба сервиса в статусе "running" / "healthy"
docker compose ps
\`\`\`

Откройте:

- **Портал:** http://localhost:8080
- **Панель управления:** http://localhost:8080/_/ — логин и пароль из файла \`.env\` (\`PB_ADMIN_EMAIL\` / \`PB_ADMIN_PASSWORD\`)

В панели управления уже созданы коллекции — добавляйте записи, и они сразу появятся на портале.

| Коллекция | На портале | Полей | Связи |
| --- | --- | --- | --- |
${entityList}

---

## Шаг 2. Запуск на VPS (сервер в интернете)

Подойдёт любой VPS с Ubuntu 22.04+ и 1 ГБ RAM.

\`\`\`bash
# 1. Скопируйте папку на сервер (выполняется на вашем компьютере)
scp -r ${folder} root@IP_СЕРВЕРА:/opt/

# 2. Подключитесь к серверу
ssh root@IP_СЕРВЕРА

# 3. Установите Docker (один раз)
curl -fsSL https://get.docker.com | sh

# 4. Задайте надёжный пароль администратора
cd /opt/${folder}
nano .env          # измените PB_ADMIN_PASSWORD (минимум 10 символов)

# 5. Запустите
docker compose up -d --build
\`\`\`

Портал будет доступен по адресу \`http://IP_СЕРВЕРА:8080\`.

### Хотите на 80 порт и свой домен?

1. В \`.env\` поставьте \`PORTAL_PORT=80\` и выполните \`docker compose up -d\`.
2. В DNS домена создайте A-запись на IP сервера.
3. Для HTTPS проще всего поставить перед портом [Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy):
   \`caddy reverse-proxy --from club.example.ru --to localhost:8080\` (тогда \`PORTAL_PORT\` оставьте 8080).

---

## Полезные команды

| Задача | Команда |
| --- | --- |
| Посмотреть логи | \`docker compose logs -f\` |
| Остановить | \`docker compose down\` |
| Перезапустить после правок \`web/\` или \`club-schema.json\` | \`docker compose restart web\` |
| Обновить PocketBase | поменяйте \`PB_VERSION\` в \`docker-compose.yml\` → \`docker compose up -d --build\` |
| Резервная копия базы | \`docker compose cp pocketbase:/pb/pb_data ./backup-$(date +%F)\` |

## Как поменять структуру клуба потом

Миграции применяются **один раз** — при первом запуске. Если вы изменили сущности в Facet OS:

- **Данных ещё нет:** \`docker compose down -v\` (⚠️ удалит базу) → замените папку новым экспортом → \`docker compose up -d --build\`.
- **Данные уже есть:** добавьте новые поля вручную в панели \`/_/\` → *Collections*, а затем замените \`club-schema.json\` новым — портал подхватит изменения после \`docker compose restart web\`.

## Права доступа

- Просматривать записи может любой посетитель портала.
- Создавать, менять и удалять — только администраторы через \`/_/\`.
  Добавить ещё админа: \`/_/\` → *System → Superusers → New*.
- Правила можно изменить для каждой коллекции в \`/_/\` → *Collections → ⚙ → API Rules*.

## Что-то не работает?

| Симптом | Решение |
| --- | --- |
| \`port is already allocated\` | Порт 8080 занят — поменяйте \`PORTAL_PORT\` в \`.env\` |
| На портале «Не удалось загрузить данные» | \`docker compose logs pocketbase\` — смотрите ошибку миграции |
| Не пускает в \`/_/\` | Пароль из \`.env\` применяется только при первом запуске. Задать новый: \`docker compose exec pocketbase /pb/pocketbase superuser upsert EMAIL ПАРОЛЬ --dir=/pb/pb_data\` |
| \`exec format error\` на ARM-сервере | Соберите заново: \`docker compose build --no-cache\` (архитектура определяется автоматически) |

---

Собрано в **Facet OS** · ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
`;
}

/* ------------------------------------ Bundle --------------------------------- */

export function buildExportFiles(schema: ClubSchema): ExportFile[] {
  const stamp = Math.floor(Date.now() / 1000);
  return [
    { path: 'docker-compose.yml', content: generateDockerCompose(schema), description: 'PocketBase + Nginx в двух контейнерах' },
    { path: 'club-schema.json', content: generateSchemaJson(schema), description: 'Декларативный слепок клуба' },
    { path: 'DEPLOY.md', content: generateDeployMd(schema), description: 'Инструкция: локально и на VPS' },
    { path: '.env', content: generateEnv(schema), description: 'Логин и случайный пароль администратора' },
    { path: 'pocketbase/Dockerfile', content: pocketbaseDockerfile, description: 'Образ PocketBase с миграциями' },
    {
      path: `pocketbase/pb_migrations/${stamp}_facet_collections.js`,
      content: generatePocketbaseMigration(schema),
      description: 'Создание коллекций и связей',
    },
    {
      path: `pocketbase/pb_migrations/${stamp + 1}_facet_superuser.js`,
      content: superuserMigration,
      description: 'Суперпользователь из .env',
    },
    { path: 'nginx/default.conf', content: nginxConf, description: 'Портал + прокси /api и /_/' },
    { path: 'web/index.html', content: generatePortalHtml(schema), description: 'Точка входа портала' },
    { path: 'web/portal.css', content: generatePortalCss(schema), description: 'Тема клуба в CSS-переменных' },
    { path: 'web/portal.js', content: portalJs, description: 'Рендер портала из схемы и API' },
  ];
}

export function exportFolderName(schema: ClubSchema): string {
  return `${slugify(schema.clubName).replace(/_/g, '-')}-portal`;
}

/** Собирает zip-архив в браузере и отдаёт его на скачивание. */
export async function downloadZip(schema: ClubSchema, files = buildExportFiles(schema)): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(exportFolderName(schema))!;
  for (const file of files) folder.file(file.path, file.content);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  saveAs(blob, `${exportFolderName(schema)}.zip`);
}

export function downloadSingleFile(file: ExportFile): void {
  const name = file.path.split('/').pop() ?? file.path;
  saveAs(new Blob([file.content], { type: 'text/plain;charset=utf-8' }), name);
}
