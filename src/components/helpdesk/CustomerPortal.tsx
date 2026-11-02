'use client'

// Portal del Cliente (vista simulada de lo que verá tu cliente):
// 1) Formulario de contacto con DEFLexIÓN en tiempo real
// 2) Chat en vivo por Socket.io (crea ticket y llega al agente al instante)
// 3) Mis tickets + encuesta CSAT de un clic (😊 😐 ☹️)

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { Sparkles, ThumbsUp, ThumbsDown, Send, Loader2, PartyPopper, Clock, CheckCircle2, Lock } from 'lucide-react'
import { api, type KBArticleDTO, type KBSearchResult, type PortalTicketDTO } from '@/lib/client-types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatDateTime, SOURCE_LABELS, STATUS_LABELS } from '@/lib/constants'
import { StatusBadge, SourceBadge } from './bits'

// ─────────── Deflexión: búsqueda mientras se escribe ───────────
function useDeflection(query: string, enabled: boolean) {
  const debounced = useDebounce(query, 400)
  return useQuery({
    queryKey: ['deflection', debounced],
    queryFn: () => api.get<{ results: KBSearchResult[] }>(`/api/kb?q=${encodeURIComponent(debounced)}`),
    enabled: enabled && debounced.trim().length >= 4,
  })
}

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

interface ChatMessage {
  id: string
  authorName: string
  body: string
  createdAt: string
  own: boolean
}

export default function CustomerPortal() {
  return (
    <div className="p-4 space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-2.5 flex items-start gap-2">
        <Lock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          <strong>Vista del cliente.</strong> Así ven tus clientes el soporte: buscan en la ayuda (deflexión), chatean
          en vivo y califican con un clic. Abre la pestaña <strong>Bandeja única</strong> en paralelo para ver cómo
          llega todo al agente en tiempo real.
        </p>
      </div>

      <PortalTabs />
    </div>
  )
}

function PortalTabs() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const identityReady = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email)

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          <div>
            <Label htmlFor="c-name">Tu nombre</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana Martín" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="c-email">Tu email</Label>
            <Input
              id="c-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ana@empresa.com"
              className="mt-1"
            />
          </div>
        </div>

        <Tabs defaultValue="deflexion">
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="deflexion" className="text-xs sm:text-sm">
              <Sparkles className="h-4 w-4 mr-1 text-primary" /> Escribir consulta
            </TabsTrigger>
            <TabsTrigger value="chat" className="text-xs sm:text-sm">
              Chat en vivo
            </TabsTrigger>
            <TabsTrigger value="mistickets" className="text-xs sm:text-sm">
              Mis tickets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deflexion">
            <DeflectionForm name={name} email={email} identityReady={identityReady} />
          </TabsContent>
          <TabsContent value="chat">
            <LiveChat name={name} email={email} identityReady={identityReady} />
          </TabsContent>
          <TabsContent value="mistickets">
            <MyTickets email={email} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

