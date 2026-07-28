import { NextRequest } from 'next/server'
import { created, handleRouteError } from '@/lib/api-utils'
import { validateDto, submitCatalogRequestSchema } from '@/app/dto'
import { catalogRequestService } from '@/app/services/catalog-request.service'

/**
 * Rota pública (sem autenticação) — ADR-026, Fase 3. Recebe a solicitação de orçamento do catálogo
 * digital e cria automaticamente um Orçamento em `draft`, aguardando triagem — nunca aprovado/
 * precificado/convertido aqui.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = validateDto(submitCatalogRequestSchema, body)
    const result = await catalogRequestService.submit(data)
    return created(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao enviar solicitação de orçamento')
  }
}
