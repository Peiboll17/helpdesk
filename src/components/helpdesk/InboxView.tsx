'use client'

// Bandeja de Entrada Única: todos los canales en una sola lista,
// con búsqueda, filtros y atajos de teclado para responder a velocidad.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Inbox, ArrowLeft } from 'lucide-react'
import { api, type AgentDTO, type TicketListItemDTO } from '@/lib/client-types'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/constants'
import { PriorityBadge, SourceBadge, StatusBadge, AgentAvatar, NotesIndicator } from './bits'
import TicketDetail, { type ActionSignal } from './TicketDetail'

export interface InboxFilters {
  view: string
  source: string
  q: string
}

const PRIORITY_RANK: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 }

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}

export default function InboxView({ actingAgent }: { actingAgent: AgentDTO | null }) {
  const [view, setView] = useState('pendientes')
  const [source, setSource] = useState('todas')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [signal, setSignal] = useState<ActionSignal | null>(null)
  const [detailTab, setDetailTab] = useState('conversacion')
  const [mobileDetail, setMobileDetail] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const queryString = useMemo(() => {
    const sp = new URLSearchParams()
    if (view === 'pendientes') sp.set('view', 'abiertos')
    else if (view !== 'todos') sp.set('status', view)
    if (source !== 'todas') sp.set('source', source)
    if (debouncedSearch.trim()) sp.set('q', debouncedSearch.trim())
    return sp.toString()
  }, [view, source, debouncedSearch])

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets', queryString],
    queryFn: () => api.get<TicketListItemDTO[]>(`/api/tickets?${queryString}`),
    refetchInterval: 15000, // respaldo si el socket se cae
  })

  const sorted = useMemo(
    () =>
      [...(tickets ?? [])].sort((a, b) => {
        const p = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
        if (p !== 0) return p
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }),
    [tickets]
  )

  // Selección efectiva: derivada, sin efectos (si la selección actual
  // no está en la lista filtrada, se toma la primera)
  const effectiveSelectedId = useMemo(
    () => (selectedId && sorted.some((t) => t.id === selectedId) ? selectedId : (sorted[0]?.id ?? null)),
    [sorted, selectedId]
  )

  const moveSelection = useCallback(
    (dir: 1 | -1) => {
      if (sorted.length === 0) return
      const idx = sorted.findIndex((t) => t.id === effectiveSelectedId)
      const next = Math.min(sorted.length - 1, Math.max(0, (idx === -1 ? 0 : idx) + dir))
      setSelectedId(sorted[next].id)
    },
    [sorted, effectiveSelectedId]
  )

  const dispatch = useCallback(
    (type: ActionSignal['type']) => {
      // La señal viaja ligada al ticket seleccionado en este instante:
      // nunca debe aplicarse a otro ticket si la selección cambia.
      setSignal({ type, ts: Date.now(), ticketId: effectiveSelectedId })
    },
    [effectiveSelectedId]
  )

  const clearSignal = useCallback(() => setSignal(null), [])

  // ⌨️ Atajos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          moveSelection(1)
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          moveSelection(-1)
          break
        case 'r':
          e.preventDefault()
          setMobileDetail(true)
          setDetailTab('conversacion')
          dispatch('reply')
          break
        case 'n':
          e.preventDefault()
          setMobileDetail(true)
          setDetailTab('notas')
          dispatch('note')
          break
        case 'i':
          e.preventDefault()
          setDetailTab((t) => (t === 'notas' ? 'conversacion' : 'notas'))
          break
        case 'a':
          e.preventDefault()
          setMobileDetail(true)
          setDetailTab('conversacion')
          dispatch('assign')
          break
        case 'p':
          e.preventDefault()
          setMobileDetail(true)
          setDetailTab('conversacion')
          dispatch('priority')
          break
        case 'e':
          e.preventDefault()
          dispatch('resolve')
          break
        case 's':
          e.preventDefault()
          dispatch('wait')
          break
        case 'c':
          e.preventDefault()
          dispatch('close')
          break
        case 'Enter':
          if (selectedId) setMobileDetail(true)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [moveSelection, dispatch, effectiveSelectedId])

  const selectTicket = (id: string) => {
    setSelectedId(id)
    setMobileDetail(true)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[390px_1fr] h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-6rem)] overflow-hidden">
      {/* Panel izquierdo: lista unificada */}
      <div
        ref={listRef}
        className={cn(
          'flex flex-col border-r bg-card min-h-0',
          mobileDetail && 'hidden lg:flex'
        )}
      >
        <div className="p-3 space-y-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por asunto, cliente, ref…"
              className="pl-8 h-9"
              aria-label="Buscar tickets"
            />
          </div>
          <div className="flex gap-2">
            <Select value={view} onValueChange={setView}>
              <SelectTrigger size="sm" className="flex-1" aria-label="Filtrar por estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendientes">Pendientes (abiertos + espera)</SelectItem>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="ABIERTO">Abiertos</SelectItem>
                <SelectItem value="EN_ESPERA">En espera</SelectItem>
                <SelectItem value="RESUELTO">Resueltos</SelectItem>
                <SelectItem value="CERRADO">Cerrados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger size="sm" className="flex-1" aria-label="Filtrar por canal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos los canales</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="FORMULARIO_WEB">Formulario Web</SelectItem>
                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                <SelectItem value="CHAT_EN_VIVO">Chat en vivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div role="listbox" aria-label="Lista de tickets">
            {isLoading && (
              <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            )}
            {!isLoading && sorted.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <Inbox className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium">Inbox a cero 🎉</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No hay tickets con estos filtros. La deflexión de la base de conocimiento evita que lleguen repetitivos.
                </p>
              </div>
            )}
            {sorted.map((t) => (
              <button
                key={t.id}
                role="option"
                aria-selected={t.id === effectiveSelectedId}
                onClick={() => selectTicket(t.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-b transition-colors',
                  t.id === effectiveSelectedId ? 'bg-accent' : 'hover:bg-accent/60'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <PriorityBadge priority={t.priority} />
                  <span className="flex-1 text-sm font-medium truncate">{t.subject}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(t.createdAt)}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono text-muted-foreground">{t.ref}</span>
                  <SourceBadge source={t.source} />
                  <StatusBadge status={t.status} />
                  {t.hasNotes && <NotesIndicator count={1} />}
                  <span className="ml-auto flex items-center gap-1">
                    {t.csatScore != null && <span title="CSAT recibido">{t.csatScore === 3 ? '😊' : t.csatScore === 2 ? '😐' : '☹️'}</span>}
                    <AgentAvatar name={t.assignee?.name} color={t.assignee?.color} className="h-5 w-5" />
                  </span>
                </div>
                {t.lastMessage && (
                  <p className="mt-1 text-xs text-muted-foreground truncate">
                    {t.lastMessage.authorType === 'CUSTOMER' ? '→ ' : ''}
                    {t.lastMessage.body}
                  </p>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
          <kbd className="rounded border bg-muted px-1 font-mono">j/k</kbd> navegar
          <kbd className="rounded border bg-muted px-1 font-mono">r</kbd> responder
          <kbd className="rounded border bg-muted px-1 font-mono">n</kbd> nota
          <kbd className="rounded border bg-muted px-1 font-mono">e</kbd> resolver
          <kbd className="rounded border bg-muted px-1 font-mono">?</kbd> atajos
        </div>
      </div>

      {/* Panel derecho: detalle */}
      <div className={cn('min-h-0 min-w-0', !mobileDetail && 'hidden lg:block')}>
        {effectiveSelectedId ? (
          <TicketDetail
            ticketId={effectiveSelectedId}
            actingAgent={actingAgent}
            signal={signal}
            onSignalDone={clearSignal}
            tab={detailTab}
            onTabChange={setDetailTab}
            onBack={() => setMobileDetail(false)}
          />
        ) : (
          <div className="hidden lg:flex h-full flex-col items-center justify-center text-center px-8">
            <Inbox className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">Selecciona un ticket con</p>
            <p className="mt-1">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">j</kbd> /{' '}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">k</kbd>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
