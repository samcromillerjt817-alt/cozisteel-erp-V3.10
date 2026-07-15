import { NextRequest } from 'next/server'
import { requireAuth, badRequest, handleRouteError } from '@/lib/api-utils'
import { pdfService } from '@/app/services/pdf.service'
import { getReportData, getSummaryLines, REPORT_TITLES } from '@/app/services/report.service'

type RouteContext = { params: Promise<{ type: string }> }

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

    const summaryLines = getSummaryLines(result.summary)
    const pdfBuffer = await pdfService.generateReportPdf(REPORT_TITLES[type], result.rows, summaryLines)

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="relatorio-${type}.pdf"`,
      },
    })
  } catch (error) {
    return handleRouteError(error, 'Erro ao gerar PDF do relatório')
  }
}
