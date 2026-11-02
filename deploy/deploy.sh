#!/usr/bin/env bash
# ============================================================
# NexoDesk · despliegue en VPS (build local → rsync → restart)
# ------------------------------------------------------------
# La e2-micro del free tier (1 GB) NO puede compilar Next.js:
# este script construye en TU máquina y solo sube el artefacto
# standalone (~50-80 MB). El esquema y el seed se aplican por
# túnel SSH (ver docs/DESPLIEGUE.md §4).
#
# Uso:
#   VPS=usuario@TU-IP ./deploy/deploy.sh
#   (o edita los valores de abajo)
# ============================================================
set -euo pipefail

# ── Configuración ────────────────────────────────────────────
VPS="${VPS:-usuario@TU-IP-EXTERNA}"          # ssh destino
APP_DIR="${APP_DIR:-/opt/nexodesk/current}"  # igual que los .service
SOCKET_PATH="${SOCKET_PATH:-/socket.io}"     # path público del WebSocket
# ─────────────────────────────────────────────────────────────

command -v bun >/dev/null || { echo "✗ Necesitas bun: https://bun.sh"; exit 1; }
command -v rsync >/dev/null || { echo "✗ Necesitas rsync"; exit 1; }

echo "▸ 1/5 · Instalando dependencias…"
bun install --frozen-lockfile
bun install --cwd mini-services/realtime

echo "▸ 2/5 · Cliente Prisma (esquema MySQL)…"
DATABASE_URL="mysql://build:build@localhost:3306/build" \
  bunx prisma generate --schema prisma/schema.mysql.prisma

echo "▸ 3/5 · Compilando Next.js standalone…"
# NEXT_PUBLIC_* se incrustan en el bundle: deben coincidir con el
# SOCKET_PATH del servicio realtime (deploy/nexodesk-realtime.service)
NEXT_PUBLIC_SOCKET_URL=/ NEXT_PUBLIC_SOCKET_PATH="$SOCKET_PATH" bun run build

echo "▸ 4/5 · Sincronizando con $VPS:$APP_DIR …"
rsync -az --delete .next/standalone/ "$VPS:$APP_DIR/"
rsync -az --delete mini-services/realtime/ "$VPS:$APP_DIR/realtime/"

echo "▸ 5/5 · Reiniciando servicios y healthcheck…"
ssh "$VPS" "sudo systemctl restart nexodesk nexodesk-realtime && sleep 2 \
  && curl -fsS http://127.0.0.1:3000/api/stats >/dev/null \
  && curl -fsS http://127.0.0.1:3010/health >/dev/null \
  && echo '✔ app y realtime responden'"

echo "✔ Despliegue completado → https://TU-DOMINIO"
echo ""
echo "  Nota: si después quieres desarrollar en local, regenera el"
echo "  cliente SQLite con:  bunx prisma generate && bun run db:push"
