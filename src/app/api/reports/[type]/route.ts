import { NextRequest } from 'next/server'
import { requireAuth, unauthorized, ok, badRequest } from '@/lib/api-utils'
import { getReportData } from '@/app/services/report.service'

type RouteContext = { params: Promise<{ type: string }> }

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(';'), ...rows.map((r) => headers.map((h) => escape(r[h])).join(';'))]
  return lines.join('\n')
}

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
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/reports/[type] error:', error)
    return badRequest('Erro ao gerar relatório')
  }
}
