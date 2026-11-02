// ============================================================
// AUTOMATIZACIÓN 3 (motor) · Búsqueda semántica en la Base de Conocimiento
// ------------------------------------------------------------
// Implementa la búsqueda que alimenta la Deflexión de Tickets
// (formulario de contacto) y el Copiloto del Agente.
//
// En producción se sustituye por pgvector/Pinecone con embeddings;
// aquí usamos un motor léxico-semántico en español (normalización de
// acentos, lemas ligeros, diccionario de sinónimos y ponderación
// título > etiquetas > contenido) que responde en <1 ms y no depende
// de red externa, ideal para la búsqueda "mientras se escribe".
// ============================================================

export interface SearchableArticle {
  id: string
  slug: string
  title: string
  content: string
  tags: string
  keywords: string
}

export interface SearchResult<T> {
  article: T
  score: number // 0..1
  snippet: string
}

const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'ante', 'bajo',
  'con', 'contra', 'como', 'cuando', 'donde', 'que', 'en', 'entre', 'hacia', 'hasta', 'para',
  'por', 'segun', 'sin', 'sobre', 'tras', 'y', 'o', 'u', 'e', 'mi', 'tu', 'su', 'mis', 'tus',
  'sus', 'me', 'te', 'se', 'lo', 'le', 'les', 'nos', 'es', 'son', 'esta', 'este', 'esto', 'puedo',
  'puedo', 'puedo', 'mi', 'hay', 'the', 'of', 'to', 'and', 'es', 'muy', 'ya', 'no', 'si',
])

// Diccionario de sinónimos: expande la consulta y los documentos
const SYNONYMS: Record<string, string[]> = {
  contrasena: ['password', 'clave', 'credencial'],
  password: ['contrasena', 'clave'],
  clave: ['contrasena', 'password', 'llave'],
  cambiar: ['cambio', 'modificar', 'actualizar', 'restablecer', 'resetear'],
  cambiarla: ['cambiar', 'modificar', 'restablecer'],
  restablecer: ['recuperar', 'resetear', 'cambiar'],
  recuperar: ['restablecer', 'resetear'],
  pago: ['pagar', 'cobro', 'cargo', 'tarjeta', 'transaccion'],
  pagar: ['pago', 'cobro'],
  cobro: ['cargo', 'pago'],
  tarjeta: ['credito', 'debito', 'visa', 'mastercard'],
  factura: ['facturacion', 'facturas', 'recibo', 'invoice'],
  reembolso: ['devolucion', 'devolver', 'dinero'],
  devolucion: ['reembolso', 'devolver'],
  cancelar: ['anular', 'darse de baja', 'baja'],
  suscripcion: ['plan', 'membresia', 'cuota'],
  cuenta: ['perfil', 'usuario', 'acceso'],
  eliminar: ['borrar', 'suprimir'],
  borrar: ['eliminar'],
  api: ['integracion', 'endpoint', 'webhook', 'token'],
  webhook: ['api', 'integracion', 'notificacion'],
  integrar: ['integracion', 'api', 'conectar'],
  entrega: ['envio', 'pedido', 'llegar', 'shipping'],
  envio: ['entrega', 'pedido', 'paquete'],
  pedido: ['envio', 'entrega', 'orden', 'compra'],
  error: ['fallo', 'fallo', 'problema', 'bug'],
  fallo: ['error', 'problema'],
  actualiza: ['actualizar', 'modificar', 'cambiar'],
  actualizar: ['actualiza', 'modificar', 'cambiar'],
  descargar: ['descarga', 'obtener', 'exportar'],
  factura: ['facturas'],
  seguridad: ['2fa', 'verificacion', 'proteger', 'doble'],
  verificacion: ['2fa', 'codigo', 'seguridad'],
  email: ['correo', 'mail', 'direccion'],
  correo: ['email', 'mail'],
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function tokenize(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

function expand(tokens: string[]): string[] {
  const out = new Set(tokens)
  for (const t of tokens) {
    const syn = SYNONYMS[t]
    if (syn) syn.forEach((s) => out.add(s))
  }
  return Array.from(out)
}

function stemLight(token: string): string {
  // lematización muy ligera para plural/género español
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2)
  if (token.length > 3 && (token.endsWith('s') || token.endsWith('a') || token.endsWith('o'))) return token.slice(0, -1)
  return token
}

function makeIndex(a: SearchableArticle) {
  const title = tokenize(a.title).map(stemLight)
  const tags = tokenize(`${a.tags} ${a.keywords}`).map(stemLight)
  const content = tokenize(a.content).map(stemLight)
  const phrase = normalize(`${a.title} ${a.tags} ${a.keywords}`)
  return { title, tags, content, phrase, article: a }
}

export function searchArticles<T extends SearchableArticle>(
  query: string,
  articles: T[],
  limit = 5
): SearchResult<T>[] {
  const qTokens = expand(tokenize(query).map(stemLight))
  if (qTokens.length === 0) return []

  const results: SearchResult<T>[] = articles.map((article) => {
    const idx = makeIndex(article)
    let score = 0
    for (const q of qTokens) {
      if (idx.title.includes(q)) score += 6
      if (idx.tags.includes(q)) score += 4
      const hits = idx.content.filter((c) => c === q).length
      score += Math.min(hits, 3) * 1.5
      if (idx.phrase.includes(q)) score += 1
    }
    // Bonus por coincidencia de frase completa en título/etiquetas
    const fullQuery = normalize(query).trim()
    if (fullQuery.length > 5 && idx.phrase.includes(fullQuery)) score += 8

    const maxPossible = qTokens.length * (6 + 4 + 3 * 1.5 + 1) + 8
    const norm = Math.max(0, Math.min(1, score / maxPossible))

    return { article, score: norm, snippet: buildSnippet(article.content, qTokens) }
  })

  return results
    .filter((r) => r.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function buildSnippet(content: string, tokens: string[]): string {
  const sentences = content.split(/(?<=[.!?])\s+/)
  for (const s of sentences) {
    const ns = normalize(s)
    if (tokens.some((t) => ns.includes(t.slice(0, Math.max(4, t.length - 1))))) {
      return s.slice(0, 160) + (s.length > 160 ? '…' : '')
    }
  }
  return sentences[0]?.slice(0, 160) ?? ''
}
