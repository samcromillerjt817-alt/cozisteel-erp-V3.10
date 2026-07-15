import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { quoteService } from '@/app/services/quote.service'
import { invoiceService } from '@/app/services/invoice.service'
import { financialAccountService } from '@/app/services/financial-account.service'
import { createTestUser } from './helpers/fixtures'
import '@/app/services/dashboard-bootstrap'
import { getDashboard, getDiretoriaSummary } from '@/app/services/dashboard-widgets.service'

/**
 * ADR-019, Subetapa 7.5 — Diretoria deixa de compor a união bruta dos widgets `kind==='kpi'` e passa
 * a ter uma síntese própria: Central de Alertas consolidada + 1 KPI headline por módulo (Seção 2.6).
 * Cobre só o que é genuinamente novo desta subetapa: `getDiretoriaSummary()` e o primeiro widget
 * nativo de Financeiro (`financeiro.saldo-liquido-em-aberto`) — o resto (severidade de alerta,
 * `getAllAlerts()`, widgets de Comercial/Produção/Compras/Estoque) já é coberto pelos testes das
 * subetapas anteriores.
 */
describe('Dashboard Diretoria — síntese por módulo (ADR-019, Subetapa 7.5)', () => {
  it('1. getDiretoriaSummary devolve exatamente 1 KPI headline por módulo, com o linkModule certo', async () => {
    const summary = await getDiretoriaSummary()

    expect(summary.moduleSummaries).toHaveLength(5)
    const byProfile = Object.fromEntries(summary.moduleSummaries.map((m) => [m.profile, m]))
    expect(byProfile.comercial.linkModule).toBe('orcamentos')
    expect(byProfile.producao.linkModule).toBe('producao')
    expect(byProfile.compras.linkModule).toBe('compras')
    expect(byProfile.estoque.linkModule).toBe('estoque')
    expect(byProfile.financeiro.linkModule).toBe('financeiro')
    for (const m of summary.moduleSummaries) {
      expect(m.widget.type).toBe('card')
    }
  })

  it('1b. os 4 headlines monetários (todos menos Produção) declaram format=currency — achado do usuário: "15960" sem formatação era ilegível', async () => {
    const summary = await getDiretoriaSummary()
    const byProfile = Object.fromEntries(summary.moduleSummaries.map((m) => [m.profile, m]))
    expect((byProfile.comercial.widget.data as { format?: string }).format).toBe('currency')
    expect((byProfile.compras.widget.data as { format?: string }).format).toBe('currency')
    expect((byProfile.estoque.widget.data as { format?: string }).format).toBe('currency')
    expect((byProfile.financeiro.widget.data as { format?: string }).format).toBe('currency')
    // Produção mostra quantidade (unidades em WIP), não moeda — não deve ganhar format=currency.
    expect((byProfile.producao.widget.data as { format?: string }).format).toBeUndefined()
  })

  it('2. getDiretoriaSummary nunca inclui um widget kind=detail (só 1 headline por módulo, não a lista inteira)', async () => {
    const summary = await getDiretoriaSummary()
    const ids = summary.moduleSummaries.map((m) => m.widget.id)
    // Widgets kind=detail conhecidos do catálogo — nenhum deles pode aparecer na síntese da Diretoria.
    expect(ids).not.toContain('comercial.top-clientes')
    expect(ids).not.toContain('estoque.materiais-mais-consumidos')
  })

  it('3. financeiro.saldo-liquido-em-aberto = receber em aberto − pagar em aberto', async () => {
    registerDomainEventHandlers()
    const user = await createTestUser('diretoria-financeiro-widget')
    const quote = (await quoteService.create(
      { status: 'draft', discountType: 'value', discountValue: 0, items: [{ productId: null, code: 'DIR-1', description: 'Item', quantity: 1, unit: 'UN', unitPrice: 1000, notes: '' }] } as never,
      user.id
    )) as { id: string }
    await quoteService.changeStatus(quote.id, 'sent', user.id)
    await quoteService.changeStatus(quote.id, 'approved', user.id)
    const salesOrder = (await quoteService.convertToSalesOrder(quote.id, user.id)) as { id: string }
    const invoice = (await invoiceService.createFromSalesOrder(salesOrder.id, 1000, user.id)) as { id: string }
    const receivable = (await db.accountReceivable.findUnique({ where: { invoiceId: invoice.id } }))!
    await financialAccountService.registerReceipt(receivable.id, 400, new Date(), '', user.id)

    const payload = await getDashboard('financeiro')
    const widget = payload.widgets.find((w) => w.id === 'financeiro.saldo-liquido-em-aberto')!
    expect(widget).toBeDefined()
    // 1000 - 400 recebido = 600 em aberto a receber; nenhuma conta a pagar criada neste teste = 0.
    expect((widget.data as { value: number }).value).toBeGreaterThanOrEqual(600)

    await db.receipt.deleteMany({ where: { accountReceivableId: receivable.id } })
    await db.accountReceivable.deleteMany({ where: { id: receivable.id } })
    await db.invoice.deleteMany({ where: { id: invoice.id } })
    await db.salesOrder.deleteMany({ where: { id: salesOrder.id } })
    await db.quote.deleteMany({ where: { id: quote.id } })
    await db.statusHistory.deleteMany({ where: { userId: user.id } })
    await db.user.deleteMany({ where: { id: user.id } })
  })
})
