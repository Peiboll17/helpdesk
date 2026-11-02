import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { routeTicket, type AgentCandidate } from '@/lib/routing'
import { emitEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

// GET /api/tickets?filtro → Bandeja de entrada unificada
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const status = sp.get('status') ?? ''
  const source = sp.get('source') ?? ''
  const priority = sp.get('priority') ?? ''
  const assignee = sp.get('assignee') ?? ''
  const q = (sp.get('q') ?? '').trim()
  const view = sp.get('view') ?? '' // "abiertos" = ABIERTO+EN_ESPERA

  const where: Record<string, unknown> = {}
  if (view === 'abiertos') where.status = { in: ['ABIERTO', 'EN_ESPERA'] }
  else if (status) where.status = status
  if (source) where.source = source
  if (priority) where.priority = priority
  if (assignee === 'sin_asignar') where.assigneeId = null
  else if (assignee) where.assigneeId = assignee
  if (q) {
    where.OR = [
      { subject: { contains: q } },
      { description: { contains: q } },
      { customerName: { contains: q } },
      { customerEmail: { contains: q } },
      { ref: { contains: q } },
    ]
  }

  const tickets = await db.ticket.findMany({
    where,
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }], // CRITICA primero (orden alfabético inverso)
    include: {
      assignee: { select: { id: true, name: true, color: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, createdAt: true, authorType: true } },
      notes: { select: { id: true } },
    },
  })

  return NextResponse.json(
    tickets.map((t) => ({
      id: t.id,
      ref: t.ref,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      source: t.source,
      category: t.category,
      customerName: t.customerName,
      customerEmail: t.customerEmail,
      assignee: t.assignee,
      routingReason: t.routingReason,
      csatScore: t.csatScore,
      hasNotes: t.notes.length > 0,
      lastMessage: t.messages[0] ?? null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
  )
}

// POST /api/tickets → crea ticket + AUTOMATIZACIÓN 1: enrutamiento Zero-Touch
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body?.subject || !body?.description || !body?.customerName || !body?.customerEmail) {
    return NextResponse.json(
      { error: 'Faltan campos obligatorios: subject, description, customerName, customerEmail' },
      { status: 400 }
    )
  }

  const source = ['EMAIL', 'FORMULARIO_WEB', 'WHATSAPP', 'CHAT_EN_VIVO'].includes(body.source)
    ? body.source
    : 'FORMULARIO_WEB'

  // Agentes activos con su carga abierta (para el balanceo)
  const agents = await db.agent.findMany({ where: { isActive: true } })
  const openCounts = await db.ticket.groupBy({
    by: ['assigneeId'],
    where: { status: { in: ['ABIERTO', 'EN_ESPERA'] }, assigneeId: { not: null } },
    _count: { _all: true },
  })
  const loadMap = new Map(openCounts.map((c) => [c.assigneeId, c._count._all]))
  const candidates: AgentCandidate[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    specialties: a.specialties,
    isActive: a.isActive,
    openLoad: loadMap.get(a.id) ?? 0,
  }))

  // 🧠 Motor Zero-Touch: clasifica + prioriza + asigna sin intervención manual
  const decision = routeTicket({ subject: body.subject, description: body.description, source }, candidates)

  // Referencia correlativa
  const last = await db.ticket.findFirst({ orderBy: { ref: 'desc' }, select: { ref: true } })
  const nextNum = last ? parseInt(last.ref.replace('TCK-', ''), 10) + 1 : 1001
  const ref = `TCK-${nextNum}`

  const ticket = await db.ticket.create({
    data: {
      ref,
      subject: String(body.subject).slice(0, 200),
      description: String(body.description).slice(0, 4000),
      source,
      status: 'ABIERTO',
      priority: decision.priority,
      category: decision.category,
      customerName: String(body.customerName).slice(0, 120),
      customerEmail: String(body.customerEmail).slice(0, 160),
      assigneeId: decision.assigneeId,
      routingReason: decision.reason,
      visitorId: body.visitorId ?? null,
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: String(body.customerName),
            body: String(body.description).slice(0, 4000),
          },
          {
            authorType: 'SYSTEM',
            authorName: 'Motor Zero-Touch',
            body: `🎫 Ticket creado desde ${source.replace('_', ' ')} · Enrutado automáticamente: ${decision.reason}`,
          },
        ],
      },
      emails: {
        create: {
          toEmail: String(body.customerEmail),
          subject: `Hemos recibido tu solicitud · ${ref}`,
          body: `Hola ${body.customerName}, tu ticket ${ref} "${body.subject}" ha sido recibido${
            decision.assigneeId ? ' y asignado a nuestro equipo' : ''
          }. Te responderemos lo antes posible. — NexoDesk`,
          kind: 'TICKET_CREATED',
        },
      },
    },
    include: { assignee: { select: { id: true, name: true, color: true } } },
  })

  await emitEvent('ticket:new', { id: ticket.id, ref: ticket.ref, subject: ticket.subject })
  await emitEvent('tickets:changed', { ref: ticket.ref })

  return NextResponse.json(ticket, { status: 201 })
}
