import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { BadRequestException } from '@/app/exceptions'
import { bomService } from '@/app/services/bom.service'

/** ADR-023 (item 4) — diff estrutural entre duas revisões do mesmo produto. `?fromId=&toId=`. */
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const fromId = searchParams.get('fromId') || ''
    const toId = searchParams.get('toId') || ''
    if (!fromId || !toId) throw new BadRequestException('Informe fromId e toId')

    const diff = await bomService.compareRevisions(fromId, toId)
    return ok(diff)
  } catch (error) {
    return handleRouteError(error, 'Erro ao comparar revisões de engenharia')
  }
}
