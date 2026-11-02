import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emitEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

const FACES: Record<number, string> = { 1: '☹️ Triste', 2: '😐 Neutral', 3: '😊 Feliz' }

// POST /api/csat → el cliente responde la encuesta de un clic
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const score = Number(body?.score)
  if (![1, 2, 3].includes(score)) {
    return NextResponse.json({ error: 'Puntuación inválida (1-3)' }, { status: 400 })
  }

  const ticket = await db.ticket.findUnique({
    where: { id: String(body.ticketId ?? '') },
  })
  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
  if (!['RESUELTO', 'CERRADO'].includes(ticket.status)) {
    return NextResponse.json({ error: 'El ticket aún no está resuelto' }, { status: 409 })
  }
  if (ticket.csatScore) {
    return NextResponse.json({ error: 'Este ticket ya fue calificado', csatScore: ticket.csatScore }, { status: 409 })
  }

  const updated = await db.$transaction(async (tx) => {
    const t = await tx.ticket.update({
      where: { id: ticket.id },
      data: { csatScore: score, csatComment: body.comment ? String(body.comment).slice(0, 500) : null },
    })
    await tx.message.create({
      data: {
        ticketId: ticket.id,
        authorType: 'SYSTEM',
        authorName: 'Sistema',
        body: `⭐ CSAT recibido por ${t.customerEmail}: ${FACES[score]}`,
      },
    })
    return t
  })

  await emitEvent('tickets:changed', { id: ticket.id })
  await emitEvent('csat:submitted', { ticketId: ticket.id, score })

  return NextResponse.json({ ok: true, csatScore: updated.csatScore, ref: updated.ref })
}
