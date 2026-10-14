#!/usr/bin/env sh
# Facet OS: применение обновления к развёрнутому порталу.
#   ./apply-update.sh /opt/club-portal
# Перед изменениями делает полную резервную копию (база + файлы), откат: ./restore.sh backups/update-…
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
TARGET="${1:-}"

if [ -z "$TARGET" ] || [ ! -f "$TARGET/docker-compose.yml" ]; then
  echo "Использование: ./apply-update.sh <папка портала на сервере>"
  echo "Например:      ./apply-update.sh /opt/club-portal"
  exit 1
fi
TARGET=$(cd "$TARGET" && pwd)

sha() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

EXPECTED=$(cat "$HERE/.facet/base-schema.sha256")
ACTUAL=$(sha "$TARGET/club-schema.json")
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "✗ Обновление собрано для другой версии портала."
  echo "  Ожидался club-schema.json с SHA-256 $EXPECTED,"
  echo "  а на сервере — $ACTUAL."
  echo "  Загрузите club-schema.json с сервера в Facet OS (Экспорт → Обновление → «Версия на сервере») и соберите обновление заново."
  if [ "${FORCE:-0}" != 1 ]; then exit 2; fi
  echo "  FORCE=1 — продолжаю на свой страх и риск."
fi

echo "Изменения:"
cat "$HERE/CHANGES.txt"
echo ""
if [ "${YES:-0}" != 1 ]; then
  printf "Применить обновление к %s? [y/N] " "$TARGET"
  read -r ANSWER || ANSWER=""
  case "$ANSWER" in y|Y|yes|д|Д|да) ;; *) echo "Отменено."; exit 1 ;; esac
fi

STAMP=$(date +%Y%m%d-%H%M%S)
BK="$TARGET/backups/update-$STAMP"
mkdir -p "$BK"

echo "→ Резервная копия файлов портала…"
tar czf "$BK/files.tar.gz" -C "$TARGET" --exclude=./backups --exclude=./.env .

echo "→ Резервная копия базы…"
(
  cd "$TARGET"
  docker compose stop pocketbase >/dev/null
  docker compose run --rm --no-deps -T -v "$BK:/backup" --entrypoint sh pocketbase \
    -c "tar czf /backup/pb_data.tar.gz -C /pb pb_data"
)

echo "→ Копирую новые файлы…"
cp -R "$HERE/payload/." "$TARGET/"
touch "$TARGET/.env"
while IFS= read -r LINE || [ -n "$LINE" ]; do
  case "$LINE" in ''|\#*) continue ;; esac
  KEY=${LINE%%=*}
  grep -q "^$KEY=" "$TARGET/.env" || printf '%s\n' "$LINE" >> "$TARGET/.env"
done < "$HERE/env.defaults"
chmod +x "$TARGET"/*.sh

echo "→ Пересобираю и запускаю (миграции применятся автоматически)…"
if ! (cd "$TARGET" && docker compose up -d --build --wait); then
  echo "✗ Портал не поднялся. Логи: (cd $TARGET && docker compose logs pocketbase)"
  echo "  Откат к прежней версии: (cd $TARGET && ./restore.sh backups/update-$STAMP)"
  exit 3
fi
echo "✓ Обновление применено. Копия прежней версии: backups/update-$STAMP"
