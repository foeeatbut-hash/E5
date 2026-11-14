#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Подгружаем популярные пути Node.js (Homebrew / NVM) при запуске двойным кликом без login shell
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ -s "${HOME:-}/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "${HOME}/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

mkdir -p "$ROOT/data" "$ROOT/logs"

echo "[E3ProMax] Каталог проекта: $ROOT"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "[E3ProMax] ОШИБКА: не найден Node.js / npm."
  echo "Установите Node.js >= 20 с https://nodejs.org/ (macOS: brew install node) и повторите запуск."
  read -r -p "Нажмите Enter для выхода..." || true
  exit 1
fi

NODE_MAJOR="$(node -p "parseInt(process.versions.node, 10)" 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "[E3ProMax] ОШИБКА: найден Node.js v$NODE_MAJOR, требуется версия >= 20."
  echo "Обновите Node.js с https://nodejs.org/ и повторите запуск."
  read -r -p "Нажмите Enter для выхода..." || true
  exit 1
fi

if [[ ! -f "$ROOT/node_modules/vite/package.json" || ! -f "$ROOT/node_modules/tsx/dist/cli.mjs" ]]; then
  echo "[E3ProMax] Первый запуск: установка зависимостей (npm install)..."
  npm install --no-audit --no-fund || npm install --no-audit --no-fund --legacy-peer-deps
fi

export PORT="${PORT:-3000}"
export FLUX_AUTO_PORT="${FLUX_AUTO_PORT:-1}"
export FLUX_OPEN_BROWSER="${FLUX_OPEN_BROWSER:-1}"
export FLUX_DATA_DIR="$ROOT/data"
export FLUX_LOG_DIR="$ROOT/logs"
export FLUX_DEBUG=1

echo "[E3ProMax] Запуск сервера... Браузер откроется автоматически."
echo "[E3ProMax] Данные проекта: $FLUX_DATA_DIR/project.json"
echo "[E3ProMax] Логи сервера:   $FLUX_LOG_DIR/e3promax-server.log"

if [[ -f "$ROOT/node_modules/tsx/dist/cli.mjs" ]]; then
  exec node "$ROOT/node_modules/tsx/dist/cli.mjs" server.ts
else
  exec npm run dev
fi
