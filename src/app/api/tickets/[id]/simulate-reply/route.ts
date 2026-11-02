import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emitEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Respuestas simuladas del cliente (para demostrar el ciclo del ticket en la demo)
const CANNED_REPLIES = [
  'Gracias por la aclaración, lo he probado y sigue igual. ¿Hay algo más que pueda revisar?',
  'Perfecto, justo eso necesitaba. Le doy un par de vueltas y os digo.',
  'Vale, entendido. Aun así me gustaría saber cuánto tardará la solución definitiva.',
  'He reiniciado como me dijisteis y ahora sí funciona. ¡Gracias!',
  'Adjunto lo que me pedís. Espero vuestra confirmación.',
]

// POST /api/tickets/[id]/simulate-reply → simula la respuesta del cliente
export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const ticket = await db.ticket.findUnique({ where: { id } })
  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  const count = await db.message.count({ where: { ticketId: id, authorType: 'CUSTOMER' } })
  const body = CANNED_REPLIES[count % CANNED_REPLIES.length]

  const message = await db.message.create({
    data: { ticketId: id, authorType: 'CUSTOMER', authorName: ticket.customerName, body },
  })

  await emitEvent('tickets:changed', { id, ref: ticket.ref })
  await emitEvent('ticket:updated', { id, ref: ticket.ref })

  return NextResponse.json(message, { status: 201 })
}
