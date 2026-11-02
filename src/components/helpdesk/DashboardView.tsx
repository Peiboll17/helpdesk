'use client'

// Rendimiento del equipo en tiempo real: KPIs, distribución por canal,
// carga por agente, CSAT y feed de actividad.

import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Inbox, CheckCircle2, Timer, Smile, BookOpen, Mail, Zap, Activity, Plug, CircleDot } from 'lucide-react'
import { api, type StatsDTO } from '@/lib/client-types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { SOURCE_LABELS, STATUS_LABELS, timeAgo } from '@/lib/constants'
import { AgentAvatar } from './bits'

const SOURCE_COLORS: Record<string, string> = {
  EMAIL: '#059669',
  FORMULARIO_WEB: '#0d9488',
  WHATSAPP: '#d97706',
  CHAT_EN_VIVO: '#7c3aed',
}

const STATUS_COLORS: Record<string, string> = {
  ABIERTO: '#059669',
  EN_ESPERA: '#d97706',
  RESUELTO: '#14b8a6',
  CERRADO: '#78716c',
}

export default function DashboardView() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<StatsDTO>('/api/stats'),
    refetchInterval: 8000, // casi tiempo real; los sockets lo refrescan al instante
  })

  const { data: integrations } = useQuery({
    queryKey: ['integrations'],
    queryFn: () =>
      api.get<{
        email: { label: string; configured: boolean }
        whatsapp: { label: string; configured: boolean }
        webhooks: { whatsapp: { path: string; protected: boolean }; emailInbound: { path: string; protected: boolean } }
        database: { engine: string; vectorSearch: boolean }
      }>('/api/integrations/status'),
    refetchInterval: 30000,
  })

  if (isLoading || !stats) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    )
  }

  const kpis = [
    {
      label: 'Tickets pendientes',
      value: stats.openTotal,
      sub: `${stats.priorityCounts['CRITICA'] ?? 0} críticos · ${stats.total} en total`,
      icon: <Inbox className="h-4 w-4" />,
      tone: 'text-emerald-700 bg-emerald-100',
    },
    {
      label: 'Resueltos hoy',
      value: stats.resolvedToday,
      sub: 'el trabajo sale por el conducto',
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: 'text-teal-700 bg-teal-100',
    },
    {
      label: '1ª respuesta media',
      value: stats.avgFirstResponse < 60 ? `${stats.avgFirstResponse} min` : `${Math.round(stats.avgFirstResponse / 60)} h`,
      sub: 'desde la creación del ticket',
      icon: <Timer className="h-4 w-4" />,
      tone: 'text-amber-700 bg-amber-100',
    },
    {
      label: 'CSAT (Feliz)',
      value: stats.csat.percent != null ? `${stats.csat.percent}%` : '—',
      sub: `${stats.csat.happy}😊 · ${stats.csat.neutral}😐 · ${stats.csat.sad}☹️ de ${stats.csat.total}`,
      icon: <Smile className="h-4 w-4" />,
      tone: 'text-emerald-700 bg-emerald-100',
    },
  ]

  const sourceData = Object.entries(stats.sourceCounts).map(([k, v]) => ({
    name: SOURCE_LABELS[k] ?? k,
    value: v,
    key: k,
  }))
  const statusData = Object.entries(stats.statusCounts).map(([k, v]) => ({
    name: STATUS_LABELS[k] ?? k,
    value: v,
    key: k,
  }))

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Rendimiento del equipo</h1>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Actualizado {timeAgo(stats.updatedAt)}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${k.tone}`}>{k.icon}</span>
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums">{k.value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* Por canal */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Entrada por canal (bandeja única)</CardTitle>
          </CardHeader>
          <CardContent className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {sourceData.map((d) => (
                    <Cell key={d.key} fill={SOURCE_COLORS[d.key] ?? '#78716c'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} tickets`, '']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-3 -mt-6 flex-wrap">
              {sourceData.map((d) => (
                <span key={d.key} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SOURCE_COLORS[d.key] }} />
                  {d.name} ({d.value})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Por estado */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Ciclo del ticket por estado</CardTitle>
          </CardHeader>
          <CardContent className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000011" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [`${v} tickets`, '']} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {statusData.map((d) => (
                    <Cell key={d.key} fill={STATUS_COLORS[d.key] ?? '#78716c'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-[1fr_360px] gap-3">
        {/* Carga por agente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Equipo: carga abierta, resueltos y CSAT</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.agentStats.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <AgentAvatar name={a.name} color={a.color} className="h-8 w-8" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      {a.specialties.map((s) => (
                        <span key={s} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, a.openLoad * 12)}%`,
                          backgroundColor: a.openLoad >= 5 ? '#dc2626' : a.openLoad >= 3 ? '#d97706' : '#059669',
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">{a.openLoad}</div>
                    <div className="text-[10px] text-muted-foreground">abiertos</div>
                  </div>
                  <div className="text-right shrink-0 w-16">
                    <div className="text-sm font-semibold tabular-nums">{a.resolved}</div>
                    <div className="text-[10px] text-muted-foreground">resueltos</div>
                  </div>
                  <div className="text-right shrink-0 w-14">
                    <div className="text-sm font-semibold tabular-nums">{a.csatAvg != null ? `${a.csatAvg}%` : '—'}</div>
                    <div className="text-[10px] text-muted-foreground">CSAT</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Automatizaciones + actividad */}
        <div className="space-y-3">
          <Card>
            <CardContent className="p-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <BookOpen className="h-4 w-4 mx-auto text-primary" />
                <div className="mt-1 text-lg font-bold tabular-nums">{stats.kb.articles}</div>
                <div className="text-[10px] text-muted-foreground">artículos KB</div>
              </div>
              <div>
                <Zap className="h-4 w-4 mx-auto text-primary" />
                <div className="mt-1 text-lg font-bold tabular-nums">{stats.kb.deflections}</div>
                <div className="text-[10px] text-muted-foreground">deflexiones</div>
              </div>
              <div>
                <Mail className="h-4 w-4 mx-auto text-primary" />
                <div className="mt-1 text-lg font-bold tabular-nums">{stats.emailsSent}</div>
                <div className="text-[10px] text-muted-foreground">emails enviados</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Plug className="h-4 w-4 text-primary" /> Integraciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {integrations ? (
                <>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <CircleDot className="h-3 w-3 shrink-0 text-muted-foreground" /> Email
                    </span>
                    <Badge
                      variant={integrations.email.configured ? 'default' : 'secondary'}
                      className="text-[10px] shrink-0"
                    >
                      {integrations.email.label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <CircleDot className="h-3 w-3 shrink-0 text-muted-foreground" /> WhatsApp
                    </span>
                    <Badge
                      variant={integrations.whatsapp.configured ? 'default' : 'secondary'}
                      className="text-[10px] shrink-0"
                    >
                      {integrations.whatsapp.label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <CircleDot className="h-3 w-3 shrink-0 text-muted-foreground" /> Búsqueda KB
                    </span>
                    <Badge variant={integrations.database.vectorSearch ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                      {integrations.database.vectorSearch ? 'pgvector' : 'léxica local'}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground pt-1 border-t">
                    Webhooks: {integrations.webhooks.whatsapp.path} · {integrations.webhooks.emailInbound.path}
                  </p>
                </>
              ) : (
                <div className="h-16 bg-muted animate-pulse rounded" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-primary" /> Actividad en vivo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-56 pr-2">
                <div className="space-y-2.5">
                  {stats.activity.map((a, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                      <div className="min-w-0">
                        <p className="leading-snug">{a.text}</p>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(a.at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
