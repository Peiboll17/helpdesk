import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/stats → métricas de rendimiento del equipo (tiempo real vía socket)
export async function GET() {
  const [byStatus, bySource, byPriority, agents, ticketsResolved, ticketsWithFR, csatTickets, kbStats, emailCount] =
    await Promise.all([
      db.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
      db.ticket.groupBy({ by: ['source'], _count: { _all: true } }),
      db.ticket.groupBy({ by: ['priority'], where: { status: { in: ['ABIERTO', 'EN_ESPERA'] } }, _count: { _all: true } }),
      db.agent.findMany({ where: { isActive: true }, include: { tickets: true } }),
      db.ticket.findMany({
        where: { resolvedAt: { not: null } },
        select: { resolvedAt: true, createdAt: true, assigneeId: true, csatScore: true },
      }),
      db.ticket.findMany({
        where: { firstResponseAt: { not: null } },
        select: { firstResponseAt: true, createdAt: true },
      }),
      db.ticket.findMany({ where: { csatScore: { not: null } }, select: { csatScore: true } }),
      db.kBArticle.aggregate({ _count: { _all: true }, _sum: { views: true } }),
      db.emailLog.count(),
    ])

  const statusCounts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]))
  const sourceCounts = Object.fromEntries(bySource.map((s) => [s.source, s._count._all]))
  const priorityCounts = Object.fromEntries(byPriority.map((p) => [p.priority, p._count._all]))

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const resolvedToday = ticketsResolved.filter((t) => t.resolvedAt && t.resolvedAt >= startOfToday).length

  const frMinutes = ticketsWithFR.map((t) =>
    Math.max(1, Math.round(((t.firstResponseAt as Date).getTime() - t.createdAt.getTime()) / 60000))
  )
  const avgFirstResponse = frMinutes.length
    ? Math.round(frMinutes.reduce((a, b) => a + b, 0) / frMinutes.length)
    : 0

  const happy = csatTickets.filter((t) => t.csatScore === 3).length
  const neutral = csatTickets.filter((t) => t.csatScore === 2).length
  const sad = csatTickets.filter((t) => t.csatScore === 1).length
  const csatTotal = happy + neutral + sad
  const csatPercent = csatTotal ? Math.round((happy / csatTotal) * 100) : null

  // Rendimiento por agente
  const csatByTicket = await db.ticket.findMany({
    where: { csatScore: { not: null }, assigneeId: { not: null } },
    select: { assigneeId: true, csatScore: true },
  })
  const agentStats = agents.map((a) => {
    const openLoad = a.tickets.filter((t) => ['ABIERTO', 'EN_ESPERA'].includes(t.status)).length
    const resolved = ticketsResolved.filter((t) => t.assigneeId === a.id).length
    const csats = csatByTicket.filter((t) => t.assigneeId === a.id).map((t) => t.csatScore as number)
    const csatAvg = csats.length ? Math.round((csats.filter((s) => s === 3).length / csats.length) * 100) : null
    return {
      id: a.id,
      name: a.name,
      color: a.color,
      specialties: a.specialties.split(',').map((s) => s.trim()),
      openLoad,
      resolved,
      csatAvg,
    }
  })

  // Feed de actividad reciente (eventos del sistema + tickets nuevos)
  const [systemMsgs, recentTickets] = await Promise.all([
    db.message.findMany({
      where: { authorType: 'SYSTEM' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { body: true, createdAt: true, ticket: { select: { ref: true, id: true } } },
    }),
    db.ticket.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { ref: true, id: true, subject: true, createdAt: true, source: true } }),
  ])

  const activity = [
    ...systemMsgs.map((m) => ({ kind: 'system', text: `${m.ticket.ref}: ${m.body}`, at: m.createdAt, ticketId: m.ticket.id })),
    ...recentTickets.map((t) => ({
      kind: 'ticket',
      text: `Nuevo ticket ${t.ref} (${t.source.replace('_', ' ').toLowerCase()}): "${t.subject}"`,
      at: t.createdAt,
      ticketId: t.id,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10)

  return NextResponse.json({
    statusCounts,
    sourceCounts,
    priorityCounts,
    openTotal: (statusCounts['ABIERTO'] ?? 0) + (statusCounts['EN_ESPERA'] ?? 0),
    total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    resolvedToday,
    avgFirstResponse,
    csat: { happy, neutral, sad, total: csatTotal, percent: csatPercent },
    agentStats,
    kb: { articles: kbStats._count._all, deflections: kbStats._sum.views ?? 0 },
    emailsSent: emailCount,
    activity,
    updatedAt: new Date().toISOString(),
  })
}
