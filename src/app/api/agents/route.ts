import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/agents → agentes con su carga abierta
export async function GET() {
  const agents = await db.agent.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })

  const openCounts = await db.ticket.groupBy({
    by: ['assigneeId'],
    where: { status: { in: ['ABIERTO', 'EN_ESPERA'] }, assigneeId: { not: null } },
    _count: { _all: true },
  })

  const loadMap = new Map(openCounts.map((c) => [c.assigneeId, c._count._all]))

  return NextResponse.json(
    agents.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      color: a.color,
      specialties: a.specialties.split(',').map((s) => s.trim()),
      openLoad: loadMap.get(a.id) ?? 0,
    }))
  )
}
