import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateAgentDraft } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// POST /api/tickets/[id]/ai-draft → AUTOMATIZACIÓN 2: Copiloto del Agente.
// Lee la duda del cliente, busca en la KB y redacta un borrador listo para revisar.
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  const kbArticles = await db.kBArticle.findMany()

  try {
    const result = await generateAgentDraft(
      ticket.subject,
      ticket.description,
      ticket.messages.map((m) => ({ authorName: m.authorName, authorType: m.authorType, body: m.body })),
      kbArticles,
      body.agentName
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[ai-draft]', err)
    return NextResponse.json(
      { error: 'El copiloto IA no está disponible en este momento. Inténtalo de nuevo.' },
      { status: 502 }
    )
  }
}
