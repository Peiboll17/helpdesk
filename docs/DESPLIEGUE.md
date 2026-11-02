# Despliegue en producción · VPS GCP (free tier) con MySQL

Guía para publicar NexoDesk en tu **e2-micro** de Google Cloud con la base de
datos **MySQL que ya tienes**, conviviendo con **todas las webs que añadas
después**, sin salir del plan gratuito.

```
                    ┌───────────────────────── e2-micro · 1 GB RAM ─────────────────────────┐
 Internet ──80/443──▶  Caddy (HTTPS automático)                                             │
                    │    ├── ayuda.tudominio.com  ──▶ Next.js standalone  :3000  (~250 MB)  │
                    │    │        └── /socket.io*  ──▶ Realtime Socket.io :3003 (~60 MB)   │
                    │    ├── web2.tudominio.com   ──▶ otra app            :4000            │
                    │    └── web3.tudominio.com   ──▶ estática / PHP       /var/www        │
                    │  MySQL :3306 (ya instalado, solo escucha en localhost)               │
                    └───────────────────────────────────────────────────────────────────────┘
```

**Por qué esta arquitectura** (y no otra):

| Decisión | Motivo |
|---|---|
| Compilar en local, no en la VPS | `next build` pide ~2 GB; la e2-micro tiene 1 GB. `deploy/deploy.sh` compila en tu PC y sube el artefacto (~60 MB). |
| Caddy como proxy único | ~30 MB de RAM, HTTPS automático por dominio y una sola línea por cada web nueva. |
| MySQL de siempre | Reutilizas la BD existente: cero RAM extra. Prisma genera el cliente con `prisma/schema.mysql.prisma`. |
| Búsqueda léxica en la KB | pgvector solo existe en PostgreSQL. El conmutador de `src/lib/kb-search.ts` detecta la URL mysql:// y usa el motor léxico local automáticamente: la deflexión y el Copiloto IA funcionan igual. |
| Swap de 2 GB | Colchón obligatorio en 1 GB; evita que el kernel mate MySQL. |
| MySQL solo en localhost | Nunca expuesto a Internet; el esquema/seed se aplican por túnel SSH. |

---

## 0 · Requisitos previos

- [ ] Tu VPS es **e2-micro** en `us-west1`, `us-central1` o `us-east1` (requisito del free tier) con su **IP externa** incluida.
- [ ] **DNS**: crea un registro `A` (p. ej. `ayuda.tudominio.com`) apuntando a la IP externa. Cada web futura tendrá el suyo, misma IP.
- [ ] Puertos **80 y 443** abiertos en el firewall de VPC (Console → VPC Network → Firewall, o):
  ```bash
  gcloud compute firewall-rules create allow-web --allow=tcp:80,tcp:443 --direction=INGRESS
  ```
- [ ] En tu PC: `bun`, `rsync` y tu clave SSH para la VPS.

## 1 · Preparar la VPS (una sola vez)

```bash
# ── Swap de 2 GB (imprescindible con 1 GB de RAM) ─────────────
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=20' | sudo tee /etc/sysctl.d/90-swap.conf && sudo sysctl -p /etc/sysctl.d/90-swap.conf

# ── Node 20 (runtime de la app standalone) ────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# ── Bun (runtime del mini-servicio realtime) ──────────────────
curl -fsSL https://bun.sh/install | bash
sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun

# ── Caddy (proxy con HTTPS automático) ────────────────────────
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

# ── Usuario y directorios de la app ───────────────────────────
sudo useradd -r -m -d /opt/nexodesk -s /usr/sbin/nologin nexodesk
sudo mkdir -p /opt/nexodesk/current
sudo chown -R nexodesk:nexodesk /opt/nexodesk
```

## 2 · Base de datos MySQL

Con el cliente root de tu MySQL (`sudo mysql`):

```sql
CREATE DATABASE helpdesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nexodesk'@'localhost' IDENTIFIED BY 'UNA-CLAVE-MUY-LARGA';
GRANT ALL PRIVILEGES ON helpdesk.* TO 'nexodesk'@'localhost';
FLUSH PRIVILEGES;
```

