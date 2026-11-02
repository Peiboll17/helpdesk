import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/kb/[id] → editar artículo (o registrar una "deflexión" con { deflect: true })
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))

  if (body.deflect) {
    const article = await db.kBArticle.update({ where: { id }, data: { views: { increment: 1 } } })
    return NextResponse.json(article)
  }

  const data: Record<string, unknown> = {}
  if (body.title?.trim()) data.title = String(body.title).slice(0, 200)
  if (body.content?.trim()) data.content = String(body.content).slice(0, 8000)
  if (typeof body.tags === 'string') data.tags = body.tags.slice(0, 200)
  if (typeof body.keywords === 'string') data.keywords = body.keywords.slice(0, 200)

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const article = await db.kBArticle.update({ where: { id }, data })
  return NextResponse.json(article)
}

// DELETE /api/kb/[id] → eliminar artículo
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params
  await db.kBArticle.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
