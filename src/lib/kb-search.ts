// ============================================================
// Búsqueda de la Base de Conocimiento · conmutador de motor
// ------------------------------------------------------------
//  · KB_SEARCH=pgvector + DATABASE_URL postgres → búsqueda por
//    similitud coseno con pgvector (embeddings, ver embeddings.ts)
//  · Cualquier otro caso → motor léxico-semántico local
//    (src/lib/search.ts), sin dependencias externas.
// Ambos motores devuelven la misma forma SearchResult, así que
// deflexión (formulario) y copiloto IA no saben (ni les importa)
// qué motor está activo.
// ============================================================

import { db } from '@/lib/db'
import { searchArticles, type SearchableArticle, type SearchResult } from '@/lib/search'
import { embedText, toVectorLiteral } from '@/lib/embeddings'

export function vectorSearchEnabled(): boolean {
  return (
    process.env.DATABASE_URL?.startsWith('postgres') === true &&
    process.env.KB_SEARCH === 'pgvector'
  )
}

interface VectorRow {
  id: string
  slug: string
  title: string
  content: string
  tags: string
  keywords: string
  score: number
}

export async function searchKB(query: string, limit = 5): Promise<SearchResult<SearchableArticle>[]> {
  const q = query.trim()
  if (!q) return []

  // Motor vectorial (solo en producción con PostgreSQL + pgvector)
  if (vectorSearchEnabled()) {
    try {
      const vec = await embedText(q)
      if (vec) {
        const literal = toVectorLiteral(vec)
        const rows = await db.$queryRaw<VectorRow[]>`
          SELECT id, slug, title, content, tags, keywords,
                 1 - (embedding <=> ${literal}::vector) AS score
          FROM "KBArticle"
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${literal}::vector
          LIMIT ${limit}`
        if (rows.length > 0) {
          return rows.map((r) => ({
            article: {
              id: r.id,
              slug: r.slug,
              title: r.title,
              content: r.content,
              tags: r.tags,
              keywords: r.keywords,
            },
            score: Math.max(0, Math.min(1, Number(r.score))),
            snippet: r.content.slice(0, 160),
          }))
        }
        // Si nadie tiene embedding (falta el backfill), caemos al léxico
        console.warn('[kb] pgvector activo pero sin embeddings: backfill pendiente (bun run kb:backfill)')
      }
    } catch (e) {
      console.warn('[kb] búsqueda vectorial falló, uso el motor léxico:', e instanceof Error ? e.message : e)
    }
  }

  // Motor léxico-semántico (desarrollo y fallback universal)
  const articles = await db.kBArticle.findMany()
  return searchArticles(q, articles, limit)
}
