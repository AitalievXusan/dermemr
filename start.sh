#!/usr/bin/env bash
# Запуск DermEMR на macOS / Linux
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Установите Node.js LTS: https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install
npm run build
[ -f .env ] || cp .env.example .env
exec node server/dist/server.mjs
