import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { REPORT_SUMMARY_LABELS, REPORT_SUMMARY_MONEY_KEYS } from '@/lib/report-labels'
import { formatCurrency } from '@/lib/format'

export const REPORT_TITLES: Record<string, string> = {
  sales: 'RELATÓRIO DE VENDAS (ORÇAMENTOS)',
  production: 'RELATÓRIO DE PRODUÇÃO',
  purchases: 'RELATÓRIO DE REQUISIÇÕES DE COMPRA',
  stock: 'RELATÓRIO DE ESTOQUE',
}

/** Serializa linhas de relatório em CSV (separador ";", célula entre aspas quando necessário). */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(';'), ...rows.map((r) => headers.map((h) => escape(r[h])).join(';'))]
  return lines.join('\n')
}

/** Formata o resumo de um relatório como linhas "rótulo: valor", usado no PDF — mesmos rótulos e
 * mesma formatação numérica (pt-BR, R$ só para chaves monetárias) da tela (`RelatoriosPage`). */
export function getSummaryLines(summary: Record<string, unknown>): string[] {
  return Object.entries(summary || {}).map(([k, v]) => {
    const label = REPORT_SUMMARY_LABELS[k] || k
    const formatted = typeof v === 'number'
      ? (REPORT_SUMMARY_MONEY_KEYS.has(k) ? formatCurrency(v) : v.toLocaleString('pt-BR'))
      : String(v)
    return `${label}: ${formatted}`
  })
}

/** Converte uma data no formato dd/mm/aaaa (usado no app) para um Date comparável */
function parseBrDate(d: string): Date | null {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

/** aaaammdd — mesma ordem de dígitos do dd/mm/aaaa reorganizada, só pra comparação lexicográfica
 * segura (nunca exibido, nunca gravado). */
function isoCompact(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/**
 * ADR-022 (Fase UX-7, achado #13) — filtro de período movido pra query: `date` é `String` no schema
 * (dd/mm/aaaa, nunca `DateTime`), então comparar `>=`/`<=` direto na string original dá ordem errada
 * (ex.: "01/12/2026" < "15/01/2026" por ordem lexicográfica, mas 15/01 vem antes na realidade). A saída
 * SQL reordena os dígitos pra aaaammdd via `substr()` antes de comparar — a mesma transformação de
 * `isoCompact`, só do lado do banco. `table`/`column` nunca vêm de entrada do usuário (só os 3
 * literais chamados abaixo), e os limites de data são parâmetros ligados (`Prisma.sql`), não
 * concatenação de string — não há superfície de SQL injection aqui.
 */
function dateRangeSql(table: string, fromDate: Date | null, toDate: Date | null): Prisma.Sql {
  const col = Prisma.raw(`(substr("${table}"."date",7,4) || substr("${table}"."date",4,2) || substr("${table}"."date",1,2))`)
  if (fromDate && toDate) return Prisma.sql`${col} BETWEEN ${isoCompact(fromDate)} AND ${isoCompact(toDate)}`
  if (fromDate) return Prisma.sql`${col} >= ${isoCompact(fromDate)}`
  if (toDate) return Prisma.sql`${col} <= ${isoCompact(toDate)}`
  return Prisma.sql`1=1`
}

export interface ReportResult {
  rows: Record<string, unknown>[]
  summary: Record<string, unknown>
}

export async function getReportData(type: string, from: string, to: string, status: string): Promise<ReportResult | null> {
  const fromDate = from ? parseBrDate(from) : null
  const toDate = to ? parseBrDate(to) : null

  if (type === 'sales') {
    const statusSql = status ? Prisma.sql`AND "status" = ${status}` : Prisma.empty
    const matched = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "Quote" WHERE ${dateRangeSql('Quote', fromDate, toDate)} ${statusSql}`
    )
    const quotes = await db.quote.findMany({
      where: { id: { in: matched.map((m) => m.id) } },
      include: { client: { select: { corporateName: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const rows = quotes.map((q) => ({
      Numero: q.number, Cliente: q.clientName || q.client?.corporateName || '-', Data: q.date,
      Status: q.status, Subtotal: q.subtotal, Desconto: q.discountTotal, Total: q.total,
    }))
    return {
      rows,
      summary: {
        totalQuotes: quotes.length,
        totalValue: quotes.reduce((s, q) => s + q.total, 0),
        approvedValue: quotes.filter((q) => q.status === 'approved').reduce((s, q) => s + q.total, 0),
      },
    }
  }

  if (type === 'production') {
    const statusSql = status ? Prisma.sql`AND "status" = ${status}` : Prisma.empty
    const matched = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "ProductionOrder" WHERE ${dateRangeSql('ProductionOrder', fromDate, toDate)} ${statusSql}`
    )
    const orders = await db.productionOrder.findMany({
      where: { id: { in: matched.map((m) => m.id) } },
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const rows = orders.map((o) => ({
      Numero: o.number, Produto: o.productName || o.product?.name || '-', Data: o.date,
      Quantidade: o.quantity, Unidade: o.unit, Status: o.status, Prioridade: o.priority,
    }))
    return {
      rows,
      summary: {
        totalOrders: orders.length,
        completed: orders.filter((o) => o.status === 'completed').length,
        inProgress: orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length,
      },
    }
  }

  if (type === 'purchases') {
    const statusSql = status ? Prisma.sql`AND "status" = ${status}` : Prisma.empty
    const matched = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "Requisition" WHERE ${dateRangeSql('Requisition', fromDate, toDate)} ${statusSql}`
    )
    const requisitions = await db.requisition.findMany({
      where: { id: { in: matched.map((m) => m.id) } },
      include: { items: { include: { material: true, supplier: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const rows = requisitions.flatMap((r) =>
      r.items.map((i) => ({
        Requisicao: r.number, Data: r.date, Status: r.status, Material: i.material.name,
        Fornecedor: i.supplier?.corporateName || i.supplier?.tradeName || 'A definir',
        Quantidade: i.quantity, Unidade: i.unit, PrecoEstimado: i.estimatedPrice, Total: i.estimatedPrice * i.quantity,
      }))
    )
    return {
      rows,
      summary: {
        totalRequisitions: requisitions.length,
        totalEstimated: rows.reduce((s, r: any) => s + (r.Total || 0), 0),
      },
    }
  }

  if (type === 'stock') {
    const [materials, products] = await Promise.all([
      db.material.findMany({ orderBy: { name: 'asc' } }),
      db.product.findMany({ orderBy: { name: 'asc' } }),
    ])
    const rows = [
      ...materials.map((m) => ({ Tipo: 'Materia-prima', Item: m.name, Codigo: m.internalCode, Estoque: m.stockQty, Minimo: m.minStockQty, Unidade: m.unit, Custo: m.costPrice })),
      ...products.map((p) => ({ Tipo: 'Produto', Item: p.name, Codigo: p.internalCode, Estoque: p.stockQty, Minimo: p.minStockQty, Unidade: p.unit || 'UN', Custo: p.costPrice })),
    ]
    return {
      rows,
      summary: {
        totalItems: rows.length,
        lowStockItems: rows.filter((r: any) => r.Estoque <= r.Minimo).length,
      },
    }
  }

  return null
}