// ─────────── Formulario con deflexión (Automatización 3) ───────────
function DeflectionForm({
  name,
  email,
  identityReady,
}: {
  name: string
  email: string
  identityReady: boolean
}) {
  const queryClient = useQueryClient()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [deflected, setDeflected] = useState(0)
  const [created, setCreated] = useState<{ ref: string; routingReason: string | null; priority: string; assignee: string | null } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const { data, isFetching } = useDeflection(description || subject, true)
  const suggestions = dismissed ? [] : (data?.results ?? []).slice(0, 3)

  const rate = useMutation({
    mutationFn: ({ id, useful }: { id: string; useful: boolean }) => {
      if (useful) {
        setDeflected((d) => d + 1)
        toast.success('🎉 ¡Genial! Ticket evitado: te ahorramos la espera')
        return api.patch(`/api/kb/${id}`, { deflect: true })
      }
      return Promise.resolve()
    },
    onSuccess: () => {
      setDismissed(true)
      queryClient.invalidateQueries({ queryKey: ['kb'] })
    },
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<{ ref: string; routingReason: string | null; priority: string; assignee: { name: string } | null }>('/api/tickets', {
        subject,
        description,
        customerName: name,
        customerEmail: email,
        source: 'FORMULARIO_WEB',
      }),
    onSuccess: (t) => {
      setCreated({ ref: t.ref, routingReason: t.routingReason, priority: t.priority, assignee: t.assignee?.name ?? null })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (created) {
    return (
      <div className="max-w-xl mx-auto text-center py-6">
        <PartyPopper className="h-12 w-12 text-primary mx-auto" />
        <h3 className="mt-3 text-lg font-bold">¡Ticket {created.ref} creado!</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Te enviamos un email de confirmación. Nuestro motor lo asignó{' '}
          {created.assignee ? `a <strong>${created.assignee}</strong>` : 'al equipo'} con prioridad{' '}
          <Badge variant={created.priority === 'CRITICA' ? 'destructive' : 'secondary'}>{created.priority}</Badge> sin
          intervención manual.
        </p>
        {created.routingReason && (
          <div className="mt-3 rounded-lg border bg-muted/50 p-3 text-left">
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
              {created.routingReason}
            </p>
          </div>
        )}
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => {
            setCreated(null)
            setSubject('')
            setDescription('')
            setDismissed(false)
          }}
        >
          Crear otra consulta
        </Button>
      </div>
    )
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-3">
        <div>
          <Label htmlFor="c-subject">Asunto</Label>
          <Input
            id="c-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ej.: No puedo pagar con mi tarjeta"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="c-desc">Cuéntanos qué pasa</Label>
          <Textarea
            id="c-desc"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              setDismissed(false)
            }}
            rows={6}
            placeholder="Escribe tu duda… p. ej. «¿Cómo cambiar mi contraseña?» — verás ayuda sugerida mientras escribes"
            className="mt-1"
          />
        </div>
        <Button
          disabled={!identityReady || !subject.trim() || !description.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Enviar ticket
        </Button>
        {!identityReady && <p className="text-[11px] text-muted-foreground">Rellena tu nombre y email arriba para enviar.</p>}
      </div>

      {/* Panel de deflexión */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-3 py-2 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold">¿Quizá esto responde tu duda?</span>
          {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
        </div>
        <div className="p-3 space-y-2 min-h-[200px] max-h-[380px] overflow-y-auto">
          {suggestions.length === 0 && (
            <p className="text-xs text-muted-foreground py-8 text-center leading-relaxed">
              {description.length < 4
                ? 'Escribe tu consulta y te sugeriremos artículos al instante, antes de crear el ticket.'
                : 'Sin coincidencias exactas: envía el ticket y te ayudamos personalmente.'}
            </p>
          )}
          {suggestions.map(({ article, score }) => (
            <DeflectionCard
              key={article.id}
              article={article}
              score={score}
              onUseful={(u) => rate.mutate({ id: article.id, useful: u })}
            />
          ))}
          {deflected > 0 && (
            <p className="text-[11px] text-center text-emerald-700 pt-1">
              {deflected} duda{deflected > 1 ? 's' : ''} resuelta{deflected > 1 ? 's' : ''} sin abrir ticket ✨
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function DeflectionCard({
  article,
  score,
  onUseful,
}: {
  article: KBArticleDTO
  score: number
  onUseful: (useful: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <button className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium flex-1">{article.title}</span>
          <Badge variant="secondary" className="text-[9px] shrink-0">
            {(score * 100).toFixed(0)}%
          </Badge>
        </div>
        {!open && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{article.content}</p>}
      </button>
      {open && (
        <div className="px-3 pb-2.5">
          <p className="text-xs leading-relaxed whitespace-pre-wrap border-t pt-2">{article.content}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">¿Te ha servido?</span>
            <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => onUseful(true)}>
              <ThumbsUp className="h-3 w-3 mr-1" /> Sí, gracias
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => onUseful(false)}>
              <ThumbsDown className="h-3 w-3 mr-1" /> No
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────── Chat en vivo (Socket.io) ───────────
function LiveChat({ name, email, identityReady }: { name: string; email: string; identityReady: boolean }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [ticketRef, setTicketRef] = useState<string | null>(null)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const visitorIdRef = useRef<string>('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const chatQueryClient = useQueryClient()

  if (!visitorIdRef.current) {
    visitorIdRef.current = `visitor-${Math.random().toString(36).slice(2, 10)}`
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const startChat = () => {
    setConnecting(true)
    const instance = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
    })
    setSocket(instance)

    instance.on('connect', () => {
      setConnecting(false)
      instance.emit('chat:start', { visitorId: visitorIdRef.current, name, email })
    })

    instance.on('chat:customer-message', (payload: { authorName: string; body: string; createdAt: string }) => {
      setMessages((prev) => [...prev, { ...payload, id: crypto.randomUUID(), own: true }])
    })

    // Respuesta del agente en tiempo real (sin retrasos)
    instance.on('chat:agent-message', (payload: { authorName: string; body: string; createdAt: string }) => {
      setMessages((prev) => [...prev, { ...payload, id: crypto.randomUUID(), own: false }])
    })

    instance.on('chat:ticket-linked', (payload: { ref: string }) => setTicketRef(payload.ref))
  }

  const send = async () => {
    const body = text.trim()
    if (!body || !socket) return
    setText('')

    let currentId = ticketId
    if (!currentId) {
      // Primer mensaje: crea el ticket con el enrutamiento Zero-Touch
      const ticket = await api.post<{ id: string; ref: string }>('/api/tickets', {
        subject: `Chat en vivo de ${name}`,
        description: body,
        customerName: name,
        customerEmail: email,
        source: 'CHAT_EN_VIVO',
        visitorId: visitorIdRef.current,
      })
      currentId = ticket.id
      setTicketId(ticket.id)
      setTicketRef(ticket.ref)
      socket.emit('chat:link-ticket', { visitorId: visitorIdRef.current, ref: ticket.ref })
    } else {
      // Siguientes mensajes: se persisten en el hilo del ticket
      await api
        .post(`/api/tickets/${currentId}/messages`, { body, authorType: 'CUSTOMER', authorName: name })
        .catch(() => null)
    }

    // ⚡ Entrega instantánea vía WebSocket
    socket.emit('chat:customer-message', { visitorId: visitorIdRef.current, body, name })
    chatQueryClient.invalidateQueries({ queryKey: ['tickets'] })
  }

  return (
    <div className="max-w-xl mx-auto">
      {!socket ? (
        <div className="text-center py-8 space-y-3">
          <p className="text-sm text-muted-foreground">
            Habla con un agente en tiempo real. El chat crea un ticket automáticamente y las respuestas del agente
            aparecen aquí al instante (Socket.io).
          </p>
          <Button onClick={startChat} disabled={!identityReady || connecting}>
            {connecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Iniciar chat en vivo
          </Button>
          {!identityReady && <p className="text-[11px] text-muted-foreground">Rellena tu nombre y email arriba.</p>}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 mb-2">
            <span className="text-xs text-muted-foreground">
              {ticketRef ? `Ticket ${ticketRef} · chateando con el equipo` : 'Conectado · escribe tu consulta'}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> En vivo
            </span>
          </div>
          <div ref={scrollRef} className="h-72 overflow-y-auto rounded-lg border bg-background p-3 space-y-2.5">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-16">
                Cuéntanos tu consulta: se creará un ticket y un agente te responderá aquí mismo.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={cn('flex', m.own ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                    m.own ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-card border rounded-bl-sm'
                  )}
                >
                  {!m.own && <div className="text-[10px] text-muted-foreground mb-0.5">{m.authorName}</div>}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <div className={cn('text-[9px] mt-0.5', m.own ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                    {new Date(m.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Escribe un mensaje… (Enter para enviar)"
            />
            <Button onClick={send} disabled={!text.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────── Mis tickets + CSAT de un clic ───────────
function MyTickets({ email }: { email: string }) {
  const [draft, setDraft] = useState('')
  const [override, setOverride] = useState<string | null>(null)
  const [opened, setOpened] = useState<string | null>(null)

  const emailValid = /\S+@\S+\.\S+/.test(email)
  // Búsqueda efectiva: sigue al email del portal hasta que el usuario busca otro
  const active = override ?? (emailValid ? email : '')
  const inputValue = draft || (override ?? '')

  const { data: tickets, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['portal', active],
    queryFn: () => api.get<PortalTicketDTO[]>(`/api/portal?email=${encodeURIComponent(active)}`),
    enabled: !!active && /\S+@\S+\.\S+/.test(active),
    refetchInterval: 10000,
  })

  const csat = useMutation({
    mutationFn: ({ ticketId, score }: { ticketId: string; score: number }) =>
      api.post('/api/csat', { ticketId, score }),
    onSuccess: () => {
      toast.success('¡Gracias por tu valoración! 💚')
      refetch()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const list = tickets ?? []

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="flex gap-2">
        <Input
          type="email"
          value={inputValue}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const value = draft.trim() || (emailValid ? email : '')
              if (value) setOverride(value)
            }
          }}
          placeholder="Tu email para ver tus tickets"
        />
        <Button
          variant="secondary"
          disabled={isFetching || (!draft.trim() && !emailValid)}
          onClick={() => {
            const value = draft.trim() || (emailValid ? email : '')
            if (value) setOverride(value)
          }}
        >
          Buscar
        </Button>
      </div>

      {active && /\S+@\S+\.\S+/.test(active) && isLoading && <p className="text-xs text-muted-foreground">Buscando…</p>}

      {active && !isLoading && list.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">
          No hay tickets para {active}. Prueba con <code className="font-mono">laura.gomez@example.com</code> (tiene una
          encuesta pendiente) o crea uno desde «Escribir consulta».
        </p>
      )}

      {list.map((t) => (
        <div key={t.id} className="rounded-lg border bg-card overflow-hidden">
          <button
            className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors"
            onClick={() => setOpened(opened === t.id ? null : t.id)}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] text-muted-foreground">{t.ref}</span>
              <span className="text-sm font-medium flex-1 min-w-40 truncate">{t.subject}</span>
              <StatusBadge status={t.status} />
              <SourceBadge source={t.source} withLabel={false} />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2">
              <Clock className="h-3 w-3" /> {formatDateTime(t.createdAt)}
              {t.csatScore != null && <span>· Tu valoración: {t.csatScore === 3 ? '😊' : t.csatScore === 2 ? '😐' : '☹️'}</span>}
            </div>
          </button>

          {opened === t.id && (
            <div className="border-t bg-background px-4 py-3 space-y-2.5">
              {t.messages.map((m, i) => (
                <div key={i} className={cn('flex', m.authorType === 'CUSTOMER' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                      m.authorType === 'CUSTOMER' ? 'bg-primary text-primary-foreground' : 'bg-card border'
                    )}
                  >
                    <div className="text-[10px] opacity-70 mb-0.5">{m.authorName}</div>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              ))}

              {t.csatPending && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/40 p-3 text-center">
                  <p className="text-xs font-medium">¿Cómo fue nuestra ayuda con «{t.subject}»? Un clic y listo:</p>
                  <div className="mt-2 flex justify-center gap-2">
                    {[
                      { score: 3, face: '😊', label: 'Feliz' },
                      { score: 2, face: '😐', label: 'Neutral' },
                      { score: 1, face: '☹️', label: 'Triste' },
                    ].map((f) => (
                      <button
                        key={f.score}
                        onClick={() => csat.mutate({ ticketId: t.id, score: f.score })}
                        disabled={csat.isPending}
                        className="flex flex-col items-center rounded-lg border bg-card px-4 py-2 hover:border-emerald-400 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                      >
                        <span className="text-2xl">{f.face}</span>
                        <span className="text-[10px] text-muted-foreground">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {t.status === 'RESUELTO' && t.csatScore == null && !t.csatPending && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Ticket resuelto.
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
