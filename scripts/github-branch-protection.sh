#!/usr/bin/env bash
# ============================================================
# Protege la rama main del repo (branch protection clásica).
# Uso: ./scripts/github-branch-protection.sh <github_token>
# Requiere permiso "Administration: write" (fine-grained).
#
# Reglas aplicadas (equilibradas para proyecto personal):
#  - CI "Lint + Build" obligatorio y rama al día (strict)
#  - No se permiten force-push ni borrar la rama
#  - Los comentarios de los PR deben resolverse antes de merger
#  - SIN revisión obligatoria ni bloqueo de admins
#    (un dev solo puede seguir haciendo push directo)
# ============================================================
set -euo pipefail

TOKEN="${1:?Uso: $0 <github_token>}"
API="https://api.github.com/repos/Peiboll17/helpdesk/branches/main/protection"

BODY='{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Lint + Build"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "required_linear_history": true,
  "lock_branch": false
}'

echo "→ Aplicando protección a main…"
HTTP=$(curl -s -o /tmp/gh-protection.json -w '%{http_code}' -X PUT "$API" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -d "${BODY}")

if [ "$HTTP" = "200" ]; then
  echo "✅ Rama main protegida (HTTP 200)"
  python3 -c "
import json
r = json.load(open('/tmp/gh-protection.json'))
rc = r.get('required_status_checks') or {}
print('   checks requeridos :', rc.get('contexts'), '| strict:', rc.get('strict'))
print('   force-pushes      :', 'bloqueados' if r.get('allow_force_pushes') is False else 'permitidos')
print('   borrar rama       :', 'bloqueado' if r.get('allow_deletions') is False else 'permitido')
print('   resolver comentarios:', r.get('required_conversation_resolution'))
print('   historial lineal  :', r.get('required_linear_history'))
print('   bloquear admins   :', bool(r.get('enforce_admins')))"
else
  echo "❌ HTTP $HTTP — respuesta:"
  head -c 400 /tmp/gh-protection.json; echo
  exit 1
fi
