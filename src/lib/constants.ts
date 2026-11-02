// Constantes del dominio Helpdesk

export const SOURCES = ['EMAIL', 'FORMULARIO_WEB', 'WHATSAPP', 'CHAT_EN_VIVO'] as const
export type Source = (typeof SOURCES)[number]

export const STATUSES = ['ABIERTO', 'EN_ESPERA', 'RESUELTO', 'CERRADO'] as const
export type Status = (typeof STATUSES)[number]

export const PRIORITIES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const
export type Priority = (typeof PRIORITIES)[number]

export const CATEGORIES = ['FINANZAS', 'TECNICO', 'CUENTAS', 'GENERAL'] as const
export type Category = (typeof CATEGORIES)[number]

export const SOURCE_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  FORMULARIO_WEB: 'Formulario Web',
  WHATSAPP: 'WhatsApp',
  CHAT_EN_VIVO: 'Chat en vivo',
}

export const STATUS_LABELS: Record<string, string> = {
  ABIERTO: 'Abierto',
  EN_ESPERA: 'En Espera',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
}

export const PRIORITY_LABELS: Record<string, string> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
}

// Clases Tailwind por estado (sin azules/indigos)
export const STATUS_STYLES: Record<string, string> = {
  ABIERTO: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  EN_ESPERA: 'bg-amber-100 text-amber-800 border-amber-200',
  RESUELTO: 'bg-teal-100 text-teal-800 border-teal-200',
  CERRADO: 'bg-stone-100 text-stone-600 border-stone-200',
}

export const PRIORITY_STYLES: Record<string, string> = {
  BAJA: 'bg-stone-100 text-stone-600 border-stone-200',
  MEDIA: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ALTA: 'bg-orange-100 text-orange-800 border-orange-200',
  CRITICA: 'bg-red-100 text-red-800 border-red-200',
}

export const SOURCE_ICONS: Record<string, string> = {
  EMAIL: 'Mail',
  FORMULARIO_WEB: 'FileText',
  WHATSAPP: 'MessageCircle',
  CHAT_EN_VIVO: 'MessagesSquare',
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function timeAgo(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'hace instantes'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} d`
}
