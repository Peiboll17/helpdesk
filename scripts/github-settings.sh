#!/usr/bin/env bash
# ============================================================
# Configura descripción y topics del repo de GitHub vía API.
# Uso: ./scripts/github-settings.sh <github_token>
# Requiere un token con permiso "Administration: write"
# (fine-grained) o scope "repo" (classic).
# ============================================================
set -euo pipefail

TOKEN="${1:?Uso: $0 <github_token>}"
REPO="Peiboll17/helpdesk"
API="https://api.github.com/repos/${REPO}"

DESCRIPTION="Helpdesk con bandeja única multicanal (email, formulario, WhatsApp, chat en vivo), enrutamiento Zero-Touch, Copiloto IA con KB y portal de cliente en tiempo real"

TOPICS='{"names":["helpdesk","ticketing-system","customer-support","nextjs","react","typescript","prisma","socketio","tailwindcss","shadcn-ui","ai-copilot","knowledge-base","csat","zero-touch"]}'

echo "→ Actualizando descripción…"
curl -sf -X PATCH "$API" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"description\":\"${DESCRIPTION}\"}" | head -c 400

echo ""
echo "→ Actualizando topics…"
curl -sf -X PUT "${API}/topics" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -d "${TOPICS}" | head -c 400

echo ""
echo "✅ Hecho: descripción y topics aplicados a ${REPO}"
