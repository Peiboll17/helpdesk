# Migración a PostgreSQL + pgvector

La app de desarrollo usa SQLite para que clones y funcione en 30 segundos. El proyecto trae **todo listo** para producción con PostgreSQL 16 + pgvector: esquema paralelo, motor de búsqueda vectorial y script de backfill.

## Qué hay ya preparado

| Pieza | Archivo | Papel |
|---|---|---|
| Esquema PostgreSQL | `prisma/schema.postgres.prisma` | mismos modelos + `KBArticle.embedding vector(1536)` + índices de matching WhatsApp |
| SQL de extensión/índice | `prisma/pg-init.sql` | `CREATE EXTENSION vector` + índice HNSW (coseno) |
| Embeddings | `src/lib/embeddings.ts` | endpoint compatible OpenAI (`/embeddings`), configurable por env |
| Conmutador de motor | `src/lib/kb-search.ts` | `KB_SEARCH=pgvector` → similitud coseno; si no, motor léxico local |
| Backfill | `scripts/backfill-embeddings.ts` | vectoriza los artículos existentes (`npm run kb:backfill`) |

La **deflexión del formulario** y el **Copiloto IA** llaman a `searchKB()`; cambian de motor automáticamente sin tocar código de UI.

## Pasos de migración

1. **Provisiona PostgreSQL 16** (Neon, Supabase, RDS, Docker…) y crea la base:
   ```bash
   psql "$DATABASE_URL" -f prisma/pg-init.sql        # §1: CREATE EXTENSION vector
   ```
   *(En Supabase también puedes activar `vector` desde la UI: Database → Extensions.)*

2. **Apunta el `.env`** a la base nueva:
   ```bash
   DATABASE_URL="postgresql://usuario:password@host:5432/nexodesk"
   ```

3. **Crea el esquema y los datos**:
   ```bash
   npm run db:push:pg        # push del esquema PostgreSQL
   npm run db:seed           # datos demo (o migra tus datos reales)
   psql "$DATABASE_URL" -f prisma/pg-init.sql   # §2: índice HNSW
   ```

4. **Activa la búsqueda vectorial**:
   ```bash
   # .env
   KB_SEARCH="pgvector"
   EMBEDDINGS_API_KEY="xxxxxxxx"                  # endpoint compatible OpenAI
   EMBEDDINGS_MODEL="text-embedding-3-small"      # 1536 dims (el del esquema)
   ```

5. **Vectoriza los artículos existentes**:
   ```bash
   npm run kb:backfill
   ```

6. **Verifica**: la tarjeta «Integraciones» del dashboard mostrará `Búsqueda KB: pgvector` y `GET /api/integrations/status` → `database.vectorSearch: true`.

## Notas y despliegue

- **Dimensiones**: el esquema usa `vector(1536)` (estándar de `text-embedding-3-small`). Si usas otro modelo, ajusta `EMBEDDINGS_DIMS` **y** el tipo del campo en `schema.postgres.prisma`, y re-ejecuta `db:push:pg` + `kb:backfill`.
- **Cliente Prisma**: en producción genera el cliente del esquema PG (`npm run db:generate:pg`) tras instalar dependencias.
- **Doble escritura durante la transición**: puedes mantener SQLite como histórico y PostgreSQL como destino; los datos de tickets se copian con un `pg_dump`/script propio (la forma de los modelos es idéntica salvo `embedding`, que se calcula con el backfill).
- **Rendimiento**: con el índice HNSW, la búsqueda coseno sobre decenas de miles de artículos responde en milisegundos; el motor léxico sigue siendo el fallback automático si el endpoint de embeddings falla.
- **Webhooks** (Twilio/SendGrid) apuntan a tu dominio: no cambian con la migración.
