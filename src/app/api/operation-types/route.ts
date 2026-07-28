import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError } from '@/lib/api-utils'
import { validateDto, createOperationTypeSchema } from '@/app/dto'
import { bomService } from '@/app/services/bom.service'

export async function GET() {
  try {
    await requireAuth()
    const types = await bomService.listOperationTypes()
    return ok(types)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar tipos de operação')
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireModulePermission('produtos', 'update')
    const body = await req.json()
    const data = validateDto(createOperationTypeSchema, body)

    const type = await bomService.createOperationType(data)
    return created(type)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar tipo de operação')
  }
}
