import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { numberingService } from '@/app/services/numbering.service'
import { clientRepository } from '@/app/repositories/client.repository'
import { formatDate } from '@/lib/format'
import { BadRequestException, NotFoundException } from '@/app/exceptions'
import type { SubmitCatalogRequestDto } from '@/app/dto'

export interface ListCatalogRequestsInput {
  status?: string
  page: number
  limit: number
}

const LIST_INCLUDE = {
  quote: { select: { id: true, number: true, status: true, internalStage: true, userId: true, user: { select: { id: true, name: true } } } },
  _count: { select: { items: true } },
}

const DETAIL_INCLUDE = {
  quote: { select: { id: true, number: true, status: true, internalStage: true, userId: true, user: { select: { id: true, name: true } } } },
  client: { select: { id: true, corporateName: true, tradeName: true } },
  items: { include: { product: { select: { id: true, name: true, internalCode: true } } } },
}

const SYSTEM_USER_USERNAME = 'catalogo-digital'

interface ProductSnapshot {
  id: string
  internalCode: string
  name: string
  unit: string
  width: number
  height: number
  length: number
}

/**
 * Submissão do Catálogo Digital Público (ADR-026, Fase 3). A solicitação é registrada como um
 * retrato fiel do que o cliente pediu (`CatalogRequest`/`CatalogRequestItem`, nunca alterados
 * depois), e um Orçamento normal é criado no mesmo instante — mesmo motor/regras de negócio de
 * qualquer outro Orçamento, sem lógica paralela. Nasce sempre em `draft`, nunca aprovado/
 * precificado/convertido automaticamente (ADR-026, Parte 6).
 */
