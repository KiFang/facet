# Facet OS

🏛️ Open-source визуальный no-code билдер self-hosted порталов для студенческих клубов, гильдий и кампусов.
Соберите структуру клуба и стиль в редакторе — и одной кнопкой получите готовый к запуску Docker-проект.

## Быстрый старт

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production-сборка в dist/
```

## Режимы редактора

| Режим | Для кого | Что доступно |
| --- | --- | --- |
| **Easy** | Первый запуск | Шаблоны клубов, название/девиз, палитры, скругление и плотность, добавление/удаление модулей |
| **Advanced** | Оргкомитет | Слайдеры токенов темы (скругление 0–28px, рамки, тени, разделители, цвета с проверкой контраста), конструктор полей и связей |
| **Pro** | Технари | Системные id полей/коллекций, прямое редактирование и импорт `club-schema.json` с валидацией |

Живое превью справа использует **тот же CSS**, что уходит в экспорт, — что видите, то и получите.

## Экспорт в Self-Host

Кнопка «Экспорт в Self-Host» показывает все файлы и собирает zip прямо в браузере:

```
<club>-portal/
├── docker-compose.yml          # pocketbase + nginx
├── .env                        # логин и случайный пароль администратора
├── club-schema.json            # декларативный слепок клуба
├── DEPLOY.md                   # инструкция: локально и на VPS
├── pocketbase/
│   ├── Dockerfile
│   └── pb_migrations/          # коллекции, связи и суперпользователь создаются автоматически
├── nginx/default.conf          # портал + прокси /api и /_/
└── web/                        # портал без сборки: index.html, portal.css, portal.js
```

Запуск: `docker compose up -d --build` → портал на `http://localhost:8080`, панель управления на `/_/`.
Чтение записей публичное, запись — только администраторы через `/_/`.

## Структура

```
src/
├── types/schema.ts          # ThemeTokens, EntityField, ClubEntity, ClubSchema
├── store/useClubStore.ts    # Zustand-стор (persist в localStorage)
├── data/presets.ts          # пресеты: general, gaming, boardgames, media
├── components/              # Navbar, ThemeCustomizer, EntityBuilder, LivePreview, ExportDialog, SchemaEditor, ui/
├── utils/
│   ├── exporter.ts          # генерация docker-compose, миграций PocketBase, DEPLOY.md, zip
│   ├── theme.ts             # токены → CSS-переменные (общие для превью и портала)
│   ├── relations.ts         # единый резолвер связей
│   └── validate.ts          # валидация club-schema.json
└── export-templates/        # nginx.conf, Dockerfile, portal.js/css — кладутся в архив как есть
```

Стек: React + TypeScript + Vite, Tailwind CSS, Radix UI, Zustand, lucide-react, JSZip + file-saver. Бэкенд портала — PocketBase 0.25.
