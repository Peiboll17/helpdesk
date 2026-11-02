import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createRoutedTicket } from '@/lib/intake'

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
// (la lógica compartida vive en src/lib/intake.ts, la misma que usan los
//  webhooks de email y WhatsApp)
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

  const { ticket } = await createRoutedTicket({
    subject: String(body.subject),
    description: String(body.description),
    customerName: String(body.customerName),
    customerEmail: String(body.customerEmail),
    customerPhone: body.customerPhone ?? null,
    source,
    visitorId: body.visitorId ?? null,
  })

  return NextResponse.json(ticket, { status: 201 })
}
