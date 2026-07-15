import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError, parsePagination } from '@/lib/api-utils'
import { validateDto, createQuoteSchema } from '@/app/dto'
import { quoteService } from '@/app/services/quote.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''

    const result = await quoteService.list({ status, search, page, limit })
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar orçamentos')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('orcamentos', 'create')
    const body = await req.json()
    const data = validateDto(createQuoteSchema, body)

    const quote = await quoteService.create(data, user.id)
    return created(quote)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar orçamento')
  }
}
