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

# Имя Docker-проекта определяет том с базой. Закрепляем текущее до любых изменений:
# новый docker-compose.yml не должен «переехать» на новый пустой том (например, после переименования клуба).
touch "$TARGET/.env"
if ! grep -q '^COMPOSE_PROJECT_NAME=' "$TARGET/.env"; then
  PROJECT=$(sed -n 's/^name:[[:space:]]*//p' "$TARGET/docker-compose.yml" | head -1 | tr -d "\"'")
  if [ -z "$PROJECT" ]; then
    PROJECT=$(basename "$TARGET" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]//g')
  fi
  printf '\n# Имя Docker-проекта = имя тома с базой. Не меняйте.\nCOMPOSE_PROJECT_NAME=%s\n' "$PROJECT" >> "$TARGET/.env"
  echo "→ Закреплено имя проекта Docker: $PROJECT"
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
# Файлы плагинов генерируются целиком — убираем прежние (в т.ч. отключённых плагинов).
rm -f "$TARGET"/pocketbase/pb_hooks/plugin-*.pb.js
rm -rf "$TARGET/web/plugins"
cp -R "$HERE/payload/." "$TARGET/"
while IFS= read -r LINE || [ -n "$LINE" ]; do
  case "$LINE" in ''|\#*) continue ;; esac
  KEY=${LINE%%=*}
  case "$KEY" in
    FACET_PLUGIN_*)
      # Секреты плагинов из редактора заменяют прежние значения.
      grep -v "^$KEY=" "$TARGET/.env" > "$TARGET/.env.tmp" || true
      mv "$TARGET/.env.tmp" "$TARGET/.env"
      printf '%s\n' "$LINE" >> "$TARGET/.env" ;;
    *)
      grep -q "^$KEY=" "$TARGET/.env" || printf '%s\n' "$LINE" >> "$TARGET/.env" ;;
  esac
done < "$HERE/env.defaults"
chmod +x "$TARGET"/*.sh

echo "→ Пересобираю и запускаю (миграции применятся автоматически)…"
# --force-recreate: файлы, смонтированные по одному (club-schema.json, конфиги Nginx), должны подхватиться заново.
if ! (cd "$TARGET" && docker compose up -d --build --force-recreate --wait); then
  echo "✗ Портал не поднялся. Логи: (cd $TARGET && docker compose logs pocketbase)"
  echo "  Откат к прежней версии: (cd $TARGET && ./restore.sh backups/update-$STAMP)"
  exit 3
fi
echo "✓ Обновление применено. Копия прежней версии: backups/update-$STAMP"