class CatalogRequestService {
  /**
   * Ator técnico usado como `Quote.userId` (campo obrigatório) quando não existe nenhum usuário
   * interno envolvido na criação — `active: false` bloqueia login estruturalmente (mesma checagem
   * de `src/lib/auth.ts`), então esta conta nunca pode ser usada pra autenticar de verdade.
   */
  private async getOrCreateSystemUser() {
    const existing = await db.user.findUnique({ where: { username: SYSTEM_USER_USERNAME } })
    if (existing) return existing
    const password = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 4)
    return db.user.create({
      data: { username: SYSTEM_USER_USERNAME, name: 'Catálogo Digital (sistema)', password, role: 'comercial', active: false },
    })
  }

  /**
   * Nunca revela ao chamador se encontrou ou não (ADR-026, Parte 8) — quem decide o que fazer com
   * o resultado é sempre o código interno, nunca a resposta pública.
   */
  private async findMatchingClient(cpfCnpj: string, email: string) {
    if (cpfCnpj) {
      const byDoc = await clientRepository.findByCpfCnpj(cpfCnpj)
      if (byDoc) return byDoc
    }
    if (email) {
      const byEmail = await db.client.findFirst({ where: { email } })
      if (byEmail) return byEmail
    }
    return null
  }

  private buildItemPersonalizationNotes(item: SubmitCatalogRequestDto['items'][number], isCustomized: boolean): string {
    const parts: string[] = []
    if (isCustomized) parts.push('PERSONALIZADO — revisar viabilidade técnica, custo e prazo')
    if (item.material) parts.push(`Material: ${item.material}`)
    if (item.finish) parts.push(`Acabamento: ${item.finish}`)
    if (item.voltage) parts.push(`Voltagem: ${item.voltage}`)
    if (item.operationSide) parts.push(`Lado de operação: ${item.operationSide}`)
    if (item.accessories) parts.push(`Acessórios: ${item.accessories}`)
    if (item.modifications) parts.push(`Modificações: ${item.modifications}`)
    if (item.notes) parts.push(`Obs. do cliente: ${item.notes}`)
    return parts.join(' | ')
  }

  async submit(input: SubmitCatalogRequestDto): Promise<{ protocol: string }> {
    // Idempotência (ADR-026, Parte 8) — reenvio da mesma chave devolve o protocolo já emitido, nunca duplica.
    const existing = await db.catalogRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return { protocol: existing.protocol }

    // Nunca confia em productId vindo de fora — revalida contra o catálogo público de verdade.
    const productIds = [...new Set(input.items.map((i) => i.productId))]
    const products = await db.product.findMany({
      where: { id: { in: productIds }, showInCatalog: true, active: true },
      select: { id: true, internalCode: true, name: true, unit: true, width: true, height: true, length: true },
    })
    const productMap = new Map<string, ProductSnapshot>(products.map((p) => [p.id, p]))
    if (productMap.size !== productIds.length) {
      throw new BadRequestException('Um ou mais produtos da solicitação não estão mais disponíveis no catálogo')
    }

    const client = await this.findMatchingClient(input.clientCpfCnpj, input.clientEmail)
    const systemUser = await this.getOrCreateSystemUser()
    const protocol = await numberingService.getNextNumber('solicitacao_catalogo')
    const quoteNumber = await numberingService.getNextNumber('orcamento')

    // Pré-computado UMA vez, na ordem exata do carrinho — evita reparear por productId depois (o
    // mesmo produto pode aparecer 2x no carrinho com personalizações diferentes, ex.: 2 cores).
    const enrichedItems = input.items.map((item) => {
      const product = productMap.get(item.productId) as ProductSnapshot
      const isCustomized = Boolean(
        (item.width !== undefined && item.width !== product.width) ||
        (item.height !== undefined && item.height !== product.height) ||
        (item.length !== undefined && item.length !== product.length) ||
        item.material || item.finish || item.voltage || item.operationSide || item.modifications
      )
      return { item, product, isCustomized, notes: this.buildItemPersonalizationNotes(item, isCustomized) }
    })

    const result = await db.$transaction(async (tx) => {
      const catalogRequest = await tx.catalogRequest.create({
        data: {
          protocol,
          idempotencyKey: input.idempotencyKey,
          clientId: client?.id ?? null,
          clientName: input.clientName,
          clientCpfCnpj: input.clientCpfCnpj,
          clientContact: input.clientContact,
          clientEmail: input.clientEmail,
          clientPhone: input.clientPhone,
          clientCity: input.clientCity,
          clientState: input.clientState,
          clientCompany: input.clientCompany,
          generalNotes: input.generalNotes,
          items: {
            create: enrichedItems.map(({ item, isCustomized }) => ({
              productId: item.productId,
              quantity: item.quantity,
              width: item.width ?? null,
              height: item.height ?? null,
              length: item.length ?? null,
              material: item.material,
              finish: item.finish,
              voltage: item.voltage,
              operationSide: item.operationSide,
              accessories: item.accessories,
              modifications: item.modifications,
              notes: item.notes,
              isCustomized,
            })),
          },
        },
      })

      const quote = await tx.quote.create({
        data: {
          number: quoteNumber,
          date: formatDate(new Date()),
          status: 'draft',
          origin: 'catalogo_digital',
          internalStage: 'aguardando_triagem',
          clientId: client?.id ?? null,
          clientName: input.clientName,
          clientCnpj: input.clientCpfCnpj,
          clientContact: input.clientContact,
          clientEmail: input.clientEmail,
          clientPhone: input.clientPhone,
          notes: input.generalNotes,
          userId: systemUser.id,
          items: {
            create: enrichedItems.map(({ item, product, notes }, order) => ({
              productId: item.productId,
              code: product.internalCode,
              description: product.name,
              quantity: item.quantity,
              unit: product.unit,
              unitPrice: 0,
              total: 0,
              width: item.width ?? product.width,
              height: item.height ?? product.height,
              length: item.length ?? product.length,
              order,
              notes,
            })),
          },
        },
      })

      await tx.catalogRequest.update({ where: { id: catalogRequest.id }, data: { status: 'convertida', quoteId: quote.id } })

      return { protocol: catalogRequest.protocol }
    })

    return result
  }

  /** Fila de triagem (ADR-026, Fase 4) — lista as solicitações recebidas, com o Orçamento gerado já
   *  incluído (mesmo padrão de "vínculo direto com a tela de Orçamento", sem duplicar edição). */
  async list({ status, page, limit }: ListCatalogRequestsInput) {
    const where: Record<string, unknown> = {}
    if (status) where.status = status

    const [data, total] = await Promise.all([
      db.catalogRequest.findMany({ where, include: LIST_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      db.catalogRequest.count({ where }),
    ])
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getById(id: string) {
    const catalogRequest = await db.catalogRequest.findUnique({ where: { id }, include: DETAIL_INCLUDE })
    if (!catalogRequest) throw new NotFoundException('Solicitação não encontrada')
    return catalogRequest
  }

  /** Só quem pode ser responsável por um Orçamento (admin/manager/comercial, ativos) — endpoint
   *  próprio e mínimo em vez de abrir `/api/users` (admin/manager-only) pra quem faz triagem. */
  async listAssignableUsers() {
    return db.user.findMany({
      where: { role: { in: ['admin', 'manager', 'comercial'] }, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  }

  /** Arquivar a solicitação NUNCA altera o Orçamento já gerado (ADR-026, Parte 14) — ele continua
   *  existindo e seguindo seu próprio ciclo normalmente, só o registro de intake é marcado. */
  async archive(id: string, reason: string) {
    const catalogRequest = await db.catalogRequest.findUnique({ where: { id } })
    if (!catalogRequest) throw new NotFoundException('Solicitação não encontrada')

    return db.catalogRequest.update({ where: { id }, data: { status: 'arquivada', archivedReason: reason } })
  }
}

export const catalogRequestService = new CatalogRequestService()
