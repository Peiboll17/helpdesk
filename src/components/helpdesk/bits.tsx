'use client'

// Átomos visuales compartidos: badges de estado/prioridad/fuente, avatares, etc.

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Mail, FileText, MessageCircle, MessagesSquare, StickyNote } from 'lucide-react'
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
} from '@/lib/constants'

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${STATUS_STYLES[status] ?? 'bg-stone-100 text-stone-600 border-stone-200'}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${PRIORITY_STYLES[priority] ?? 'bg-stone-100 text-stone-600 border-stone-200'}`}
    >
      {priority === 'CRITICA' && '▲ '}
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  )
}

export function SourceBadge({ source, withLabel = true }: { source: string; withLabel?: boolean }) {
  const icons: Record<string, React.ReactNode> = {
    EMAIL: <Mail className="h-3 w-3" />,
    FORMULARIO_WEB: <FileText className="h-3 w-3" />,
    WHATSAPP: <MessageCircle className="h-3 w-3" />,
    CHAT_EN_VIVO: <MessagesSquare className="h-3 w-3" />,
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary border border-border px-2 py-0.5 text-[11px] text-secondary-foreground whitespace-nowrap">
      {icons[source] ?? <FileText className="h-3 w-3" />}
      {withLabel ? SOURCE_LABELS[source] ?? source : null}
    </span>
  )
}

export function SourceIcon({ source }: { source: string }) {
  const icons: Record<string, React.ReactNode> = {
    EMAIL: <Mail className="h-4 w-4" />,
    FORMULARIO_WEB: <FileText className="h-4 w-4" />,
    WHATSAPP: <MessageCircle className="h-4 w-4" />,
    CHAT_EN_VIVO: <MessagesSquare className="h-4 w-4" />,
  }
  return <>{icons[source] ?? <FileText className="h-4 w-4" />}</>
}

export function AgentAvatar({
  name,
  color,
  className = 'h-6 w-6',
}: {
  name?: string | null
  color?: string
  className?: string
}) {
  if (!name) {
    return (
      <span
        className={`inline-flex ${className} shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-[10px] text-muted-foreground`}
        title="Sin asignar"
      >
        ?
      </span>
    )
  }
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <Avatar className={`${className} shrink-0`}>
      <AvatarFallback
        className="text-[10px] font-semibold text-white"
        style={{ backgroundColor: color ?? '#059669' }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

export function NotesIndicator({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700" title={`${count} nota(s) internas`}>
      <StickyNote className="h-3 w-3" />
      {count}
    </span>
  )
}
