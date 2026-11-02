import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emitEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// POST /api/tickets/[id]/messages → respuesta del agente (o del cliente)
// Si el ticket viene de Chat en vivo, el mensaje se emite por WebSocket al visitante.
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body?.body?.trim()) {
    return NextResponse.json({ error: 'El mensaje no puede estar vacío' }, { status: 400 })
  }

  const ticket = await db.ticket.findUnique({ where: { id } })
  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  const authorType = body.authorType === 'CUSTOMER' ? 'CUSTOMER' : 'AGENT'
  const authorName = String(body.authorName ?? (authorType === 'CUSTOMER' ? ticket.customerName : 'Agente')).slice(0, 120)

  const message = await db.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        ticketId: id,
        authorType,
        authorName,
        body: String(body.body).slice(0, 6000),
      },
    })

    if (authorType === 'AGENT') {
      const t = await tx.ticket.findUnique({ where: { id }, select: { firstResponseAt: true, status: true } })
      await tx.ticket.update({
        where: { id },
        data: {
          firstResponseAt: t?.firstResponseAt ?? new Date(),
          ...(t?.status === 'CERRADO' ? { status: 'ABIERTO' } : {}),
        },
      })
    }

    // Simulación del adaptador de email (SendGrid/SES): cada respuesta del
    // agente sale por correo al cliente.
    if (authorType === 'AGENT') {
      await tx.emailLog.create({
        data: {
          toEmail: ticket.customerEmail,
          subject: `Re: ${ticket.subject} · ${ticket.ref}`,
          body: String(body.body).slice(0, 3000),
          kind: 'AGENT_REPLY',
          ticketId: ticket.id,
        },
      })
    }

    return msg
  })

  // ⚡ Tiempo real
  await emitEvent('tickets:changed', { id, ref: ticket.ref })
  await emitEvent('ticket:updated', { id, ref: ticket.ref })
  if (ticket.source === 'CHAT_EN_VIVO' && ticket.visitorId) {
    await emitEvent(
      'chat:agent-message',
      {
        ticketId: ticket.id,
        ref: ticket.ref,
        authorName,
        body: message.body,
        createdAt: message.createdAt,
      },
      `chat:${ticket.visitorId}`
    )
  }

  return NextResponse.json(message, { status: 201 })
}
