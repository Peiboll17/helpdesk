import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/emails → bandeja de salida simulada (adaptador SendGrid / AWS SES)
export async function GET() {
  const emails = await db.emailLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { ticket: { select: { ref: true } } },
  })
  return NextResponse.json(emails)
}
