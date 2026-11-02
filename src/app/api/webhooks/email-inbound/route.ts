import { NextRequest, NextResponse } from 'next/server'
import { intakeMessage } from '@/lib/intake'

export const dynamic = 'force-dynamic'

// ============================================================
// Webhook entrante de Email (SendGrid Inbound Parse)
// ------------------------------------------------------------
// SendGrid envía multipart/form-data con los campos del correo
// (from, to, subject, text…). Configúralo en Settings → Mail
// Settings → Inbound Parse apuntando a:
//     https://TU-DOMINIO/api/webhooks/email-inbound?secret=XXX  (POST)
// con INBOUND_WEBHOOK_SECRET=XXX en el entorno. Ver docs/INTEGRACIONES.md
//
// Protección: si INBOUND_WEBHOOK_SECRET está definido, el query
// param ?secret= es obligatorio (evita spam al endpoint). Sin
// secret en el entorno, se acepta el POST (modo dev).
// ============================================================

function parseFrom(raw: string): { name: string; email: string } {
  const m = raw?.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/) // "Nombre <a@b.com>"
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() }
  const plain = raw?.trim().toLowerCase() ?? ''
  return { name: plain.split('@')[0] || 'Cliente email', email: plain }
}

export async function POST(request: NextRequest) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET
  if (secret && request.nextUrl.searchParams.get('secret') !== secret) {
    return NextResponse.json({ error: 'Secreto inválido' }, { status: 401 })
  }

  let fields: Record<string, string>
  const contentType = request.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]))
    } else {
      const raw = await request.text()
      fields = Object.fromEntries(new URLSearchParams(raw))
    }
  } catch {
    return NextResponse.json({ error: 'Cuerpo no parseable' }, { status: 400 })
  }

  const { name, email } = parseFrom(fields.from ?? '')
  const text = (fields.text ?? fields.body ?? '').trim()
  const subject = (fields.subject ?? '').trim()

  if (!email || !text) {
    return NextResponse.json({ error: 'Faltan from o text' }, { status: 400 })
  }

  const { created, ticketRef } = await intakeMessage({
    source: 'EMAIL',
    body: text,
    customerName: name,
    customerEmail: email,
    subject: subject || undefined,
  })

  return NextResponse.json({ ok: true, created, ticketRef })
}
