import { db } from '@/lib/db'

const MATERIAL_BATCH_INCLUDE = {
  material: { select: { id: true, name: true } },
  supplier: { select: { id: true, corporateName: true, tradeName: true } },
  purchaseOrder: { select: { id: true, number: true } },
}

const PRODUCT_BATCH_INCLUDE = {
  product: { select: { id: true, name: true } },
  productionOrder: { select: { id: true, number: true } },
}

/**
 * Fase 10, Subetapa 4 (ADR-013) — consultas de rastreabilidade, puramente de leitura. Cada método
 * aceita uma LISTA de ids (nunca um id por vez) para que o Service monte a árvore nível a nível com
 * uma query por nível, não uma por nó (evita N+1 por construção).
 */
class BatchTraceabilityRepository {
  findMaterialBatchById(id: string) {
    return db.materialBatch.findUnique({ where: { id }, include: MATERIAL_BATCH_INCLUDE })
  }

  findProductBatchById(id: string) {
    return db.productBatch.findUnique({ where: { id }, include: PRODUCT_BATCH_INCLUDE })
  }

  /** ADR-022 (Fase UX-3, achado #06) — primeiro ponto de entrada da UI de rastreabilidade: usuário
   * não sabe o id interno de um lote, só o número. `batchNumber` não é único no schema (nem por
   * material/produto), então a busca pode devolver mais de um resultado — a tela deixa o usuário
   * escolher qual rastrear. */
  searchByBatchNumber(query: string) {
    return Promise.all([
      db.materialBatch.findMany({
        where: { batchNumber: { contains: query } },
        include: MATERIAL_BATCH_INCLUDE,
        orderBy: { receivedAt: 'desc' },
        take: 20,
      }),
      db.productBatch.findMany({
        where: { batchNumber: { contains: query } },
        include: PRODUCT_BATCH_INCLUDE,
        orderBy: { producedAt: 'desc' },
        take: 20,
      }),
    ])
  }

  /** Forward, nível 1: quem consumiu diretamente estes `MaterialBatch`. */
  findConsumptionsOfMaterialBatches(materialBatchIds: string[]) {
    if (materialBatchIds.length === 0) return Promise.resolve([])
    return db.batchConsumption.findMany({
      where: { materialBatchId: { in: materialBatchIds } },
      include: { productBatch: { include: PRODUCT_BATCH_INCLUDE } },
      orderBy: [{ materialBatchId: 'asc' }, { id: 'asc' }],
    })
  }

  /** Forward, níveis 2+: quem consumiu estes `ProductBatch` (quando eles mesmos são subconjuntos). */
  findConsumptionsAsComponent(productBatchIds: string[]) {
    if (productBatchIds.length === 0) return Promise.resolve([])
    return db.batchConsumption.findMany({
      where: { consumedProductBatchId: { in: productBatchIds } },
      include: { productBatch: { include: PRODUCT_BATCH_INCLUDE } },
      orderBy: [{ consumedProductBatchId: 'asc' }, { id: 'asc' }],
    })
  }

  /** Backward, qualquer nível: tudo o que estes `ProductBatch` consumiram (material direto E/OU subconjunto). */
  findConsumptionsByProductBatches(productBatchIds: string[]) {
    if (productBatchIds.length === 0) return Promise.resolve([])
    return db.batchConsumption.findMany({
      where: { productBatchId: { in: productBatchIds } },
      include: {
        materialBatch: { include: MATERIAL_BATCH_INCLUDE },
        consumedProductBatch: { include: PRODUCT_BATCH_INCLUDE },
      },
      orderBy: [{ productBatchId: 'asc' }, { id: 'asc' }],
    })
  }
}

export const batchTraceabilityRepository = new BatchTraceabilityRepository()
