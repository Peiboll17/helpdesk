import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { searchArticles } from '@/lib/search'

export const dynamic = 'force-dynamic'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

// GET /api/kb?q=... → lista o búsqueda semántica (deflexión de tickets)
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()

  if (!q) {
    const articles = await db.kBArticle.findMany({ orderBy: { updatedAt: 'desc' } })
    return NextResponse.json({ mode: 'list', results: articles.map((a) => ({ article: a, score: 1 })) })
  }

  const articles = await db.kBArticle.findMany()
  const results = searchArticles(q, articles, 5)

  // Búsqueda también por texto directo en título (fallback)
  if (results.length === 0) {
    const like = await db.kBArticle.findMany({
      where: {
        OR: [{ title: { contains: q } }, { content: { contains: q } }, { tags: { contains: q } }],
      },
      take: 5,
    })
    return NextResponse.json({ mode: 'search', results: like.map((a) => ({ article: a, score: 0.1 })) })
  }

  return NextResponse.json({ mode: 'search', results })
}

// POST /api/kb → crea un artículo
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body?.title?.trim() || !body?.content?.trim()) {
    return NextResponse.json({ error: 'Título y contenido son obligatorios' }, { status: 400 })
  }

  let slug = slugify(body.title)
  const exists = await db.kBArticle.findUnique({ where: { slug } })
  if (exists) slug = `${slug}-${Date.now().toString(36).slice(-4)}`

  const article = await db.kBArticle.create({
    data: {
      slug,
      title: String(body.title).slice(0, 200),
      content: String(body.content).slice(0, 8000),
      tags: String(body.tags ?? '').slice(0, 200),
      keywords: String(body.keywords ?? '').slice(0, 200),
    },
  })

  return NextResponse.json(article, { status: 201 })
}
