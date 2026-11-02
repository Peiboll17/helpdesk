// ============================================================
// Admisión multicanal · find-or-create para webhooks entrantes
// ------------------------------------------------------------
// Email (SendGrid Inbound Parse) y WhatsApp (Twilio) llegan por
// webhook. Lógica compartida:
//   1. Si el cliente ya tiene un ticket ABIERTO o EN_ESPERA →
//      el mensaje continúa ese hilo (nada de tickets duplicados).
//   2. Si no → Zero-Touch: clasifica, prioriza y asigna con el
//      motor de enrutamiento, igual que el portal.
// El envío real (SendGrid/Twilio) se intenta después con los
// adaptadores de src/lib/providers; sin credenciales, todo queda
// registrado (EmailLog / hilo) y la app sigue funcionando.
// ============================================================

import { db } from '@/lib/db'
import { routeTicket, type AgentCandidate } from '@/lib/routing'
import { emitEvent } from '@/lib/realtime'
import { deliverEmail } from '@/lib/providers/email'

export interface IntakeInput {
  source: 'EMAIL' | 'WHATSAPP'
  body: string
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  subject?: string // opcional para EMAIL; en WhatsApp se deduce del body
}

async function loadAgentCandidates(): Promise<AgentCandidate[]> {
  const agents = await db.agent.findMany({ where: { isActive: true } })
  const openCounts = await db.ticket.groupBy({
    by: ['assigneeId'],
    where: { status: { in: ['ABIERTO', 'EN_ESPERA'] }, assigneeId: { not: null } },
    _count: { _all: true },
  })
  const loadMap = new Map(openCounts.map((c) => [c.assigneeId, c._count._all]))
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    specialties: a.specialties,
    isActive: a.isActive,
    openLoad: loadMap.get(a.id) ?? 0,
  }))
}

// Crea un ticket aplicando el motor Zero-Touch (clasificación,
// prioridad y agente por especialidad + menor carga).
export async function createRoutedTicket(input: {
  subject: string
  description: string
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  source: 'EMAIL' | 'FORMULARIO_WEB' | 'WHATSAPP' | 'CHAT_EN_VIVO'
  visitorId?: string | null
}) {
  const candidates = await loadAgentCandidates()
  const decision = routeTicket(
    { subject: input.subject, description: input.description, source: input.source },
    candidates
  )

  const last = await db.ticket.findFirst({ orderBy: { ref: 'desc' }, select: { ref: true } })
  const nextNum = last ? parseInt(last.ref.replace('TCK-', ''), 10) + 1 : 1001
  const ref = `TCK-${nextNum}`

  const ticket = await db.ticket.create({
    data: {
      ref,
      subject: input.subject.slice(0, 200),
      description: input.description.slice(0, 4000),
      source: input.source,
      status: 'ABIERTO',
      priority: decision.priority,
      category: decision.category,
      customerName: input.customerName.slice(0, 120),
      customerEmail: input.customerEmail.slice(0, 160),
      customerPhone: input.customerPhone?.slice(0, 24) ?? null,
      assigneeId: decision.assigneeId,
      routingReason: decision.reason,
      visitorId: input.visitorId ?? null,
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: input.customerName,
            body: input.description.slice(0, 4000),
          },
          {
            authorType: 'SYSTEM',
            authorName: 'Motor Zero-Touch',
            body: `🎫 Ticket creado desde ${input.source.replace('_', ' ')} · Enrutado automáticamente: ${decision.reason}`,
          },
        ],
      },
      emails: {
        create: {
          toEmail: input.customerEmail,
          subject: `Hemos recibido tu solicitud · ${ref}`,
          body: `Hola ${input.customerName}, tu ticket ${ref} "${input.subject}" ha sido recibido${
            decision.assigneeId ? ' y asignado a nuestro equipo' : ''
          }. Te responderemos lo antes posible. — NexoDesk`,
          kind: 'TICKET_CREATED',
        },
      },
    },
    include: { assignee: { select: { id: true, name: true, color: true } } },
  })

  // Envío real (si hay credenciales); el registro ya existe en EmailLog
  void deliverEmail({
    to: ticket.customerEmail,
    subject: `Hemos recibido tu solicitud · ${ref}`,
    body: `Hola ${ticket.customerName}, tu ticket ${ref} "${ticket.subject}" ha sido recibido. Te responderemos lo antes posible. — NexoDesk`,
    kind: 'TICKET_CREATED',
    ref,
  })

  await emitEvent('ticket:new', { id: ticket.id, ref: ticket.ref, subject: ticket.subject })
  await emitEvent('tickets:changed', { ref: ticket.ref })

  return { ticket, decision }
}

// Punto de entrada de los webhooks: continúa el hilo abierto del
// cliente o crea un ticket nuevo. Devuelve el ticket y si se creó.
export async function intakeMessage(input: IntakeInput): Promise<{ created: boolean; ticketRef: string; ticketId: string }> {
  const body = input.body.trim().slice(0, 4000)
  if (!body) throw new Error('Mensaje vacío')

  // 1) ¿Tiene ya un ticket abierto? (por email o por teléfono)
  const openWhere = input.customerEmail
    ? { customerEmail: input.customerEmail.toLowerCase(), status: { in: ['ABIERTO', 'EN_ESPERA'] } }
    : input.customerPhone
      ? { customerPhone: input.customerPhone, status: { in: ['ABIERTO', 'EN_ESPERA'] } }
      : null

  if (openWhere) {
    const existing = await db.ticket.findFirst({
      where: openWhere,
      orderBy: { updatedAt: 'desc' },
    })
    if (existing) {
      await db.message.create({
        data: { ticketId: existing.id, authorType: 'CUSTOMER', authorName: input.customerName, body },
      })
      await emitEvent('tickets:changed', { id: existing.id, ref: existing.ref })
      await emitEvent('ticket:updated', { id: existing.id, ref: existing.ref })
      return { created: false, ticketRef: existing.ref, ticketId: existing.id }
    }
  }

  // 2) Ticket nuevo (Zero-Touch)
  const subject = (input.subject?.trim() || body.split('\n')[0] || 'Consulta del cliente').slice(0, 120)
  const email = input.customerEmail ?? `${(input.customerPhone ?? 'cliente').replace(/[^0-9a-z]/gi, '')}@whatsapp.local`
  const { ticket } = await createRoutedTicket({
    subject,
    description: body,
    customerName: input.customerName,
    customerEmail: email,
    customerPhone: input.customerPhone ?? null,
    source: input.source,
  })
  return { created: true, ticketRef: ticket.ref, ticketId: ticket.id }
}
