import { config } from 'dotenv'

// Carrega .env.test ANTES de qualquer teste importar `@/lib/db` (que lê
// DATABASE_URL na hora em que o módulo é avaliado) — garante que os testes
// nunca tocam o banco de desenvolvimento/produção.
config({ path: '.env.test', override: true })

const { db } = await import('@/lib/db')

// Achado durante a Fase 3.1: NumberingService.getNextNumber() cria a linha de NumberSequence
// com nextNumber=1 na primeira chamada de um documentType, mas nunca incrementa nesse ramo —
// a primeira e a segunda chamada retornam o MESMO número. Isso nunca aparece no banco real
// (as sequências já existem desde antes), só num banco de teste 100% novo. Pré-semeando as
// sequências usadas nos testes evita depender desse bug pré-existente (catalogado, não
// corrigido nesta fase — fora do escopo de Eventos de Domínio).
const SEQUENCE_TYPES = ['orcamento', 'pedido', 'op', 'requisicao', 'compra', 'mrp']
for (const documentType of SEQUENCE_TYPES) {
  await db.numberSequence.upsert({
    where: { documentType },
    update: {},
    create: { documentType, nextNumber: 1 },
  })
}
