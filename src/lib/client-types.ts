// Tipos compartidos del frontend

export interface AgentDTO {
  id: string
  name: string
  email: string
  color: string
  specialties: string[]
  openLoad: number
}

export interface TicketListItemDTO {
  id: string
  ref: string
  subject: string
  status: string
  priority: string
  source: string
  category: string
  customerName: string
  customerEmail: string
  assignee: { id: string; name: string; color: string } | null
  routingReason: string | null
  csatScore: number | null
  hasNotes: boolean
  lastMessage: { body: string; createdAt: string; authorType: string } | null
  createdAt: string
  updatedAt: string
}

export interface MessageDTO {
  id: string
  ticketId: string
  authorType: string // CUSTOMER | AGENT | SYSTEM
  authorName: string
  body: string
  createdAt: string
}

export interface NoteDTO {
  id: string
  ticketId: string
  authorName: string
  body: string
  createdAt: string
}

export interface TicketDetailDTO {
  id: string
  ref: string
  subject: string
  description: string
  status: string
  priority: string
  source: string
  category: string
  customerName: string
  customerEmail: string
  assigneeId: string | null
  assignee: { id: string; name: string; color: string; specialties: string } | null
  routingReason: string | null
  firstResponseAt: string | null
  resolvedAt: string | null
  closedAt: string | null
  csatScore: number | null
  csatComment: string | null
  csatSentAt: string | null
  visitorId: string | null
  messages: MessageDTO[]
  notes: NoteDTO[]
  createdAt: string
  updatedAt: string
}

export interface KBArticleDTO {
  id: string
  slug: string
  title: string
  content: string
  tags: string
  keywords: string
  views: number
  createdAt: string
  updatedAt: string
}

export interface KBSearchResult {
  article: KBArticleDTO
  score: number
}

export interface StatsDTO {
  statusCounts: Record<string, number>
  sourceCounts: Record<string, number>
  priorityCounts: Record<string, number>
  openTotal: number
  total: number
  resolvedToday: number
  avgFirstResponse: number
  csat: { happy: number; neutral: number; sad: number; total: number; percent: number | null }
  agentStats: {
    id: string
    name: string
    color: string
    specialties: string[]
    openLoad: number
    resolved: number
    csatAvg: number | null
  }[]
  kb: { articles: number; deflections: number }
  emailsSent: number
  activity: { kind: string; text: string; at: string; ticketId: string }[]
  updatedAt: string
}

export interface EmailLogDTO {
  id: string
  toEmail: string
  subject: string
  body: string
  kind: string
  provider: string
  createdAt: string
  ticket: { ref: string } | null
}

export interface PortalTicketDTO {
  id: string
  ref: string
  subject: string
  status: string
  priority: string
  source: string
  createdAt: string
  updatedAt: string
  csatScore: number | null
  csatPending: boolean
  messages: { authorType: string; authorName: string; body: string; createdAt: string }[]
}

export interface CopilotDraftDTO {
  draft: string
  sources: { slug: string; title: string }[]
  generatedAt: string
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(url: string, body: unknown) => request<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
}
