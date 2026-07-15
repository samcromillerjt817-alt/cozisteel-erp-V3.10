import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError, parsePagination } from '@/lib/api-utils'
import { validateDto, createClientSchema } from '@/app/dto'
import { clientService } from '@/app/services/client.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const search = searchParams.get('search') || ''

    const result = await clientService.list({ search, page, limit })
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar clientes')
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireModulePermission('clientes', 'create')
    const body = await req.json()
    const data = validateDto(createClientSchema, body)

    const client = await clientService.create(data)
    return created(client)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar cliente')
  }
}
