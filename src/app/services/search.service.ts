import { db } from '@/lib/db'
import { checkPermission } from '@/lib/api-utils'
import type { SessionUser } from '@/lib/api-utils'

// Busca global (Fase 11.5, Subetapa 11.5.5) — escopo inicial aprovado pelo usuário: 7 entidades
// principais (Clientes/Produtos/Materiais/Fornecedores/Orçamentos/Pedidos/Produção). Cresce depois
// (ADR-018 Decisão 6). Cada entidade só entra no resultado se o usuário tiver permissão de leitura no
// módulo RBAC correspondente — a busca nunca vaza dado que o usuário não veria navegando pelo menu.
// `pedidos` (Pedido de Venda) reaproveita a permissão de `orcamentos`, mesmo remapeamento manual já
// usado por `canAccess('pedidos')` no frontend (não existe módulo RBAC próprio para Pedidos de Venda).

export interface GlobalSearchResult {
  id: string
  type: 'client' | 'product' | 'material' | 'supplier' | 'quote' | 'salesOrder' | 'productionOrder'
  label: string
  sublabel?: string
  moduleKey: string
}

const RESULT_LIMIT_PER_TYPE = 5
const MIN_QUERY_LENGTH = 2

export const searchService = {
  async search(user: SessionUser, rawQuery: string): Promise<GlobalSearchResult[]> {
    const q = rawQuery.trim()
    if (q.length < MIN_QUERY_LENGTH) return []

    const tasks: Promise<GlobalSearchResult[]>[] = []

    if (checkPermission(user, 'clientes', 'read')) {
      tasks.push(
        db.client
          .findMany({
            where: { OR: [{ corporateName: { contains: q } }, { tradeName: { contains: q } }, { cpfCnpj: { contains: q } }, { contactName: { contains: q } }] },
            take: RESULT_LIMIT_PER_TYPE,
            select: { id: true, corporateName: true, tradeName: true, city: true },
          })
          .then((rows) => rows.map((r) => ({ id: r.id, type: 'client' as const, label: r.tradeName || r.corporateName, sublabel: r.city || undefined, moduleKey: 'clientes' })))
      )
    }

    if (checkPermission(user, 'produtos', 'read')) {
      tasks.push(
        db.product
          .findMany({
            where: { OR: [{ name: { contains: q } }, { internalCode: { contains: q } }, { sku: { contains: q } }, { description: { contains: q } }] },
            take: RESULT_LIMIT_PER_TYPE,
            select: { id: true, name: true, unit: true },
          })
          .then((rows) => rows.map((r) => ({ id: r.id, type: 'product' as const, label: r.name, sublabel: r.unit, moduleKey: 'produtos' })))
      )
    }

    if (checkPermission(user, 'materiais', 'read')) {
      tasks.push(
        db.material
          .findMany({
            where: { OR: [{ name: { contains: q } }, { internalCode: { contains: q } }, { description: { contains: q } }] },
            take: RESULT_LIMIT_PER_TYPE,
            select: { id: true, name: true, unit: true },
          })
          .then((rows) => rows.map((r) => ({ id: r.id, type: 'material' as const, label: r.name, sublabel: r.unit, moduleKey: 'materiais' })))
      )
    }

    if (checkPermission(user, 'fornecedores', 'read')) {
      tasks.push(
        db.supplier
          .findMany({
            where: { OR: [{ corporateName: { contains: q } }, { tradeName: { contains: q } }, { cpfCnpj: { contains: q } }, { contactName: { contains: q } }, { internalCode: { contains: q } }] },
            take: RESULT_LIMIT_PER_TYPE,
            select: { id: true, corporateName: true, tradeName: true, city: true },
          })
          .then((rows) => rows.map((r) => ({ id: r.id, type: 'supplier' as const, label: r.tradeName || r.corporateName, sublabel: r.city || undefined, moduleKey: 'fornecedores' })))
      )
    }

    if (checkPermission(user, 'orcamentos', 'read')) {
      tasks.push(
        db.quote
          .findMany({
            where: { OR: [{ number: { contains: q } }, { clientName: { contains: q } }, { clientCnpj: { contains: q } }] },
            take: RESULT_LIMIT_PER_TYPE,
            select: { id: true, number: true, clientName: true },
          })
          .then((rows) => rows.map((r) => ({ id: r.id, type: 'quote' as const, label: r.number, sublabel: r.clientName || undefined, moduleKey: 'orcamentos' })))
      )
      tasks.push(
        db.salesOrder
          .findMany({
            where: { OR: [{ number: { contains: q } }, { clientName: { contains: q } }] },
            take: RESULT_LIMIT_PER_TYPE,
            select: { id: true, number: true, clientName: true },
          })
          .then((rows) => rows.map((r) => ({ id: r.id, type: 'salesOrder' as const, label: r.number, sublabel: r.clientName || undefined, moduleKey: 'pedidos' })))
      )
    }

    if (checkPermission(user, 'producao', 'read')) {
      tasks.push(
        db.productionOrder
          .findMany({
            where: { OR: [{ number: { contains: q } }, { productName: { contains: q } }, { description: { contains: q } }] },
            take: RESULT_LIMIT_PER_TYPE,
            select: { id: true, number: true, productName: true },
          })
          .then((rows) => rows.map((r) => ({ id: r.id, type: 'productionOrder' as const, label: r.number, sublabel: r.productName || undefined, moduleKey: 'producao' })))
      )
    }

    return (await Promise.all(tasks)).flat()
  },
}
