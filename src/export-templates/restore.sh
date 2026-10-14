#!/usr/bin/env sh
# Facet OS: восстановление из резервной копии.
#   ./restore.sh backups/pb_data-20261014-030000.tar.gz   — только база
#   ./restore.sh backups/update-20261014-120000            — откат обновления (база + файлы портала)
set -eu
cd "$(dirname "$0")"
SRC="${1:-}"

if [ -z "$SRC" ] || [ ! -e "$SRC" ]; then
  echo "Использование: ./restore.sh <архив pb_data-*.tar.gz | папка backups/update-*>"
  echo "Доступные копии:"
  ls -1 backups 2>/dev/null || echo "  (нет)"
  exit 1
fi

if [ "${YES:-0}" != 1 ]; then
  printf "Текущая база будет заменена копией «%s». Продолжить? [y/N] " "$SRC"
  read -r ANSWER || ANSWER=""
  case "$ANSWER" in y|Y|yes|д|Д|да) ;; *) echo "Отменено."; exit 1 ;; esac
fi

if [ -d "$SRC" ]; then
  DB="$(cd "$SRC" && pwd)/pb_data.tar.gz"
  FILES="$(cd "$SRC" && pwd)/files.tar.gz"
else
  DB="$(cd "$(dirname "$SRC")" && pwd)/$(basename "$SRC")"
  FILES=""
fi
[ -f "$DB" ] || { echo "Не найден архив базы: $DB"; exit 1; }

echo "→ На всякий случай сохраняю текущее состояние…"
./backup.sh

echo "→ Восстанавливаю базу…"
docker compose stop pocketbase >/dev/null
docker compose run --rm --no-deps -T -v "$DB:/restore.tar.gz:ro" --entrypoint sh pocketbase \
  -c "rm -rf /pb/pb_data/* && tar xzf /restore.tar.gz -C /pb"

if [ -n "$FILES" ] && [ -f "$FILES" ]; then
  echo "→ Возвращаю файлы портала и миграции к версии до обновления…"
  find pocketbase/pb_migrations -name '*.js' -delete
  tar xzf "$FILES" -C .
fi

echo "→ Запускаю…"
docker compose up -d --build --wait
echo "✓ Восстановлено из $SRC"
