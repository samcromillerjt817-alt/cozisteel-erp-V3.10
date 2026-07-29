import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { storageService } from '@/app/services/storage.service'
import { productRepository } from '@/app/repositories/product.repository'
import { NotFoundException } from '@/app/exceptions'

/**
 * Auditoria de segurança (2ª rodada) — cobertura permanente pro que antes só tinha sido validado
 * manualmente contra produção (curl direto no Funnel). `resolveFile` nunca deveria deixar um
 * segmento de path escapar de `storage/` inteiro (o diretório real contém backups completos do
 * banco SQLite em `storage/patches/backups/`, entre outros dados sensíveis) — testes 1 e 2. A
 * segunda camada, isolar `storage/patches/backups/` (subdiretório legítimo de `storage/`, só não
 * deveria ser alcançável pela rota pública de produto) é a checagem de prefixo da própria rota
 * (`segments[0] === 'products'`, em `src/app/api/public/uploads/[...path]/route.ts`) — já
 * confirmada ao vivo contra produção real na 1ª rodada desta auditoria (404 em toda variante
 * testada), não replicada aqui por não haver um jeito de testar isso via o Service isoladamente
 * sem duplicar a lógica da rota. Produto oculto/removido do catálogo nunca deveria servir imagem
 * via a rota pública, mesmo sabendo o path exato do arquivo — testes 4 a 7.
 */
describe('Uploads públicos — path traversal e visibilidade (auditoria de segurança, 2ª rodada)', () => {
  const productIds: string[] = []

  afterAll(async () => {
    await db.product.deleteMany({ where: { id: { in: productIds } } })
  })

  it('1. resolveFile rejeita traversal simples (../../../.env)', async () => {
    await expect(storageService.resolveFile(['products', 'x', '..', '..', '..', '.env'])).rejects.toThrow(NotFoundException)
  })

  it('2. resolveFile rejeita traversal profundo até a raiz do sistema', async () => {
    await expect(
      storageService.resolveFile(['products', 'x', '..', '..', '..', '..', '..', '..', 'etc', 'passwd'])
    ).rejects.toThrow(NotFoundException)
  })

  it('3. resolveFile aceita um path normal dentro de products/ sem lançar por traversal (só falha por arquivo não existir)', async () => {
    // Não escreve arquivo de verdade — só confirma que o path é aceito (não rejeitado como
    // traversal) e falha depois por ENOENT, não por NotFoundException de segurança.
    try {
      await storageService.resolveFile(['products', 'produto-x', 'foto-que-nao-existe.jpg'])
      throw new Error('deveria ter lançado ENOENT')
    } catch (err) {
      expect(err).not.toBeInstanceOf(NotFoundException) // ENOENT do fs, não bloqueio de traversal
    }
  })

  it('4. isPubliclyVisible: produto com showInCatalog=false nunca é visível, mesmo active=true', async () => {
    const hidden = await db.product.create({ data: { name: `Upload Oculto ${Date.now()}`, showInCatalog: false, active: true } })
    productIds.push(hidden.id)
    expect(await productRepository.isPubliclyVisible(hidden.id)).toBe(false)
  })

  it('5. isPubliclyVisible: produto inativo (active=false) nunca é visível, mesmo showInCatalog=true', async () => {
    const inactive = await db.product.create({ data: { name: `Upload Inativo ${Date.now()}`, showInCatalog: true, active: false } })
    productIds.push(inactive.id)
    expect(await productRepository.isPubliclyVisible(inactive.id)).toBe(false)
  })

  it('6. isPubliclyVisible: produto removido do catálogo (id inexistente) nunca é visível', async () => {
    expect(await productRepository.isPubliclyVisible('id-que-nao-existe-nunca-123')).toBe(false)
  })

  it('7. isPubliclyVisible: produto visível de verdade (showInCatalog=true e active=true) retorna true', async () => {
    const visible = await db.product.create({ data: { name: `Upload Visível ${Date.now()}`, showInCatalog: true, active: true } })
    productIds.push(visible.id)
    expect(await productRepository.isPubliclyVisible(visible.id)).toBe(true)
  })
})
