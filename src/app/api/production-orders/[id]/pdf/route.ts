import { NextRequest } from 'next/server'
import { requireAuth, unauthorized, badRequest, notFound } from '@/lib/api-utils'
import { pdfService } from '@/app/services/pdf.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const pdfBuffer = await pdfService.generateProductionOrderPdf(id)

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="op-${id}.pdf"`,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.message.includes('não encontrada')) return notFound(error.message)
    console.error('GET /api/production-orders/[id]/pdf error:', error)
    return badRequest('Erro ao gerar PDF')
  }
}
