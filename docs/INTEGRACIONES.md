# Integraciones reales · Twilio WhatsApp + SendGrid/SES

NexoDesk funciona **sin credenciales** (todo queda registrado: `EmailLog` de salida, tickets e hilos) y activa el envío **real** en cuanto defines las variables de entorno. Nada de código que cambiar: solo configuración.

| Canal | Salida (adaptador) | Entrada (webhook) |
|---|---|---|
| Email | `SENDGRID_API_KEY` → envío real vía SendGrid v3 | `POST /api/webhooks/email-inbound` (Inbound Parse) |
| WhatsApp | `TWILIO_*` → envío real vía Twilio API | `POST /api/webhooks/whatsapp` (Twilio webhook) |

El estado de cada integración se ve en el dashboard **Rendimiento** (tarjeta «Integraciones») y por API en `GET /api/integrations/status`.

## 1 · Email saliente con SendGrid

1. Crea la API Key en SendGrid (*Settings → API Keys*, permiso **Mail Send**).
2. Añade al `.env`:
   ```bash
   SENDGRID_API_KEY="SG.xxxxxxxx"
   EMAIL_FROM="soporte@tuempresa.com"        # dominio verificado en SendGrid
   EMAIL_FROM_NAME="NexoDesk Soporte"
   ```
3. Verifica el dominio (*Settings → Sender Authentication*) para poder enviar.
4. Reinicia la app. A partir de ahí, **cada email que ya se generaba** (ticket creado, respuesta de agente, encuesta CSAT) sale de verdad por SendGrid, además de quedar en `EmailLog`.

> **AWS SES**: la interfaz es la misma (`deliverEmail()` en `src/lib/providers/email.ts`); implementa la llamada con `@aws-sdk/client-sesv2` y define `EMAIL_PROVIDER=ses`. Todo lo demás (registro, webhooks, CSAT) funciona igual.

### Email entrante (SendGrid Inbound Parse)

Con el *Inbound Parse*, los correos que llegan a `soporte@tuempresa.com` crean tickets automáticamente (con Zero-Touch) o continúan el hilo del ticket abierto del remitente:

1. En SendGrid: *Settings → Mail Settings → Inbound Parse*.
2. URL de destino: `https://TU-DOMINIO/api/webhooks/email-inbound?secret=TU_SECRETO` (POST).
3. En el `.env`: `INBOUND_WEBHOOK_SECRET="TU_SECRETO"` — sin el secret correcto, el webhook responde 401.
4. Campos que consume: `from`, `subject`, `text` (los estándar del parse de SendGrid).

## 2 · WhatsApp con Twilio

1. Activa el **WhatsApp Business** en tu cuenta de Twilio (*Messaging → Try WhatsApp*; usa el sandbox para probar).
2. Añade al `.env`:
   ```bash
   TWILIO_ACCOUNT_SID="ACxxxxxxxx"
   TWILIO_AUTH_TOKEN="xxxxxxxx"
   TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"   # número de Twilio
   ```
3. Configura el webhook entrante (*Messaging → WhatsApp sender → When a message comes in*):
   `https://TU-DOMINIO/api/webhooks/whatsapp` (POST).
4. Comportamiento del webhook:
   - Verifica la **firma `X-Twilio-Signature`** (HMAC-SHA1 con tu AuthToken); sin AuthToken en el entorno acepta el POST en modo dev (para probar con curl).
   - El número del remitente se guarda en `Ticket.customerPhone`; si ya tiene un ticket abierto, el mensaje **continúa ese hilo** en lugar de crear uno nuevo.
   - Si crea ticket nuevo, aplica Zero-Touch y responde automáticamente por WhatsApp: *«✅ Hemos recibido tu mensaje. Tu ticket es TCK-XXXX…»*.
   - Las respuestas del agente en la bandeja salen además por WhatsApp al cliente.

### Probar los webhooks en local (modo dev)

```bash
# WhatsApp (sin credenciales = modo dev)
curl -X POST http://localhost:3000/api/webhooks/whatsapp \
  -F "From=whatsapp:+34600123456" -F "Body=Error en la pasarela de pago" \
  -F "ProfileName=Ana"

# Email (sin secret = modo dev)
curl -X POST http://localhost:3000/api/webhooks/email-inbound \
  -F "from=Ana <ana@empresa.com>" -F "subject=No puedo pagar" -F "text=Error en el pago"
```

## 3 · Nota sobre los dominios

Twilio y SendGrid necesitan una **URL pública y HTTPS**. En producción usa tu dominio detrás del gateway (ver `Caddyfile`); para desarrollo con el sandbox, usa el túnel/preview del panel.
