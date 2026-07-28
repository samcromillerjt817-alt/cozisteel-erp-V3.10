import { NextRequest } from 'next/server'
import { created, handleRouteError } from '@/lib/api-utils'
import { validateDto, submitCatalogRequestSchema } from '@/app/dto'
import { catalogRequestService } from '@/app/services/catalog-request.service'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Rota pública (sem autenticação) — ADR-026, Fase 3. Recebe a solicitação de orçamento do catálogo
 * digital e cria automaticamente um Orçamento em `draft`, aguardando triagem — nunca aprovado/
 * precificado/convertido aqui. Limite de taxa restrito (ADR-026, Fase 5) — cada chamada cria
 * registros reais, diferente das rotas de navegação.
 */
export async function POST(req: NextRequest) {
  try {
    await rateLimit(req, { keyPrefix: 'public-catalog-requests-submit', points: 5, durationSeconds: 60 })
    const body = await req.json()
    const data = validateDto(submitCatalogRequestSchema, body)
    const result = await catalogRequestService.submit(data)
    return created(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao enviar solicitação de orçamento')
  }
}
