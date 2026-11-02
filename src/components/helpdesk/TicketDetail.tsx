'use client'

// Detalle del ticket: hilo de conversación, notas internas, acciones y Copiloto IA

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  Pause,
  Lock,
  Sparkles,
  Send,
  StickyNote,
  ShieldAlert,
  Zap,
  Bot,
  RefreshCw,
  Loader2,
  Star,
} from 'lucide-react'
import { api, type AgentDTO, type CopilotDraftDTO, type TicketDetailDTO } from '@/lib/client-types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatDateTime, SOURCE_LABELS, STATUS_LABELS } from '@/lib/constants'
import { PriorityBadge, SourceBadge, StatusBadge, AgentAvatar } from './bits'

export interface ActionSignal {
  type: 'reply' | 'note' | 'assign' | 'priority' | 'resolve' | 'wait' | 'close' | 'notes-toggle'
  ts: number
  ticketId: string | null // ticket sobre el que se despachó el atajo (evita cascadas al cambiar de selección)
}

const CSAT_FACES: Record<number, string> = { 1: '☹️ Triste', 2: '😐 Neutral', 3: '😊 Feliz' }

export default function TicketDetail({
  ticketId,
  actingAgent,
  signal,
  onSignalDone,
  tab,
  onTabChange,
  onBack,
}: {
  ticketId: string
  actingAgent: AgentDTO | null
  signal: ActionSignal | null
  onSignalDone: () => void
  tab: string
  onTabChange: (t: string) => void
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const [replyText, setReplyText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [draft, setDraft] = useState<CopilotDraftDTO | null>(null)
  const replyRef = useRef<HTMLTextAreaElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const lastSignalTs = useRef<number>(0)
  const ticketRef = useRef<TicketDetailDTO | undefined>(undefined)

  const { data: ticket } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => api.get<TicketDetailDTO>(`/api/tickets/${ticketId}`),
    refetchInterval: 15000,
  })

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<AgentDTO[]>('/api/agents'),
  })

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] })
    queryClient.invalidateQueries({ queryKey: ['tickets'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
  }, [queryClient, ticketId])

  // ─────────── Mutaciones ───────────
  const patchTicket = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/api/tickets/${ticketId}`, data),
    onSuccess: () => {
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const sendMessage = useMutation({
    mutationFn: (body: string) =>
      api.post(`/api/tickets/${ticketId}/messages`, { body, authorType: 'AGENT', authorName: actingAgent?.name }),
    onSuccess: () => {
      setReplyText('')
      invalidate()
      toast.success('Respuesta enviada al cliente (por email y en el hilo)')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const sendNote = useMutation({
    mutationFn: (body: string) =>
      api.post(`/api/tickets/${ticketId}/notes`, { body, authorName: actingAgent?.name }),
    onSuccess: () => {
      setNoteText('')
      invalidate()
      toast.success('Nota interna guardada (invisible para el cliente)')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const simulateReply = useMutation({
    mutationFn: () => api.post(`/api/tickets/${ticketId}/simulate-reply`),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  })

  const copilot = useMutation({
    mutationFn: () =>
      api.post<CopilotDraftDTO>(`/api/tickets/${ticketId}/ai-draft`, { agentName: actingAgent?.name }),
    onSuccess: (data) => setDraft(data),
    onError: (e: Error) => toast.error(e.message),
  })

  // ─────────── Señales de atajos de teclado ───────────
  // Cada señal se consume UNA sola vez (guard por ts) y solo se aplica al
  // ticket para el que fue despachada. Esto evita que, al resolverse un
  // ticket y saltar la selección al siguiente, la acción se re-dispare en
  // cascada sobre otros tickets (bug de bucle de PATCH).
  useEffect(() => {
    if (!signal) return
    if (signal.ts === lastSignalTs.current) return // ya consumida
    lastSignalTs.current = signal.ts

    // La señal era para otro ticket (la selección cambió entretanto): ignorar
    if (signal.ticketId && signal.ticketId !== ticketId) {
      onSignalDone()
      return
    }

    const t = ticketRef.current
    switch (signal.type) {
      case 'reply':
        setTimeout(() => replyRef.current?.focus(), 60)
        break
      case 'note':
        setTimeout(() => noteRef.current?.focus(), 60)
        break
      case 'assign':
        setTimeout(() => (document.getElementById('assignee-select') as HTMLButtonElement | null)?.focus(), 60)
        break
      case 'priority':
        setTimeout(() => (document.getElementById('priority-select') as HTMLButtonElement | null)?.focus(), 60)
        break
      case 'resolve':
        if (t && !['RESUELTO', 'CERRADO'].includes(t.status)) {
          patchTicket.mutate({ status: 'RESUELTO' })
          toast.success('Ticket resuelto · Encuesta CSAT enviada automáticamente 😊😐☹️')
        }
        break
      case 'wait':
        if (t && t.status !== 'EN_ESPERA') patchTicket.mutate({ status: 'EN_ESPERA' })
        break
      case 'close':
        if (t && t.status !== 'CERRADO') patchTicket.mutate({ status: 'CERRADO' })
        break
    }
    onSignalDone()
  }, [signal, ticketId, patchTicket, onSignalDone])

  // Mantener la referencia al ticket fresco para los atajos (evita
  // depender de `ticket` en el efecto de señales)
  useEffect(() => {
    ticketRef.current = ticket
  }, [ticket])

  // Teclado en los redactores: ⌘/Ctrl+Enter envía · Escape vuelve al modo comando
  const composerKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (replyText.trim()) sendMessage.mutate(replyText.trim())
    }
    if (e.key === 'Escape') e.currentTarget.blur()
  }

  if (!ticket) {
    return (
      <div className="p-5 space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <div className="space-y-3 pt-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const isClosed = ['RESUELTO', 'CERRADO'].includes(ticket.status)

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Cabecera del ticket */}
      <div className="border-b bg-card px-4 py-3 space-y-2">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" className="lg:hidden shrink-0 -ml-2" onClick={onBack} aria-label="Volver a la lista">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-muted-foreground">{ticket.ref}</span>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <SourceBadge source={ticket.source} />
              <Badge variant="outline" className="text-[11px]">
                {ticket.category}
              </Badge>
              {ticket.csatScore != null && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">
                  <Star className="h-3 w-3" /> CSAT: {CSAT_FACES[ticket.csatScore]}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-base font-semibold leading-snug line-clamp-2">{ticket.subject}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ticket.customerName} &lt;{ticket.customerEmail}&gt; · {SOURCE_LABELS[ticket.source]} · creado{' '}
              {formatDateTime(ticket.createdAt)}
              {ticket.firstResponseAt && ` · 1ª respuesta ${formatDateTime(ticket.firstResponseAt)}`}
            </p>
          </div>
        </div>

        {/* ⚡ Explicación del enrutamiento Zero-Touch */}
        {ticket.routingReason && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/40 px-3 py-2">
            <Zap className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-[11px] leading-relaxed text-emerald-900 dark:text-emerald-200">
              <strong>Enrutamiento Zero-Touch:</strong> {ticket.routingReason}
            </p>
          </div>
        )}

        {/* Barra de acciones */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={ticket.assigneeId ?? 'sin_asignar'}
            onValueChange={(id) => patchTicket.mutate({ assigneeId: id === 'sin_asignar' ? null : id })}
          >
            <SelectTrigger id="assignee-select" size="sm" className="w-[180px]" aria-label="Asignar agente">
              <SelectValue placeholder="Sin asignar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sin_asignar">— Sin asignar —</SelectItem>
              {(agents ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-2">
                    <AgentAvatar name={a.name} color={a.color} className="h-4 w-4" />
                    {a.name} ({a.openLoad})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={ticket.priority} onValueChange={(p) => patchTicket.mutate({ priority: p })}>
            <SelectTrigger id="priority-select" size="sm" className="w-[120px]" aria-label="Cambiar prioridad">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BAJA">Baja</SelectItem>
              <SelectItem value="MEDIA">Media</SelectItem>
              <SelectItem value="ALTA">Alta</SelectItem>
              <SelectItem value="CRITICA">Crítica</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            {!isClosed && (
              <>
                <Button
                  size="sm"
                  onClick={() => patchTicket.mutate({ status: 'RESUELTO' })}
                  title="Resolver y enviar encuesta CSAT (tecla e)"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolver
                </Button>
                {ticket.status !== 'EN_ESPERA' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => patchTicket.mutate({ status: 'EN_ESPERA' })}
                    title="Poner en espera (tecla s)"
                  >
                    <Pause className="h-3.5 w-3.5 mr-1" /> Espera
                  </Button>
                )}
              </>
            )}
            {ticket.status !== 'CERRADO' && (
              <Button size="sm" variant="outline" onClick={() => patchTicket.mutate({ status: 'CERRADO' })} title="Cerrar (tecla c)">
                <Lock className="h-3.5 w-3.5 mr-1" /> Cerrar
              </Button>
            )}
            {['RESUELTO', 'CERRADO'].includes(ticket.status) && (
              <Button size="sm" variant="outline" onClick={() => patchTicket.mutate({ status: 'ABIERTO' })} title="Reabrir">
                Reabrir
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => simulateReply.mutate()}
              title="Simula que el cliente contesta (útil en la demo)"
              disabled={simulateReply.isPending}
            >
              <Bot className="h-3.5 w-3.5 mr-1" /> Resp. cliente
            </Button>
          </div>
        </div>
      </div>

      {/* Pestañas */}
      <Tabs value={tab} onValueChange={onTabChange} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-2 w-fit">
          <TabsTrigger value="conversacion" className="text-xs">
            Conversación
          </TabsTrigger>
          <TabsTrigger value="notas" className="text-xs">
            <StickyNote className="h-3.5 w-3.5 mr-1 text-amber-600" />
            Notas internas ({ticket.notes.length})
          </TabsTrigger>
          <TabsTrigger value="copiloto" className="text-xs">
            <Sparkles className="h-3.5 w-3.5 mr-1 text-primary" />
            Copiloto IA
          </TabsTrigger>
        </TabsList>

        {/* ── Conversación ── */}
        <TabsContent value="conversacion" className="flex-1 flex flex-col min-h-0 mt-0">
          <ScrollArea className="flex-1 min-h-0 px-4 py-3">
            <div className="space-y-3 max-w-3xl">
              {ticket.messages.map((m) => {
                if (m.authorType === 'SYSTEM') {
                  return (
                    <div key={m.id} className="flex justify-center py-1">
                      <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-3 py-1 text-center">
                        {m.body}
                      </span>
                    </div>
                  )
                }
                const isCustomer = m.authorType === 'CUSTOMER'
                return (
                  <div key={m.id} className={cn('flex', isCustomer ? 'justify-start' : 'justify-end')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                        isCustomer
                          ? 'bg-card border rounded-bl-sm'
                          : 'bg-primary text-primary-foreground rounded-br-sm'
                      )}
                    >
                      <div className={cn('text-[10px] mb-1 font-medium', isCustomer ? 'text-muted-foreground' : 'text-primary-foreground/75')}>
                        {m.authorName} · {formatDateTime(m.createdAt)}
                      </div>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>

          {/* Redactor de respuesta */}
          <div className="border-t bg-card p-3">
            <Textarea
              ref={replyRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={composerKeys}
              placeholder={`Responde a ${ticket.customerName.split(' ')[0]} como ${actingAgent?.name ?? 'agente'}… (⌘/Ctrl+Enter para enviar · tecla r para enfocar)`}
              rows={3}
              className="resize-none text-sm"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                Se envía por el hilo y por email (adaptador SendGrid/SES simulado)
              </span>
              <Button size="sm" disabled={!replyText.trim() || sendMessage.isPending} onClick={() => sendMessage.mutate(replyText.trim())}>
                {sendMessage.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Enviar
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Notas internas ── */}
        <TabsContent value="notas" className="flex-1 flex flex-col min-h-0 mt-0">
          <ScrollArea className="flex-1 min-h-0 px-4 py-3">
            <div className="space-y-3 max-w-3xl">
              {ticket.notes.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <StickyNote className="h-8 w-8 text-amber-500/60 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Sin notas todavía. Usa las notas para colaborar con otros agentes: el cliente nunca las ve.
                  </p>
                </div>
              )}
              {ticket.notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                    <ShieldAlert className="h-3 w-3" /> 🔒 Solo equipo · {n.authorName} · {formatDateTime(n.createdAt)}
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{n.body}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="border-t bg-card p-3">
            <Textarea
              ref={noteRef}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={composerKeys}
              placeholder="Nota interna para el equipo (invisible para el cliente)… (tecla n para enfocar)"
              rows={3}
              className="resize-none text-sm border-amber-200 focus-visible:ring-amber-400"
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="secondary" disabled={!noteText.trim() || sendNote.isPending} onClick={() => sendNote.mutate(noteText.trim())}>
                {sendNote.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <StickyNote className="h-4 w-4 mr-1" />}
                Guardar nota
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Copiloto IA ── */}
        <TabsContent value="copiloto" className="flex-1 min-h-0 mt-0 px-4 py-3">
          <div className="max-w-3xl space-y-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold">Copiloto del agente</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    La IA lee la duda del cliente, busca en la Base de Conocimientos y redacta un borrador listo para
                    revisar. Tú solo revisas y pulsas <strong>Enviar</strong>.
                  </p>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={() => copilot.mutate()} disabled={copilot.isPending}>
                      {copilot.isPending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Redactando…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 mr-1" /> Generar borrador
                        </>
                      )}
                    </Button>
                    {draft && (
                      <Button size="sm" variant="outline" onClick={() => copilot.mutate()}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {copilot.isPending && (
              <div className="space-y-2 rounded-lg border p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Leyendo el ticket y la base de conocimientos…
                </p>
              </div>
            )}

            {copilot.isError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                No se pudo generar el borrador. Inténtalo de nuevo en unos segundos.
              </div>
            )}

            {draft && !copilot.isPending && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <Textarea
                  value={draft.draft}
                  onChange={(e) => setDraft({ ...draft, draft: e.target.value })}
                  rows={8}
                  className="text-sm resize-none"
                  aria-label="Borrador sugerido por la IA"
                />
                {draft.sources.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">Fuentes usadas:</span>
                    {draft.sources.map((s) => (
                      <Badge key={s.slug} variant="secondary" className="text-[10px]">
                        📄 {s.title}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setReplyText(draft.draft)
                      onTabChange('conversacion')
                      toast.success('Borrador copiado a la conversación: revísalo y envía')
                    }}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" /> Usar en conversación
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
