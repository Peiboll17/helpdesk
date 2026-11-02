// ============================================================
// Embeddings para la búsqueda semántica de la KB (pgvector)
// ------------------------------------------------------------
// Compatible con cualquier endpoint estilo OpenAI (/embeddings):
//   EMBEDDINGS_API_URL  (por defecto https://api.openai.com/v1/embeddings)
//   EMBEDDINGS_API_KEY
//   EMBEDDINGS_MODEL    (por defecto text-embedding-3-small, 1536 dims)
//   EMBEDDINGS_DIMS     (por defecto 1536 — debe coincidir con el
//                        tipo vector(1536) de schema.postgres.prisma)
// Si no hay credenciales, embedText() devuelve null y toda la app
// cae en el motor léxico-semántico local (src/lib/search.ts).
// ============================================================

export interface EmbeddingsStatus {
  configured: boolean
  model: string | null
  dims: number
}

export function embeddingsStatus(): EmbeddingsStatus {
  const model = process.env.EMBEDDINGS_MODEL ?? 'text-embedding-3-small'
  const dims = parseInt(process.env.EMBEDDINGS_DIMS ?? '1536', 10)
  return {
    configured: Boolean(process.env.EMBEDDINGS_API_KEY),
    model: process.env.EMBEDDINGS_API_KEY ? model : null,
    dims,
  }
}

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.EMBEDDINGS_API_KEY
  if (!apiKey) return null

  const url = process.env.EMBEDDINGS_API_URL ?? 'https://api.openai.com/v1/embeddings'
  const model = process.env.EMBEDDINGS_MODEL ?? 'text-embedding-3-small'

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: text.slice(0, 8000),
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.warn(`[embeddings] endpoint respondió ${res.status}`)
      return null
    }
    const json = (await res.json()) as { data?: { embedding?: number[] }[] }
    const vec = json.data?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length === 0) return null
    return vec
  } catch (e) {
    console.warn('[embeddings] error de red:', e instanceof Error ? e.message : e)
    return null
  }
}

// Formato de texto que pgvector acepta como literal: "[0.1,0.2,…]"
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`
}