> **MariaDB o MySQL ≥ 5.7** valen igual: Prisma usa el provider `mysql` para ambos.
> El collation `utf8mb4_unicode_ci` además hace que la búsqueda por `contains`
> sea insensible a mayúsculas y acentos (mejor que en SQLite).

Crea el archivo de entorno **en la VPS** (no se versiona ni se sube por rsync):

```bash
sudo -u nexodesk nano /opt/nexodesk/.env
```

```ini
DATABASE_URL="mysql://nexodesk:UNA-CLAVE-MUY-LARGA@localhost:3306/helpdesk"
REALTIME_URL="http://127.0.0.1:3010"

# Webhook de email entrante (elige un secreto largo)
INBOUND_WEBHOOK_SECRET="cambia-esto-por-algo-largo"

# ── Opcionales: activar cuando tengas las credenciales ──
# SENDGRID_API_KEY="SG.xxx"
# EMAIL_FROM="soporte@tudominio.com"
# TWILIO_ACCOUNT_SID="ACxxx"
# TWILIO_AUTH_TOKEN="xxx"
# TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"
```

```bash
chmod 600 /opt/nexodesk/.env   # (dueño nexodesk)
```

## 3 · Primer despliegue (desde tu PC)

Edita `VPS=` en `deploy/deploy.sh` (o pásalo por entorno) y ejecuta:

```bash
VPS=usuario@TU-IP-EXTERNA ./deploy/deploy.sh
```

El script: instala dependencias → genera el cliente Prisma **con el esquema
MySQL** → compila con `output: standalone` y el WebSocket apuntando a
`/socket.io` → sincroniza por rsync → reinicia los servicios systemd →
healthcheck de app y realtime.

## 4 · Esquema y datos (por túnel SSH, sin exponer MySQL)

En una terminal aparte, abre el túnel:

```bash
ssh -N -L 3307:127.0.0.1:3306 usuario@TU-IP-EXTERNA
```

Y en otra (desde la raíz del proyecto):

```bash
export MYSQL_URL="mysql://nexodesk:UNA-CLAVE-MUY-LARGA@127.0.0.1:3307/helpdesk"

# Crea las tablas con el esquema MySQL
DATABASE_URL="$MYSQL_URL" bun run db:push:mysql

# Datos iniciales (agentes, artículos de KB de ejemplo)
DATABASE_URL="$MYSQL_URL" bun run db:seed
```

Cuando termines, cierra el túnel (Ctrl+C). Solo tu PC, autenticado por SSH,
ha tocado la base de datos.

## 5 · Servicios systemd (en la VPS)

```bash
sudo cp /ruta/al/repo/deploy/nexodesk.service        /etc/systemd/system/
sudo cp /ruta/al/repo/deploy/nexodesk-realtime.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nexodesk nexodesk-realtime
```

(Alternativa a copiarlos a mano: `rsync -az deploy/ usuario@VPS:~/deploy/`
y copiar desde ahí.)

Verifica:

```bash
systemctl status nexodesk nexodesk-realtime   # ambos active (running)
curl -s http://127.0.0.1:3000/api/stats | head -c 200
curl -s http://127.0.0.1:3010/health
```

## 6 · Caddy y HTTPS

En la VPS:

```bash
sudo nano /etc/caddy/Caddyfile    # pega deploy/Caddyfile.prod y pon tu dominio
sudo systemctl reload caddy
```

Abre `https://ayuda.tudominio.com` — en unos segundos Caddy habrá emitido el
certificado. **Portal de cliente** en la pestaña «Portal», **bandeja de
agente** en el resto de vistas. El chat en vivo debe mostrar «En vivo»
(verde); si dice «Conectando…» revisa que `NEXT_PUBLIC_SOCKET_PATH` del
build y `SOCKET_PATH` del servicio realtime coinciden (ambos `/socket.io`
con los valores por defecto).

## 7 · Webhooks reales (ahora sí, con dominio público)

Con la app en HTTPS ya puedes registrar los webhooks en Twilio/SendGrid
(detalle completo en `docs/INTEGRACIONES.md`):

- **WhatsApp (Twilio)**: consola → Messaging → WhatsApp sender →
  *"When a message comes in"* → `https://ayuda.tudominio.com/api/webhooks/whatsapp`
  (método POST). Rellena `TWILIO_*` en `/opt/nexodesk/.env` y
  `sudo systemctl restart nexodesk` para que verifique la firma.
