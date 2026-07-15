import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'
import type { BomExplosionResult } from '@/app/services/bom-explosion.service'

const LIST_INCLUDE = {
  product: { select: { id: true, name: true, internalCode: true } },
  user: { select: { id: true, name: true } },
}
const DETAIL_INCLUDE = {
  product: { include: { materials: { include: { material: true } } } },
  user: { select: { id: true, name: true } },
  requisitions: { select: { id: true, number: true, status: true } },
}
const MUTATION_INCLUDE = {
  product: { select: { id: true, name: true, internalCode: true } },
  user: { select: { id: true, name: true } },
  salesOrder: { select: { id: true, number: true } },
}
const UPDATE_INCLUDE = {
  product: { select: { id: true, name: true, internalCode: true } },
  user: { select: { id: true, name: true } },
}

class ProductionOrderRepository extends BaseRepository<typeof db.productionOrder> {
  constructor() {
    super(db.productionOrder)
  }

  async findManyPaginated(where: Record<string, unknown>, skip: number, take: number) {
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, include: LIST_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
      this.delegate.count({ where }),
    ])
    return { data, total }
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  findByIdWithProductMaterials(id: string) {
    return this.delegate.findUnique({
      where: { id },
      include: { product: { include: { materials: { include: { material: true } } } } },
    })
  }

  /**
   * OPs abertas (Fase 6, ADR-007) — única fonte de demanda considerada pelo MRP.
   * `quantityCompleted` incluído desde a Fase 9 (ADR-011) — o motor de cálculo usa o saldo
   * restante (`quantity - quantityCompleted`), nunca a quantidade cheia.
   */
  findManyOpenForMrp() {
    return this.delegate.findMany({
      where: { status: { in: ['planned', 'in_progress', 'paused'] } },
      select: { id: true, number: true, productId: true, quantity: true, quantityCompleted: true, bomRevisionId: true, dueDate: true },
    })
  }

  createWithIncludes(data: Record<string, unknown>) {
     
    return this.delegate.create({ data: data as any, include: MUTATION_INCLUDE })
  }

  updateFields(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: UPDATE_INCLUDE })
  }

  /**
   * Único ponto de escrita de produção (Fase 9, ADR-011; reconciliação multinível, ADR-012) —
   * parcial ou total, tudo passa por aqui. Numa única transação: idempotência (se `clientRequestId`
   * já foi processado, devolve o resultado anterior sem reprocessar); consumo físico de um nível só
   * (via `lines`, já resolvidas pelo chamador a partir da `BomLine` congelada ou `ProductMaterial`
   * herdado); reconciliação de reserva em qualquer profundidade (via `releaseTargets`, já calculado
   * pelo chamador — `ReservationReconciliationService`, ADR-012 — nunca recalculado aqui dentro);
   * entrada proporcional do produto acabado; grava `quantityCompleted` e deriva `status:
   * "completed"` quando ele atinge `quantity`. `additionalFields` são mesclados na mesma escrita da
   * OP — usado quando `update()` completa a OP e edita outros campos (notes/priority/...) na mesma
   * chamada, preservando o comportamento atual.
   */
  async produceWithTx(
    order: { id: string; number: string; productId: string | null; quantity: number; quantityCompleted: number; status: string },
    lines: Array<{ lineType: string; materialId: string | null; componentProductId: string | null; quantity: number; scrapPct: number }>,
    releaseTargets: BomExplosionResult,
    quantityThisRound: number,
    userId: string,
    clientRequestId?: string,
    additionalFields?: Record<string, unknown>
  ) {
    return db.$transaction(async (tx) => {
      if (clientRequestId) {
        const existingExecution = await tx.productionOrderExecution.findUnique({
          where: { productionOrderId_clientRequestId: { productionOrderId: order.id, clientRequestId } },
        })
        if (existingExecution) {
          const currentOrder = await tx.productionOrder.findUnique({ where: { id: order.id }, include: UPDATE_INCLUDE })
          // `productBatch` não é re-consultado aqui (replay idempotente) — ProductBatch não tem FK
          // direta pra ProductionOrderExecution/clientRequestId por decisão deliberada da Subetapa 1
          // (ADR-013, não acoplar rastreabilidade de lote à mecânica de retry). O lote já foi criado
          // corretamente na chamada original; só o valor de retorno desta repetição não o reaponta.
          return { order: currentOrder, isComplete: currentOrder?.status === 'completed', alreadyProcessed: true, productBatch: null }
        }
      }

      // Relê quantityCompleted/status de dentro da transação (SQLite serializa escritores via
      // BEGIN IMMEDIATE) — fecha a janela entre o Service ler o estado e esta transação escrever,
      // caso duas chamadas de produce() para a mesma OP cheguem quase simultâneas (Fase 9, ADR-011,
      // achado da validação arquitetural antes da Subetapa 2).
      const freshOrder = await tx.productionOrder.findUniqueOrThrow({ where: { id: order.id } })
      const freshOutstanding = order.quantity - freshOrder.quantityCompleted
      if (quantityThisRound > freshOutstanding) {
        throw new Error(`Quantidade produzida (${quantityThisRound}) excede o saldo restante da OP (${freshOutstanding})`)
      }

      // ── Consumo físico (um nível, ADR-011) — nada aqui muda em relação à Subetapa 1: só baixa o
      // que a própria OP consome diretamente, nunca reabre as matérias-primas de um subconjunto. ──
      // Fase 10, Subetapa 3 (ADR-013): junto do consumo físico, seleciona por FIFO o(s) lote(s) de
      // origem quando o item consumido for `lotControlled` — a granularidade é a MESMA deste laço
      // (um nível), não a de `releaseTargets` (que é sobre liberação de reserva, multinível): "esta
      // OP consumiu 1 unidade de Estrutura" vira 1 `BatchConsumption` apontando pro lote de Estrutura
      // consumido, e a rastreabilidade mais funda (o que aquele lote de Estrutura consumiu) já está
      // gravada em SEUS PRÓPRIOS `BatchConsumption`, de quando ele foi produzido — sem nova travessia.
      const batchConsumptions: Array<{ itemType: 'material' | 'product'; materialBatchId?: string; consumedProductBatchId?: string; quantityConsumed: number }> = []

      for (const line of lines) {
        // line.quantity é "por 1 unidade do produto pai" (schema) — consumo desta rodada é direto,
        // sem dividir por order.quantity (mesma fórmula que completeAndConsumeStock já usava, só
        // trocando a quantidade total pela quantidade desta rodada).
        const consumedQty = line.quantity * quantityThisRound * (1 + line.scrapPct / 100)
        if (consumedQty <= 0) continue

        const itemType = line.lineType === 'material' ? 'material' : 'product'
        const itemId = (itemType === 'material' ? line.materialId : line.componentProductId) as string

        const updatedItem =
          itemType === 'material'
            ? await tx.material.update({ where: { id: itemId }, data: { stockQty: { decrement: consumedQty } } })
            : await tx.product.update({ where: { id: itemId }, data: { stockQty: { decrement: consumedQty } } })

        await tx.stockMovement.create({
          data: {
            itemType,
            materialId: itemType === 'material' ? itemId : null,
            productId: itemType === 'product' ? itemId : null,
            type: 'OUT',
            quantity: consumedQty,
            balanceAfter: updatedItem.stockQty,
            reason: `Consumo na OP ${order.number}`,
            referenceType: 'production_order',
            referenceId: order.id,
            userId,
          },
        })

        if (!updatedItem.lotControlled) continue

        let remaining = consumedQty
        if (itemType === 'material') {
          // FIFO por `receivedAt` (mesmo índice já usado na Subetapa 2) — `quantityAvailable` é
          // decrementado diretamente, mesmo padrão de `stockQty` acima.
          const batches = await tx.materialBatch.findMany({
            where: { materialId: itemId, quantityAvailable: { gt: 0 } },
            orderBy: { receivedAt: 'asc' },
          })
          for (const batch of batches) {
            if (remaining <= 0) break
            const take = Math.min(remaining, batch.quantityAvailable)
            await tx.materialBatch.update({ where: { id: batch.id }, data: { quantityAvailable: { decrement: take } } })
            batchConsumptions.push({ itemType: 'material', materialBatchId: batch.id, quantityConsumed: take })
            remaining -= take
          }
        } else {
          // `ProductBatch` não tem um campo `quantityAvailable` próprio (Subetapa 1) — disponível é
          // calculado ad-hoc (`quantityProduced` menos a soma do que já foi consumido dele via
          // `BatchConsumption`), FIFO por `producedAt`. Mesmo custo linear já aceito no ADR-013.
          const candidateBatches = await tx.productBatch.findMany({
            where: { productId: itemId },
            orderBy: { producedAt: 'asc' },
            include: { consumedAsComponentIn: { select: { quantityConsumed: true } } },
          })
          for (const batch of candidateBatches) {
            if (remaining <= 0) break
            const alreadyConsumed = batch.consumedAsComponentIn.reduce((sum, c) => sum + c.quantityConsumed, 0)
            const available = batch.quantityProduced - alreadyConsumed
            if (available <= 0) continue
            const take = Math.min(remaining, available)
            batchConsumptions.push({ itemType: 'product', consumedProductBatchId: batch.id, quantityConsumed: take })
            remaining -= take
          }
        }
        // Se `remaining > 0` aqui, os lotes registrados não cobrem o saldo consumido — mesma
        // característica pré-existente de `stockQty` (sem checagem de suficiência), não uma
        // regressão nova desta subetapa.
      }

      // ── Reconciliação de reserva (qualquer profundidade, ADR-012) — usa o mapa já calculado pelo
      // chamador (`releaseTargets`), nunca recalcula a explosão aqui dentro. Cada chave já vem
      // agregada (mesmo material/componente alcançado por mais de um caminho nesta rodada soma numa
      // única entrada — ver ReservationReconciliationService) — por isso cada reserva é lida e
      // atualizada exatamente uma vez por rodada, nunca mais. ──
      const releaseEntries: Array<{ itemType: 'material' | 'product'; itemId: string; consumedQty: number }> = [
        ...Array.from(releaseTargets.materialNeeds, ([itemId, consumedQty]) => ({ itemType: 'material' as const, itemId, consumedQty })),
        ...Array.from(releaseTargets.productNeeds, ([itemId, consumedQty]) => ({ itemType: 'product' as const, itemId, consumedQty })),
      ]

      for (const { itemType, itemId, consumedQty } of releaseEntries) {
        if (consumedQty <= 0) continue

        const reservation = await tx.materialReservation.findFirst({
          where: {
            productionOrderId: order.id,
            itemType,
            materialId: itemType === 'material' ? itemId : null,
            productId: itemType === 'product' ? itemId : null,
          },
        })
        if (!reservation) continue // nada reservado para este item nesta OP — nada a reconciliar

        // releaseQty pode ser 0 (nada mais reservado, ex.: a rodada consome direto do shortfall) —
        // mesmo assim o "necessário" cai pela quantidade consumida: essa fatia não é mais parte de
        // uma produção futura, foi gasta agora.
        const releaseQty = Math.min(consumedQty, reservation.quantityReserved)

        if (releaseQty > 0) {
          const updatedForRelease =
            itemType === 'material'
              ? await tx.material.update({ where: { id: itemId }, data: { reservedQty: { decrement: releaseQty } } })
              : await tx.product.update({ where: { id: itemId }, data: { reservedQty: { decrement: releaseQty } } })

          await tx.stockMovement.create({
            data: {
              itemType,
              materialId: itemType === 'material' ? itemId : null,
              productId: itemType === 'product' ? itemId : null,
              type: 'RELEASE',
              quantity: releaseQty,
              balanceAfter: updatedForRelease.stockQty - updatedForRelease.reservedQty,
              reason: `Consumo na produção da OP ${order.number}`,
              referenceType: 'production_order',
              referenceId: order.id,
              userId,
            },
          })
        }

        const newQuantityNeeded = Math.max(0, reservation.quantityNeeded - consumedQty)
        const newQuantityReserved = Math.max(0, reservation.quantityReserved - releaseQty)
        await tx.materialReservation.update({
          where: { id: reservation.id },
          data: {
            quantityNeeded: newQuantityNeeded,
            quantityReserved: newQuantityReserved,
            quantityShortfall: Math.max(0, newQuantityNeeded - newQuantityReserved),
            status: newQuantityNeeded === 0 ? 'consumed' : 'partial',
          },
        })
      }

      const newQuantityCompleted = freshOrder.quantityCompleted + quantityThisRound
      const isComplete = newQuantityCompleted >= order.quantity

      let createdProductBatch: { id: string; batchNumber: string } | null = null

      if (order.productId) {
        const updatedProduct = await tx.product.update({
          where: { id: order.productId },
          data: { stockQty: { increment: quantityThisRound } },
        })
        await tx.stockMovement.create({
          data: {
            itemType: 'product',
            productId: order.productId,
            type: 'IN',
            quantity: quantityThisRound,
            balanceAfter: updatedProduct.stockQty,
            reason: isComplete ? `Produção concluída — OP ${order.number}` : `Produção parcial — OP ${order.number}`,
            referenceType: 'production_order',
            referenceId: order.id,
            userId,
          },
        })

        // Fase 10, Subetapa 3 (ADR-013): um ProductBatch por rodada, só quando o produto acabado é
        // lotControlled — se não for, os lotes de origem já foram decrementados/consumidos acima
        // (rastreabilidade do lado da matéria-prima/subconjunto continua correta), só não existe um
        // lote de saída para ancorar `BatchConsumption`, então nenhuma dessas linhas é gravada.
        if (updatedProduct.lotControlled) {
          const roundSequence = (await tx.productBatch.count({ where: { productionOrderId: order.id } })) + 1
          createdProductBatch = await tx.productBatch.create({
            data: {
              productId: order.productId,
              productionOrderId: order.id,
              batchNumber: `${order.number}-${roundSequence}`,
              quantityProduced: quantityThisRound,
            },
          })

          if (batchConsumptions.length > 0) {
            await tx.batchConsumption.createMany({
              data: batchConsumptions.map((bc) => ({ productBatchId: createdProductBatch!.id, ...bc })),
            })
          }
        }
      }

      const updatedOrder = await tx.productionOrder.update({
        where: { id: order.id },
        data: {
          ...(additionalFields || {}),
          quantityCompleted: newQuantityCompleted,
          status: isComplete ? 'completed' : freshOrder.status,
        },
        include: UPDATE_INCLUDE,
      })

      if (clientRequestId) {
        await tx.productionOrderExecution.create({
          data: { productionOrderId: order.id, quantity: quantityThisRound, clientRequestId, userId },
        })
      }

      return { order: updatedOrder, isComplete, alreadyProcessed: false, productBatch: createdProductBatch }
    })
  }
}

export const productionOrderRepository = new ProductionOrderRepository()
