// ============================================================
// Backfill de embeddings de la Base de Conocimiento
// Uso:  EMBEDDINGS_API_KEY=… bun run kb:backfill
// ------------------------------------------------------------
// Calcula el embedding de cada artículo (título + contenido) y
// lo guarda en la columna vector(1536) de KBArticle mediante SQL
// crudo. Solo tiene efecto con DATABASE_URL PostgreSQL + pgvector.
// ============================================================

import { PrismaClient } from '@prisma/client'
import { embedText, toVectorLiteral } from '../src/lib/embeddings'

const db = new PrismaClient()

async function main() {
  if (!process.env.DATABASE_URL?.startsWith('postgres')) {
    console.error('✖ Este script solo aplica a PostgreSQL. DATABASE_URL no empieza por "postgres".')
    process.exit(1)
  }
  if (!process.env.EMBEDDINGS_API_KEY) {
    console.error('✖ Falta EMBEDDINGS_API_KEY en el entorno.')
    process.exit(1)
  }

  const articles = await db.kBArticle.findMany({ select: { id: true, title: true, content: true } })
  console.log(`Embedding de ${articles.length} artículos…`)

  let done = 0
  for (const a of articles) {
    const vec = await embedText(`${a.title}\n\n${a.content}`)
    if (!vec) {
      console.warn(`  ⚠ sin embedding para "${a.title}" (falló el endpoint) — se omite`)
      continue
    }
    await db.$executeRawUnsafe(
      `UPDATE "KBArticle" SET embedding = $1::vector WHERE id = $2`,
      toVectorLiteral(vec),
      a.id
    )
    done++
    console.log(`  ✓ ${a.title} (${vec.length} dims)`)
  }

  console.log(`✅ Backfill completo: ${done}/${articles.length} artículos vectorizados.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
