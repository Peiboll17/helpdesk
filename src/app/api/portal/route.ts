import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/portal?email=... → vista del cliente: sus tickets + encuestas CSAT pendientes
export async function GET(request: NextRequest) {
  const email = (request.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'Indica un email' }, { status: 400 })
  }

  const tickets = await db.ticket.findMany({
    where: { customerEmail: { equals: email } },
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, select: { authorType: true, authorName: true, body: true, createdAt: true } },
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
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      csatScore: t.csatScore,
      csatPending: ['RESUELTO', 'CERRADO'].includes(t.status) && !!t.csatSentAt && !t.csatScore,
      messages: t.messages.filter((m) => m.authorType !== 'SYSTEM'),
    }))
  )
}
