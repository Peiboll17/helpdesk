import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emitEvent } from '@/lib/realtime'
import { PRIORITY_LABELS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// GET /api/tickets/[id] → detalle completo del ticket (hilo + notas)
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, color: true, specialties: true } },
      messages: { orderBy: { createdAt: 'asc' } },
      notes: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
  return NextResponse.json(ticket)
}

// PATCH /api/tickets/[id] → cambia estado, prioridad o asignación.
// Al resolver/cerrar se dispara la encuesta CSAT automática (email 1 clic).
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const ticket = await db.ticket.findUnique({ where: { id }, include: { assignee: true } })
  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  const data: Record<string, unknown> = {}
  const systemEvents: string[] = []

  // Cambio de estado
  if (body.status && ['ABIERTO', 'EN_ESPERA', 'RESUELTO', 'CERRADO'].includes(body.status)) {
    if (body.status !== ticket.status) {
      data.status = body.status
      if (body.status === 'RESUELTO') data.resolvedAt = new Date()
      if (body.status === 'CERRADO') data.closedAt = new Date()
      systemEvents.push(
        body.status === 'RESUELTO'
          ? '✅ Ticket resuelto'
          : body.status === 'CERRADO'
            ? '🔒 Ticket cerrado'
            : body.status === 'EN_ESPERA'
              ? '⏸️ Ticket pasado a "En Espera"'
              : '📬 Ticket reabierto'
      )
    }
  }

  // Cambio de prioridad
  if (body.priority && ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'].includes(body.priority)) {
    if (body.priority !== ticket.priority) {
      data.priority = body.priority
      systemEvents.push(`🔺 Prioridad cambiada de ${PRIORITY_LABELS[ticket.priority]} a ${PRIORITY_LABELS[body.priority]}`)
    }
  }

  // Reasignación
  if ('assigneeId' in body) {
    const newId: string | null = body.assigneeId || null
    if (newId !== ticket.assigneeId) {
      data.assigneeId = newId
      if (newId) {
        const agent = await db.agent.findUnique({ where: { id: newId } })
        if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 400 })
        systemEvents.push(`👤 Ticket asignado a ${agent.name}`)
      } else {
        systemEvents.push('👤 Ticket sin asignar')
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ...ticket, unchanged: true })
  }

  // ⚡ CSAT automático al resolver/cerrar (estrategia MVP)
  const willBeClosedLike = data.status === 'RESUELTO' || data.status === 'CERRADO'
  const csatNow =
    willBeClosedLike && !ticket.csatSentAt && data.status !== ticket.status

  const updated = await db.$transaction(async (tx) => {
    const t = await tx.ticket.update({
      where: { id },
      data: { ...data, ...(csatNow ? { csatSentAt: new Date() } : {}) },
      include: { assignee: { select: { id: true, name: true, color: true, specialties: true } } },
    })

    if (systemEvents.length > 0) {
      await tx.message.create({
        data: {
          ticketId: id,
          authorType: 'SYSTEM',
          authorName: 'Sistema',
          body: systemEvents.join(' · '),
        },
      })
    }

    if (csatNow) {
      await tx.emailLog.create({
        data: {
          toEmail: t.customerEmail,
          subject: `¿Cómo fue tu experiencia? (1 clic) · ${t.ref}`,
          body: `Hola ${t.customerName.split(' ')[0]}, ¿resolvimos tu consulta "${t.subject}"? Responde con un solo clic: 😊 Feliz · 😐 Neutral · ☹️ Triste`,
          kind: 'CSAT_REQUEST',
          ticketId: t.id,
        },
      })
      await tx.message.create({
        data: {
          ticketId: id,
          authorType: 'SYSTEM',
          authorName: 'Sistema',
          body: '📧 Encuesta CSAT de un clic enviada automáticamente al cliente (😊 Feliz · 😐 Neutral · ☹️ Triste).',
        },
      })
    }

    return t
  })

  await emitEvent('tickets:changed', { id })
  await emitEvent('ticket:updated', { id, ref: updated.ref })

  return NextResponse.json(updated)
}
