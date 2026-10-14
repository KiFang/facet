#!/usr/bin/env sh
# Facet OS: ручная резервная копия базы и загруженных файлов в ./backups
# Использование: ./backup.sh
set -eu
cd "$(dirname "$0")"
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
NAME="pb_data-$STAMP.tar.gz"

echo "→ Останавливаю pocketbase для целостной копии…"
docker compose stop pocketbase >/dev/null
trap 'docker compose start pocketbase >/dev/null 2>&1 || true' EXIT
docker compose run --rm --no-deps -T -v "$PWD/backups:/backup" --entrypoint sh pocketbase \
  -c "tar czf /backup/$NAME -C /pb pb_data"
echo "✓ Готово: backups/$NAME"
echo "  Скопируйте файл с сервера, например: scp сервер:$(pwd)/backups/$NAME ."
