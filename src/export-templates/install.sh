#!/usr/bin/env sh
# Facet OS: установка портала на сервер одной командой.
#   sudo ./install.sh                     — спросит домен (можно оставить пустым)
#   sudo ./install.sh club.example.ru     — сразу с HTTPS через Caddy
set -eu
cd "$(dirname "$0")"
DOMAIN_ARG="${1:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "→ Docker не найден — устанавливаю (get.docker.com)…"
  if [ "$(id -u)" != 0 ]; then echo "✗ Нужны права root: sudo ./install.sh"; exit 1; fi
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "✗ Нужен Docker Compose v2 (docker compose version)"; exit 1; }

set_env() {
  if grep -q "^$1=" .env; then
    sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

if [ -z "$DOMAIN_ARG" ] && [ -t 0 ]; then
  printf "Домен портала, например club.example.ru (Enter — без HTTPS, доступ по IP:порту): "
  read -r DOMAIN_ARG || DOMAIN_ARG=""
fi

if [ -n "$DOMAIN_ARG" ]; then
  echo "→ Включаю HTTPS для $DOMAIN_ARG (A-запись домена должна указывать на этот сервер)"
  set_env DOMAIN "$DOMAIN_ARG"
  set_env COMPOSE_PROFILES https
  set_env PORTAL_BIND 127.0.0.1
fi

chmod +x ./*.sh
echo "→ Собираю и запускаю контейнеры (первый раз — пара минут)…"
docker compose up -d --build --wait

PORT=$(grep '^PORTAL_PORT=' .env | cut -d= -f2)
EMAIL=$(grep '^PB_ADMIN_EMAIL=' .env | cut -d= -f2)
PASS=$(grep '^PB_ADMIN_PASSWORD=' .env | cut -d= -f2)
if [ -n "$DOMAIN_ARG" ]; then URL="https://$DOMAIN_ARG"; else
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  URL="http://${IP:-localhost}:${PORT:-8080}"
fi
echo ""
echo "✓ Портал запущен: $URL"
echo "  Панель управления: $URL/_/"
echo "  Логин: $EMAIL"
echo "  Пароль: $PASS   (поменяйте в панели: Superusers)"
echo "  Резервные копии: каждую ночь автоматически + ./backup.sh вручную"
