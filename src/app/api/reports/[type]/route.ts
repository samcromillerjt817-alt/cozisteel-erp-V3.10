import { NextRequest } from 'next/server'
import { requireAuth, ok, badRequest, handleRouteError } from '@/lib/api-utils'
import { getReportData, toCsv } from '@/app/services/report.service'

type RouteContext = { params: Promise<{ type: string }> }

/**
 * GET /api/reports/[type]?from=dd/mm/aaaa&to=dd/mm/aaaa&status=&format=json|csv
 * type: sales | production | stock | purchases
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { type } = await ctx.params
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const status = searchParams.get('status') || ''
    const format = searchParams.get('format') || 'json'

    const result = await getReportData(type, from, to, status)
    if (!result) return badRequest('Tipo de relatório inválido. Use: sales, production, purchases ou stock')

    if (format === 'csv') {
      const csv = toCsv(result.rows)
      return new Response('\uFEFF' + csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="relatorio-${type}.csv"`,
        },
      })
    }

    return ok({ type, summary: result.summary, rows: result.rows })
  } catch (error) {
    return handleRouteError(error, 'Erro ao gerar relatório')
  }
}
