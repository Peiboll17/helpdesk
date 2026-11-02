// ============================================================
// AUTOMATIZACIÓN 1 · Enrutamiento Inteligente por Carga y Especialidad
// ------------------------------------------------------------
// El motor analiza las palabras clave del ticket, determina la
// categoría y prioridad, y asigna el agente activo con la
// especialidad correcta Y menor carga (tickets abiertos).
// En producción esto viviría como servicio NestJS/Go con una cola;
// aquí se ejecuta como parte del ciclo de creación del ticket.
// ============================================================

import type { Category, Priority } from './constants'

export interface RoutingInput {
  subject: string
  description: string
  source: string
}

export interface RoutingDecision {
  category: Category
  priority: Priority
  assigneeId: string | null
  reason: string
  matchedKeywords: string[]
}

interface Rule {
  category: Category
  keywords: string[] // coincidencia por palabra (normalizada, sin acentos)
  priorityBoost?: Priority
  boostKeywords?: string[] // si coinciden, se eleva la prioridad
  label: string
}

// Reglas de clasificación (el "cerebro" Zero-Touch)
const RULES: Rule[] = [
  {
    category: 'FINANZAS',
    label: 'Finanzas y pagos',
    keywords: [
      'pasarela de pago', 'pago', 'pagos', 'cobro', 'cargo', 'factura', 'facturacion',
      'reembolso', 'devolucion', 'tarjeta', 'stripe', 'paypal', 'redsys', 'tpv',
      'suscripcion', 'renovacion', 'iban', 'transferencia', 'impuesto', 'iva',
    ],
    boostKeywords: [
      'pasarela de pago', 'pago fallido', 'error de pago', 'error en el pago', 'no puedo pagar',
      'cobro duplicado', 'cargo duplicado', 'cargo incorrecto', 'fraude', 'estafa',
      'caido', 'caida', 'produccion', 'dinero', 'urgente',
    ],
    priorityBoost: 'CRITICA',
  },
  {
    category: 'TECNICO',
    label: 'Soporte técnico',
    keywords: [
      'error', 'bug', 'fallo', 'falla', 'no funciona', 'roto', 'crash', 'pantalla',
      'api', 'integracion', 'webhook', '500', '404', 'timeout', 'lent', 'rendimiento',
      'app', 'movil', 'ios', 'android', 'navegador', 'chrome', 'safari', 'actualizacion',
      'exportar', 'sincroniz',
    ],
    boostKeywords: ['produccion', 'caido', 'caida', 'todos los usuarios', 'sin servicio', 'datos perdidos'],
    priorityBoost: 'CRITICA',
  },
  {
    category: 'CUENTAS',
    label: 'Cuentas y acceso',
    keywords: [
      'contrasena', 'password', 'cuenta', 'acceso', 'login', 'iniciar sesion', 'registro',
      'darse de baja', 'eliminar cuenta', 'datos personales', 'rgpd', 'gdpr', 'email de contacto',
      'perfil', '2fa', 'verificacion', 'codigo',
    ],
    priorityBoost: 'ALTA',
    boostKeywords: ['no puedo acceder', 'bloqueada', 'hackeada', 'robo'],
  },
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos: contraseña -> contrasena
    .replace(/\s+/g, ' ')
}

const BASE_PRIORITY_BY_SOURCE: Record<string, Priority> = {
  CHAT_EN_VIVO: 'MEDIA',
  WHATSAPP: 'MEDIA',
  EMAIL: 'MEDIA',
  FORMULARIO_WEB: 'BAJA',
}

export function classifyPriorityAndCategory(input: RoutingInput): {
  category: Category
  priority: Priority
  matchedKeywords: string[]
  boostKeyword: string | null
} {
  const haystack = normalize(`${input.subject} ${input.description}`)
  let best: { rule: Rule; score: number; matched: string[] } | null = null

  for (const rule of RULES) {
    const matched = rule.keywords.filter((kw) => haystack.includes(normalize(kw)))
    if (matched.length === 0) continue
    // Puntúa por longitud de las palabras clave encontradas (más específicas pesan más)
    const score = matched.reduce((acc, kw) => acc + kw.length, 0)
    if (!best || score > best.score) best = { rule, score, matched }
  }

  const boostMatched: string[] = best?.rule.boostKeywords?.filter((kw) => haystack.includes(normalize(kw))) ?? []

  let priority: Priority = BASE_PRIORITY_BY_SOURCE[input.source] ?? 'MEDIA'
  if (best) {
    if (boostMatched.length > 0 && best.rule.priorityBoost) {
      priority = best.rule.priorityBoost
    } else if (best.rule.category === 'FINANZAS') {
      priority = priority === 'CRITICA' ? 'CRITICA' : 'ALTA'
    }
  }

  return {
    category: best?.rule.category ?? 'GENERAL',
    priority,
    matchedKeywords: best?.matched ?? [],
    boostKeyword: boostMatched[0] ?? null,
  }
}

export interface AgentCandidate {
  id: string
  name: string
  specialties: string
  isActive: boolean
  openLoad: number
}

// Selección por especialidad + menor carga abierta
export function pickAgent(
  agents: AgentCandidate[],
  category: Category
): { agent: AgentCandidate | null; basis: 'especialidad' | 'carga' | 'ninguno' } {
  const active = agents.filter((a) => a.isActive)
  if (active.length === 0) return { agent: null, basis: 'ninguno' }

  const specialists = active
    .filter((a) => a.specialties.toLowerCase().split(',').map((s) => s.trim()).includes(category.toLowerCase()))
    .sort((a, b) => a.openLoad - b.openLoad)

  if (specialists.length > 0) return { agent: specialists[0], basis: 'especialidad' }

  const leastLoaded = [...active].sort((a, b) => a.openLoad - b.openLoad)
  return { agent: leastLoaded[0], basis: 'carga' }
}

export function routeTicket(
  input: RoutingInput,
  agents: AgentCandidate[]
): RoutingDecision {
  const { category, priority, matchedKeywords, boostKeyword } = classifyPriorityAndCategory(input)
  const { agent, basis } = pickAgent(agents, category)

  const parts: string[] = []
  if (matchedKeywords.length > 0) {
    parts.push(`Palabras clave detectadas: "${matchedKeywords.slice(0, 3).join('", "')}" → especialidad ${category}`)
  } else {
    parts.push('Sin palabras clave de especialidad → cola General')
  }
  if (boostKeyword) {
    parts.push(`regla de urgencia por "${boostKeyword}" → prioridad CRITICA`)
  }
  if (agent) {
    parts.push(
      basis === 'especialidad'
        ? `agente experto en ${category} con menor carga seleccionado: ${agent.name} (${agent.openLoad} tickets abiertos)`
        : `sin especialista disponible → asignado por carga mínima: ${agent.name} (${agent.openLoad} abiertos)`
    )
  } else {
    parts.push('sin agentes activos: queda sin asignar')
  }

  return {
    category,
    priority,
    assigneeId: agent?.id ?? null,
    reason: parts.join(' · '),
    matchedKeywords,
  }
}
