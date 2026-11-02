import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emitEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// POST /api/tickets/[id]/notes → Nota interna (invisible para el cliente)
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body?.body?.trim()) {
    return NextResponse.json({ error: 'La nota no puede estar vacía' }, { status: 400 })
  }

  const ticket = await db.ticket.findUnique({ where: { id } })
  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  const note = await db.internalNote.create({
    data: {
      ticketId: id,
      authorName: String(body.authorName ?? 'Agente').slice(0, 120),
      body: String(body.body).slice(0, 4000),
    },
  })

  await emitEvent('tickets:changed', { id, ref: ticket.ref })
  await emitEvent('ticket:updated', { id, ref: ticket.ref })

  return NextResponse.json(note, { status: 201 })
}