- **Email (SendGrid Inbound Parse)**: Host & URL →
  `ayuda.tudominio.com`, URL → `https://ayuda.tudominio.com/api/webhooks/email-inbound?secret=TU-SECRETO`.
  Añade en DNS el registro MX que indica SendGrid.

Prueba sin credenciales (modo dev del webhook):

```bash
curl -X POST https://ayuda.tudominio.com/api/webhooks/whatsapp \
  -d "From=whatsapp:+34600123456" -d "Body=No puedo pagar mi factura" \
  -d "ProfileName=Laura"
# → crea TCK-xxxx enrutado por Zero-Touch y responde TwiML vacío
```

## 8 · Actualizaciones y rollback

```bash
# Publicar una versión nueva (desde tu PC)
git pull && VPS=usuario@TU-IP ./deploy/deploy.sh

# Volver a la versión anterior (en la VPS, si rsync --delete te asusta
# el primer día, haz una copia antes de desplegar):
sudo cp -a /opt/nexodesk/current /opt/nexodesk/prev
# ... despliegue ...
# rollback:  sudo rsync -a --delete /opt/nexodesk/prev/ /opt/nexodesk/current/ && sudo systemctl restart nexodesk nexodesk-realtime
```

La base de datos nunca la toca el deploy: los cambios de esquema se aplican
solo cuando tú los ejecutas (§4) con `db:push:mysql`.

## 9 · Añadir más webs

1. Registro DNS `A` de la web nueva → misma IP externa.
2. Un bloque nuevo en `/etc/caddy/Caddyfile` (ver las plantillas de
   `deploy/Caddyfile.prod`) → `sudo systemctl reload caddy`.
3. Si es otra app Node, réplica el patrón: unidad systemd propia en un
   puerto libre (4000, 4100…) con su `MemoryMax` proporcional al hueco que
   quede tras sumar el presupuesto actual.

**Presupuesto de RAM de referencia** (e2-micro, 1 GB + 2 GB swap):

| Proceso | RAM aprox. |
|---|---|
| SO + servicios base | ~150 MB |
| MySQL (tuning básico) | ~300 MB |
| NexoDesk standalone | ~250 MB (limitado a 400 MB) |
| Realtime Socket.io | ~60 MB (limitado a 150 MB) |
| Caddy | ~30 MB |
| **Libre para tus próximas webs** | **~200 MB + swap** |

## 10 · Límites del free tier que debes vigilar

- **1 GB de egreso/mes** hacia Internet (excepto China y Australia): de sobra
  para un helpdesk de equipo; las imágenes y GIF del README se sirven desde
  GitHub, no desde tu VPS.
- **30 GB de disco estándar** incluidos: el standalone (~80 MB) + MySQL no los
  rozan; vigila los snapshots (5 GB gratis).
- La e2-micro gratis **solo** en `us-west1` / `us-central1` / `us-east1`; ahí la
  IP externa va incluida y no genera cargo.

## 11 · Solución de problemas

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| El chat queda en «Conectando…» | `SOCKET_PATH` ≠ `NEXT_PUBLIC_SOCKET_PATH`, o Caddy sin el `handle /socket.io*` | Alinea ambos valores y re-despliega; `sudo journalctl -u nexodesk-realtime -f` |
| `502 Bad Gateway` | El servicio está caído | `systemctl status nexodesk` y `journalctl -u nexodesk -n 50` |
| El kernel mata procesos (`dmesg` muestra oom-killer) | Sin swap o presupuesto excedido | Verifica §1 (swap) y baja `MemoryMax` de las webs menos importantes |
| `P1003` / acceso denegado de MySQL | Credenciales o host en `DATABASE_URL` | El usuario debe ser `nexodesk@localhost` y la app correr en la misma máquina |
| Acentos como `?` o `Ã©` en la BD | BD creada sin utf8mb4 | Recrea la BD con `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` (§2) |
| La búsqueda de la KB no encuentra nada obvio | Es el motor léxico (MySQL no tiene pgvector) | Enriquece `keywords`/`tags` del artículo desde el editor de la KB |
| `next build` OOM en la VPS | Compilaste en la VPS | No lo hagas: usa `deploy/deploy.sh` (compila en local) |
