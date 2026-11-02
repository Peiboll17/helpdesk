// ============================================================
// Adaptador de SALIDA de email · SendGrid (real) / Simulado
// ------------------------------------------------------------
// El modelo EmailLog registra SIEMPRE el correo (bandeja de
// salida); `deliverEmail()` intenta además el envío real
// cuando existen credenciales en el entorno. Si no las hay,
// la app funciona en modo simulado (ideal para demo/dev).
//
// Para AWS SES, ver docs/INTEGRACIONES.md: la interfaz es la
// misma, solo cambia la implementación de `deliverEmail`.
// ============================================================

export interface OutgoingEmail {
  to: string
  subject: string
  body: string
  kind: string // TICKET_CREATED | AGENT_REPLY | CSAT_REQUEST | STATUS_CHANGE
  ref?: string
}

export interface EmailProviderStatus {
  provider: 'sendgrid' | 'simulado'
  configured: boolean
  fromMasked: string | null
}

function mask(address: string): string {
  const [user, domain] = address.split('@')
  if (!domain) return '***'
  return `${user.slice(0, 2)}***@${domain}`
}

export function emailProviderStatus(): EmailProviderStatus {
  const key = process.env.SENDGRID_API_KEY
  const from = process.env.EMAIL_FROM ?? 'soporte@tuempresa.com'
  return {
    provider: key ? 'sendgrid' : 'simulado',
    configured: Boolean(key),
    fromMasked: mask(from),
  }
}

// Envío real vía SendGrid v3. Nunca lanza: un fallo del proveedor
// no debe romper la operación principal (el EmailLog ya quedó registrado).
export async function deliverEmail(email: OutgoingEmail): Promise<{ sent: boolean; provider: string; error?: string }> {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) return { sent: false, provider: 'simulado' }

  const from = process.env.EMAIL_FROM ?? 'soporte@tuempresa.com'
  const fromName = process.env.EMAIL_FROM_NAME ?? 'NexoDesk Soporte'

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: email.to }] }],
        from: { email: from, name: fromName },
        subject: email.subject,
        content: [{ type: 'text/plain', value: email.body }],
        categories: ['nexodesk', email.kind.toLowerCase()],
        ...(email.ref ? { custom_args: { ticket_ref: email.ref } } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.warn(`[email] SendGrid respondió ${res.status}: ${detail.slice(0, 200)}`)
      return { sent: false, provider: 'sendgrid', error: `HTTP ${res.status}` }
    }
    console.info(`[email] enviado vía SendGrid → ${email.to} (${email.kind})`)
    return { sent: true, provider: 'sendgrid' }
  } catch (e) {
    console.warn('[email] error de red al llamar a SendGrid:', e instanceof Error ? e.message : e)
    return { sent: false, provider: 'sendgrid', error: 'network' }
  }
}
