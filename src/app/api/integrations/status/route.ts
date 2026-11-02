import { NextResponse } from 'next/server'
import { emailProviderStatus } from '@/lib/providers/email'
import { whatsappProviderStatus } from '@/lib/providers/whatsapp'

export const dynamic = 'force-dynamic'

// GET /api/integrations/status → estado de los canales reales
// (adaptadores y webhooks). Se muestra en el dashboard de Rendimiento.
export async function GET() {
  const email = emailProviderStatus()
  const whatsapp = whatsappProviderStatus()

  return NextResponse.json({
    email: {
      provider: email.provider,
      configured: email.configured,
      fromMasked: email.fromMasked,
      label: email.configured ? 'SendGrid (real)' : 'Simulado (EmailLog)',
    },
    whatsapp: {
      configured: whatsapp.configured,
      fromMasked: whatsapp.fromMasked,
      label: whatsapp.configured ? `Twilio ${whatsapp.fromMasked}` : 'Simulado (sin credenciales)',
    },
    webhooks: {
      whatsapp: {
        path: '/api/webhooks/whatsapp',
        protected: Boolean(process.env.TWILIO_AUTH_TOKEN),
      },
      emailInbound: {
        path: '/api/webhooks/email-inbound',
        protected: Boolean(process.env.INBOUND_WEBHOOK_SECRET),
      },
    },
    database: {
      engine: process.env.DATABASE_URL?.startsWith('postgres') ? 'postgresql' : 'sqlite',
      vectorSearch: process.env.DATABASE_URL?.startsWith('postgres') && process.env.KB_SEARCH === 'pgvector',
    },
  })
}
