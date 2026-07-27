import { NextRequest } from 'next/server'
import { requireModulePermission, ok, created, handleRouteError } from '@/lib/api-utils'
import { validateDto, createInvoiceSchema } from '@/app/dto'
import { invoiceService } from '@/app/services/invoice.service'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * ADR-023 (Decisão #2, Faturamento) — GET devolve o saldo faturável por item (`balance`) junto com o
 * histórico de faturas do pedido, para a tela abrir já mostrando quantidade pedida/faturada/restante
 * sem uma segunda ida ao servidor. Leitura fica sob `orcamentos:read` (mesma permissão de quem já
 * pode ver o Pedido de Venda) — só emitir/cancelar exige `financeiro`.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('orcamentos', 'read')
    const { id } = await ctx.params
    const [balance, invoices] = await Promise.all([
      invoiceService.getInvoiceableBalance(id),
      invoiceService.list(id),
    ])
    return ok({ balance, invoices })
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar faturamento do pedido de venda')
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('financeiro', 'create')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(createInvoiceSchema, body)

    const invoice = await invoiceService.createFromSalesOrder(id, data.items, data.notes, user.id)
    return created(invoice)
  } catch (error) {
    return handleRouteError(error, 'Erro ao emitir fatura')
  }
}
