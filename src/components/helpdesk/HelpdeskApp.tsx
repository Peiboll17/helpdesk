'use client'

// NexoDesk · Shell principal del Helpdesk
// Bandeja única · Base de Conocimiento · Rendimiento · Portal del Cliente

import { useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { toast } from 'sonner'
import { Inbox, BookOpen, BarChart3, UserRound, Send, HelpCircle, Radio } from 'lucide-react'
import { api, type AgentDTO, type EmailLogDTO } from '@/lib/client-types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentAvatar } from './bits'
import InboxView from './InboxView'
import KnowledgeView from './KnowledgeView'
import DashboardView from './DashboardView'
import CustomerPortal from './CustomerPortal'

export type Tab = 'bandeja' | 'conocimiento' | 'rendimiento' | 'cliente'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'bandeja', label: 'Bandeja única', icon: <Inbox className="h-4 w-4" /> },
  { id: 'conocimiento', label: 'Conocimiento', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'rendimiento', label: 'Rendimiento', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'cliente', label: 'Portal cliente', icon: <UserRound className="h-4 w-4" /> },
]

function EmailOutboxDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: emails } = useQuery({
    queryKey: ['emails'],
    queryFn: () => api.get<EmailLogDTO[]>('/api/emails'),
    enabled: open,
    refetchInterval: 5000,
  })

  const kindLabels: Record<string, string> = {
    TICKET_CREATED: 'Confirmación',
    AGENT_REPLY: 'Respuesta',
    CSAT_REQUEST: 'Encuesta CSAT',
    STATUS_CHANGE: 'Cambio estado',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Bandeja de salida simulada
          </DialogTitle>
          <DialogDescription>
            Cada correo sale por el adaptador de email (SendGrid / AWS SES en producción). Así se ve el flujo real.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[55vh] pr-3">
          <div className="space-y-2">
            {(emails ?? []).map((e) => (
              <div key={e.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{e.subject}</span>
                  <Badge variant="secondary" className="shrink-0">
                    {kindLabels[e.kind] ?? e.kind}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Para: {e.toEmail} · {new Date(e.createdAt).toLocaleString('es-ES')}
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{e.body}</p>
              </div>
            ))}
            {(emails ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Sin correos enviados todavía.</p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const rows: [string, string][] = [
    ['j / ↓ · k / ↑', 'Ticket siguiente · anterior'],
    ['r', 'Responder al cliente'],
    ['n', 'Escribir nota interna'],
    ['i', 'Mostrar/ocultar notas internas'],
    ['a', 'Asignar agente'],
    ['p', 'Cambiar prioridad'],
    ['e', 'Resolver (envía CSAT)'],
    ['s', 'Poner en espera'],
    ['c', 'Cerrar ticket'],
    ['?', 'Ver esta ayuda'],
    ['Esc', 'Cerrar diálogos'],
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>
            Diseñados para velocidad: la bandeja completa se opera sin ratón. No se activan mientras escribes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {rows.map(([k, desc]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{desc}</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">{k}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Shell() {
  const [tab, setTab] = useState<Tab>('bandeja')
  const [agentOverride, setAgentOverride] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [outboxOpen, setOutboxOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<AgentDTO[]>('/api/agents'),
    refetchInterval: 20000,
  })

  const actingAgent = useMemo(
    () => agents?.find((a) => a.id === agentOverride) ?? agents?.[0] ?? null,
    [agents, agentOverride]
  )

  // Conexión única de tiempo real: cualquier cambio invalida cachés
  useEffect(() => {
    const instance = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      timeout: 10000,
    })

    instance.on('connect', () => {
      setConnected(true)
      instance.emit('agent:join')
    })
    instance.on('disconnect', () => setConnected(false))

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['ticket'] })
    }

    instance.on('tickets:changed', invalidateAll)
    instance.on('ticket:updated', invalidateAll)
    instance.on('ticket:new', (payload: { ref: string; subject: string }) => {
      invalidateAll()
      toast(`🎫 Nuevo ticket ${payload.ref}`, { description: payload.subject })
    })
    instance.on('csat:submitted', invalidateAll)
    instance.on('chat:customer-message', (payload: { authorName: string; body: string }) => {
      invalidateAll()
      toast(`💬 ${payload.authorName} escribió en el chat`, { description: payload.body.slice(0, 80) })
    })

    return () => {
      instance.disconnect()
    }
  }, [queryClient])

  // Atajo global: "?" abre la ayuda de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (e.key === '?' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setShortcutsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const agentSelect = useMemo(
    () => (
      <Select value={actingAgent?.id ?? ''} onValueChange={(id) => setAgentOverride(id)}>
        <SelectTrigger size="sm" className="w-[150px] min-w-0 shrink" aria-label="Agente activo">
          <SelectValue placeholder="Agente" />
        </SelectTrigger>
        <SelectContent>
          {(agents ?? []).map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex items-center gap-2">
                <AgentAvatar name={a.name} color={a.color} className="h-4 w-4" />
                <span className="text-sm">{a.name}</span>
                <span className="text-xs text-muted-foreground">({a.openLoad} abiertos)</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    [agents, actingAgent]
  )

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto max-w-[1500px] px-3 sm:px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Radio className="h-4 w-4" />
            </div>
            <div className="leading-tight hidden sm:block">
              <div className="text-sm font-bold">NexoDesk</div>
              <div className="text-[10px] text-muted-foreground -mt-0.5">Helpdesk Zero-Touch</div>
            </div>
          </div>

          <nav className="flex-1 flex items-center gap-1 overflow-x-auto" aria-label="Secciones">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors',
                  tab === t.id
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
                aria-current={tab === t.id ? 'page' : undefined}
              >
                {t.icon}
                <span className="hidden md:inline">{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                'hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]',
                connected ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-stone-50 text-stone-600'
              )}
              title={connected ? 'Socket.io conectado: mensajes al instante' : 'Reconectando…'}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400')} />
              {connected ? 'Tiempo real' : 'Conectando…'}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setShortcutsOpen(true)} title="Atajos de teclado (?)">
              <HelpCircle className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setOutboxOpen(true)} title="Bandeja de salida simulada">
              <Send className="h-4 w-4" />
            </Button>
            {agentSelect}
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 mx-auto w-full max-w-[1500px] px-0 sm:px-4 py-0 sm:py-4">
        {tab === 'bandeja' && <InboxView actingAgent={actingAgent} />}
        {tab === 'conocimiento' && <KnowledgeView />}
        {tab === 'rendimiento' && <DashboardView />}
        {tab === 'cliente' && <CustomerPortal />}
      </main>

      <EmailOutboxDialog open={outboxOpen} onOpenChange={setOutboxOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}

export default function HelpdeskApp() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5000, retry: 1, refetchOnWindowFocus: true },
        },
      })
  )
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  )
}
