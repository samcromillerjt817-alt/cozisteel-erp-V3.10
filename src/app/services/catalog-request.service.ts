import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { numberingService } from '@/app/services/numbering.service'
import { clientRepository } from '@/app/repositories/client.repository'
import { formatDate } from '@/lib/format'
import { BadRequestException } from '@/app/exceptions'
import type { SubmitCatalogRequestDto } from '@/app/dto'

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
}

export const catalogRequestService = new CatalogRequestService()
