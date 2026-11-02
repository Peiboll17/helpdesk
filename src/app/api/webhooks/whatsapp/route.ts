import { NextRequest, NextResponse } from 'next/server'
import { intakeMessage } from '@/lib/intake'
import { sendWhatsApp, verifyTwilioSignature } from '@/lib/providers/whatsapp'
import { emitEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

// ============================================================
// Webhook entrante de WhatsApp (Twilio)
// ------------------------------------------------------------
// Configúralo en la consola de Twilio (Messaging → WhatsApp
// sender → "When a message comes in") apuntando a:
//     https://TU-DOMINIO/api/webhooks/whatsapp  (POST)
// Twilio envía application/x-www-form-urlencoded. Ver docs/INTEGRACIONES.md
//
// Sin credenciales Twilio en el entorno, el webhook funciona en
// modo dev (acepta el POST sin verificar firma) para poder
// probar el flujo completo con curl.
// ============================================================
export async function POST(request: NextRequest) {
  let params: Record<string, string>
  try {
    const form = await request.formData()
    params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]))
  } catch {
    // Algunas pruebas envían urlencoded crudo
    const raw = await request.text().catch(() => '')
    params = Object.fromEntries(new URLSearchParams(raw))
  }

  const valid = await verifyTwilioSignature(request.url, params, request.headers.get('x-twilio-signature'))
  if (!valid) {
    return NextResponse.json({ error: 'Firma de Twilio inválida' }, { status: 403 })
  }

  const from = params.From ?? '' // "whatsapp:+34600123456"
  const body = (params.Body ?? '').trim()
  const profileName = (params.ProfileName ?? '').trim()

  if (!from || !body) {
    return NextResponse.json({ error: 'Faltan From o Body' }, { status: 400 })
  }

  const phone = from.replace(/^whatsapp:/, '')
  const name = profileName || `Cliente WhatsApp ${phone.slice(-4)}`

  const { created, ticketRef } = await intakeMessage({
    source: 'WHATSAPP',
    body,
    customerName: name,
    customerPhone: phone,
  })

  // Auto-respuesta por WhatsApp cuando el canal está configurado:
  // confirma la recepción y el número de ticket (Zero-Touch).
  if (created) {
    void sendWhatsApp(
      phone,
      `✅ Hemos recibido tu mensaje. Tu ticket es *${ticketRef}* y ya está con el equipo adecuado. Te escribimos por aquí en cuanto tengamos novedades. — NexoDesk`
    )
  }

  await emitEvent('tickets:changed', { channel: 'whatsapp', ref: ticketRef })

  // Twilio espera TwiML (aunque respondamos por REST API)
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}
