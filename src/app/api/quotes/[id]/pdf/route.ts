import { NextRequest } from 'next/server'
import { requireAuth, unauthorized, badRequest, notFound, pdfResponse } from '@/lib/api-utils'
import { pdfService } from '@/app/services/pdf.service'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const { searchParams } = new URL(req.url)
    const variant = searchParams.get('variant') === 'tecnico' ? 'tecnico' : 'comercial'

    const pdfBuffer = await pdfService.generateQuotePdf(id, variant)

    const quote = await db.quote.findUnique({
      where: { id },
      select: { number: true, clientName: true, client: { select: { corporateName: true, tradeName: true } } },
    })
    const clientName = quote?.clientName || quote?.client?.corporateName || quote?.client?.tradeName || ''
    return pdfResponse(pdfBuffer, quote?.number || id, clientName)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.message.includes('não encontrado')) return notFound(error.message)
    console.error('GET /api/quotes/[id]/pdf error:', error)
    return badRequest('Erro ao gerar PDF')
  }
}