import { NextRequest } from 'next/server'
import { requireAuth, unauthorized, badRequest } from '@/lib/api-utils'
import { pdfService } from '@/app/services/pdf.service'
import { getReportData } from '@/app/services/report.service'

type RouteContext = { params: Promise<{ type: string }> }

const REPORT_TITLES: Record<string, string> = {
  sales: 'RELATÓRIO DE VENDAS (ORÇAMENTOS)',
  production: 'RELATÓRIO DE PRODUÇÃO',
  purchases: 'RELATÓRIO DE COMPRAS',
  stock: 'RELATÓRIO DE ESTOQUE',
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { type } = await ctx.params
    if (!REPORT_TITLES[type]) return badRequest('Tipo de relatório inválido')

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const status = searchParams.get('status') || ''

    const result = await getReportData(type, from, to, status)
    if (!result) return badRequest('Tipo de relatório inválido')

    const summaryLines = Object.entries(result.summary || {}).map(([k, v]) => `${k}: ${v}`)
    const pdfBuffer = await pdfService.generateReportPdf(REPORT_TITLES[type], result.rows, summaryLines)

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="relatorio-${type}.pdf"`,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/reports/[type]/pdf error:', error)
    return badRequest('Erro ao gerar PDF do relatório')
  }
}
