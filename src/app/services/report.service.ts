import { db } from '@/lib/db'

/** Converte uma data no formato dd/mm/aaaa (usado no app) para um Date comparável */
function parseBrDate(d: string): Date | null {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

export interface ReportResult {
  rows: Record<string, unknown>[]
  summary: Record<string, unknown>
}

export async function getReportData(type: string, from: string, to: string, status: string): Promise<ReportResult | null> {
  const fromDate = from ? parseBrDate(from) : null
  const toDate = to ? parseBrDate(to) : null
  const inRange = (dateStr: string) => {
    if (!fromDate && !toDate) return true
    const d = parseBrDate(dateStr)
    if (!d) return true
    if (fromDate && d < fromDate) return false
    if (toDate && d > toDate) return false
    return true
  }

  if (type === 'sales') {
    const quotes = await db.quote.findMany({
      where: status ? { status } : undefined,
      include: { client: { select: { corporateName: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const filtered = quotes.filter((q) => inRange(q.date))
    const rows = filtered.map((q) => ({
      Numero: q.number, Cliente: q.clientName || q.client?.corporateName || '-', Data: q.date,
      Status: q.status, Subtotal: q.subtotal, Desconto: q.discountTotal, Total: q.total,
    }))
    return {
      rows,
      summary: {
        totalQuotes: filtered.length,
        totalValue: filtered.reduce((s, q) => s + q.total, 0),
        approvedValue: filtered.filter((q) => q.status === 'approved').reduce((s, q) => s + q.total, 0),
      },
    }
  }

  if (type === 'production') {
    const orders = await db.productionOrder.findMany({
      where: status ? { status } : undefined,
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const filtered = orders.filter((o) => inRange(o.date))
    const rows = filtered.map((o) => ({
      Numero: o.number, Produto: o.productName || o.product?.name || '-', Data: o.date,
      Quantidade: o.quantity, Unidade: o.unit, Status: o.status, Prioridade: o.priority,
    }))
    return {
      rows,
      summary: {
        totalOrders: filtered.length,
        completed: filtered.filter((o) => o.status === 'completed').length,
        inProgress: filtered.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length,
      },
    }
  }

  if (type === 'purchases') {
    const requisitions = await db.requisition.findMany({
      where: status ? { status } : undefined,
      include: { items: { include: { material: true, supplier: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const filtered = requisitions.filter((r) => inRange(r.date))
    const rows = filtered.flatMap((r) =>
      r.items.map((i) => ({
        Requisicao: r.number, Data: r.date, Status: r.status, Material: i.material.name,
        Fornecedor: i.supplier?.corporateName || i.supplier?.tradeName || 'A definir',
        Quantidade: i.quantity, Unidade: i.unit, PrecoEstimado: i.estimatedPrice, Total: i.estimatedPrice * i.quantity,
      }))
    )
    return {
      rows,
      summary: {
        totalRequisitions: filtered.length,
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
