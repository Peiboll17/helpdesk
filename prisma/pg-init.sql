-- ============================================================
-- NexoDesk · PostgreSQL + pgvector
-- Ejecutar con psql (o la consola SQL de Supabase/Neon/RDS):
--   §1 ANTES de `npm run db:push:pg`  → habilita la extensión
--   §2 DESPUÉS del push               → índice HNSW (similitud coseno)
-- ============================================================

-- §1 · Extensión pgvector (requerida antes del db push) --------
CREATE EXTENSION IF NOT EXISTS vector;

-- §2 · Índice HNSW para la búsqueda semántica (después del push)
-- Nota: 1536 dimensiones = text-embedding-3-small (EMBEDDINGS_DIMS)
CREATE INDEX IF NOT EXISTS kb_article_embedding_hnsw
  ON "KBArticle"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
