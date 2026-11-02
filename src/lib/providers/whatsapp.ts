// ============================================================
// Adaptador de WhatsApp · Twilio (real) / solo-registro
// ------------------------------------------------------------
// Con TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM
// definidos, las respuestas del equipo se envían de verdad por
// WhatsApp Business API. Sin credenciales, los mensajes quedan
// en el hilo del ticket y el envío se omite (modo demo).
// ============================================================

export interface WhatsAppProviderStatus {
  configured: boolean
  fromMasked: string | null
}

export function whatsappProviderStatus(): WhatsAppProviderStatus {
  const configured = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM
  )
  const from = process.env.TWILIO_WHATSAPP_FROM ?? ''
  return {
    configured,
    fromMasked: configured ? from.replace(/(\+\d{2})\d+/, '$1***') : null,
  }
}

// Envía un mensaje de WhatsApp con la API REST de Twilio.
// `to` debe ir en formato E.164 (+34600123456); se le antepone
// el prefijo whatsapp: que espera Twilio.
export async function sendWhatsApp(to: string, body: string): Promise<{ sent: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM
  if (!sid || !token || !from) return { sent: false, error: 'no-configurado' }

  const cleanTo = to.replace(/^whatsapp:/, '')
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
        To: `whatsapp:${cleanTo}`,
        Body: body.slice(0, 1500),
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.warn(`[whatsapp] Twilio respondió ${res.status}: ${detail.slice(0, 200)}`)
      return { sent: false, error: `HTTP ${res.status}` }
    }
    console.info(`[whatsapp] mensaje enviado → ${cleanTo}`)
    return { sent: true }
  } catch (e) {
    console.warn('[whatsapp] error de red con Twilio:', e instanceof Error ? e.message : e)
    return { sent: false, error: 'network' }
  }
}

// ============================================================
// Verificación de firma entrante (X-Twilio-Signature)
// Algoritmo oficial: HMAC-SHA1, con clave = AuthToken, sobre
// la URL pública completa + los parámetros ordenados alfabéticamente
// concatenados (clave + valor, sin separadores). Resultado en base64.
// ============================================================
export async function verifyTwilioSignature(
  requestUrl: string,
  params: Record<string, string>,
  signature: string | null
): Promise<boolean> {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token) return true // sin credenciales: modo dev, se acepta (no hay secreto que verificar)
  if (!signature) return false

  const { createHmac } = await import('node:crypto')
  const data =
    requestUrl +
    Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join('')
  const expected = createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64')
  return expected === signature
}
