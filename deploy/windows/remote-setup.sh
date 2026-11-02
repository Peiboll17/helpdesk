#!/usr/bin/env bash
# ============================================================
# NexoDesk · instalación en la VPS (lo ejecuta upload.ps1)
# ------------------------------------------------------------
# Idempotente: se puede relanzar sin estropear nada.
#   · Crea la BD helpdesk + usuario MySQL + /opt/nexodesk/.env
#     SOLO si no existen (si crea claves, las imprime 1 vez).
#   · Despliega el contenido standalone y el realtime.
#   · Instala unzip y bun si faltan.
# ============================================================
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "── 1/7 · Extrayendo paquetes…"
rm -rf "$HOME/nx"
mkdir -p "$HOME/nx"
tar -xzf "$HOME/nx-deploy/nexodesk-app.tar.gz" -C "$HOME/nx"
tar -xzf "$HOME/nx-deploy/nexodesk-rt.tar.gz"  -C "$HOME/nx"

echo "── 2/7 · Usuario del sistema y carpetas…"
if ! id nexodesk >/dev/null 2>&1; then
  sudo useradd -r -m -d /opt/nexodesk -s /usr/sbin/nologin nexodesk
fi
sudo mkdir -p /opt/nexodesk/current

echo "── 3/7 · Base de datos, usuario MySQL y /opt/nexodesk/.env…"
if [ ! -f /opt/nexodesk/.env ]; then
  DBPASS="Nexo-$(head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  WHSEC="whsec-$(head -c24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  sudo mysql -e "CREATE DATABASE IF NOT EXISTS helpdesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  sudo mysql -e "CREATE USER IF NOT EXISTS 'nexodesk'@'localhost' IDENTIFIED BY '$DBPASS';"
  sudo mysql -e "ALTER USER 'nexodesk'@'localhost' IDENTIFIED BY '$DBPASS';"
  sudo mysql -e "GRANT ALL PRIVILEGES ON helpdesk.* TO 'nexodesk'@'localhost'; FLUSH PRIVILEGES;"
  printf 'DATABASE_URL="mysql://nexodesk:%s@127.0.0.1:3306/helpdesk"\nREALTIME_URL="http://127.0.0.1:3010"\nINBOUND_WEBHOOK_SECRET="%s"\n' "$DBPASS" "$WHSEC" | sudo tee /opt/nexodesk/.env >/dev/null
  sudo chmod 600 /opt/nexodesk/.env
  sudo chown nexodesk:nexodesk /opt/nexodesk/.env
  echo ""
  echo "  ╔══════════════════════════════════════════════════╗"
  echo "  ║  CLAVES NUEVAS · cópialas a un lugar privado YA  ║"
  echo "  ╚══════════════════════════════════════════════════╝"
  sudo cat /opt/nexodesk/.env
  echo ""
else
  echo "  (ya existía: no se toca)"
  for K in DATABASE_URL REALTIME_URL INBOUND_WEBHOOK_SECRET; do
    sudo grep -q "^${K}=" /opt/nexodesk/.env || echo "  ⚠ OJO: a tu .env le falta ${K} · avísame en el chat"
  done
fi

echo "── 4/7 · Instalando la app (standalone)…"
sudo rm -rf /opt/nexodesk/current
sudo cp -a "$HOME/nx/standalone" /opt/nexodesk/current
if [ -f /opt/nexodesk/current/fix-chunk.js ]; then
  # Chunk que Windows no pudo crear por llevar ":" en el nombre
  sudo mv /opt/nexodesk/current/fix-chunk.js "/opt/nexodesk/current/.next/server/chunks/[externals]_node:crypto_c20cce38._.js"
fi

echo "── 5/7 · Instalando el realtime…"
sudo rm -rf /opt/nexodesk/current/realtime
sudo cp -a "$HOME/nx/realtime" /opt/nexodesk/current/realtime

echo "── 6/7 · Permisos…"
sudo chown -R nexodesk:nexodesk /opt/nexodesk

echo "── 7/7 · Herramientas (unzip y bun, si faltan)…"
if ! command -v unzip >/dev/null 2>&1 || ! command -v bun >/dev/null 2>&1; then
  sudo apt-get update -qq || true
  sudo apt-get install -y unzip >/dev/null
fi
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
fi
echo "  bun $(bun --version)"

# ── Prueba de arranque: levanta la app 25 s en el puerto 3100 y la para.
#    Detecta YA un build roto (chunk/engine que falten) sin esperar a Fase 5.
echo "── Prueba de arranque de la app (unos 15 s)…"
sudo bash -c '
cd /opt/nexodesk/current
set -a; . /opt/nexodesk/.env; set +a
export PORT=3100 NEXT_TELEMETRY_DISABLED=1
timeout 25 node server.js > /tmp/nx-smoke.log 2>&1 &
SPID=$!
sleep 9
C=$(node -e "fetch(\"http://127.0.0.1:3100/\").then(r=>process.stdout.write(String(r.status))).catch(()=>process.stdout.write(\"000\"))" 2>/dev/null || echo 000)
kill $SPID 2>/dev/null || true
pkill -P $SPID 2>/dev/null || true
echo "  HTTP / -> $C  (200 o 307 = arranca bien)"
'
tail -4 /tmp/nx-smoke.log 2>/dev/null | sed "s/^/  │ /" || true

# Si los servicios ya existían (redespliegue), reinícialos
sudo -n systemctl restart nexodesk nexodesk-realtime 2>/dev/null || true

echo ""
echo "✔ Verificación final:"
test -f /opt/nexodesk/current/server.js && echo "  ✔ server.js"
test -f "/opt/nexodesk/current/.next/server/chunks/[externals]_node:crypto_c20cce38._.js" && echo "  ✔ chunk node:crypto"
test -d /opt/nexodesk/current/.next/static && echo "  ✔ ficheros estáticos"
test -f /opt/nexodesk/current/realtime/index.ts && echo "  ✔ realtime"
test -f /opt/nexodesk/.env && echo "  ✔ /opt/nexodesk/.env"
if sudo mysql -e "SELECT 1 FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='helpdesk';" | grep -q 1; then
  echo "  ✔ base de datos helpdesk"
else
  echo "  ✗ FALTA la base de datos helpdesk (avísame en el chat)"
fi
rm -rf "$HOME/nx"
echo ""
echo "✔ Contenido desplegado en /opt/nexodesk/current"
echo "  Siguiente paso en tu PC:  deploy\\windows\\db-push.ps1"
