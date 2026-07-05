import { NextRequest } from 'next/server'
import { requireRole, unauthorized, forbidden, ok, badRequest } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'
import { parsePagination } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  try {
    await requireRole('admin')
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)

    const result = await auditService.list({
      module: searchParams.get('module') || undefined,
      userId: searchParams.get('userId') || undefined,
      action: searchParams.get('action') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      page,
      limit,
    })

    return ok(result)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden()
    console.error('GET /api/audit error:', error)
    return badRequest('Erro ao buscar logs de auditoria')
  }
}