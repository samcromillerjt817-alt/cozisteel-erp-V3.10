import { NextRequest } from 'next/server'
import { requireRole, ok, created, forbidden, handleRouteError, parsePagination, ForbiddenError } from '@/lib/api-utils'
import { validateDto, createUserSchema } from '@/app/dto'
import { userService } from '@/app/services/user.service'

export async function GET(req: NextRequest) {
  try {
    await requireRole('admin', 'manager')
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const search = searchParams.get('search') || ''

    const result = await userService.list({ search, page, limit })
    return ok(result)
  } catch (error) {
    // Preserva a mensagem genérica original (não a mensagem específica de requireRole).
    if (error instanceof ForbiddenError) return forbidden()
    return handleRouteError(error, 'Erro ao buscar usuários')
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin')
    const body = await req.json()
    const data = validateDto(createUserSchema, body)

    const newUser = await userService.create(data)
    return created(newUser)
  } catch (error) {
    // Preserva a mensagem genérica original (não a mensagem específica de requireRole).
    if (error instanceof ForbiddenError) return forbidden()
    return handleRouteError(error, 'Erro ao criar usuário')
  }
}
