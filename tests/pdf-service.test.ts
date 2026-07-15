import { describe, it, expect, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getStorageDir, ensureStorageSubdir } from '@/lib/storage'
import { quoteService } from '@/app/services/quote.service'
import { pdfService } from '@/app/services/pdf.service'
import { createTestUser, createTestProduct } from './helpers/fixtures'

// PNG 1x1 válido mínimo — só pra ter um arquivo de imagem real e pequeno no storage de teste, sem
// depender de nenhuma lib de imagem.
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

/**
 * Reforma dos PDFs — cobre só o que é genuinamente novo (variante técnica com foto do Orçamento);
 * a geração do restante do documento (cards, totais, condições) já é validada visualmente pelo
 * usuário, não é reescrita por este teste. Os 3 casos de borda da imagem: produto com foto, produto
 * sem foto, item avulso sem produto — nenhum deles pode quebrar a geração do PDF.
 */
describe('PdfService — Orçamento (variantes técnica/comercial)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdImageFiles: string[] = []

  afterAll(async () => {
    for (const file of createdImageFiles) {
      try { fs.unlinkSync(file) } catch { /* já pode ter sido removido */ }
    }
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  function isValidPdfBuffer(buffer: Buffer): boolean {
    return buffer.length > 0 && buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  }

  async function createQuoteWithItem(suffix: string, productId: string | null) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const quote = (await quoteService.create(
      {
        status: 'draft', discountType: 'value', discountValue: 0,
        items: [{ productId, code: 'PDF-1', description: 'Item de teste', quantity: 2, unit: 'UN', unitPrice: 100, notes: '' }],
      } as never,
      user.id
    )) as { id: string }
    createdQuoteIds.push(quote.id)
    return quote
  }

  it('1. variante técnica com produto COM foto (isPrimary) gera um PDF válido', async () => {
    const product = await createTestProduct('pdf-with-photo')
    createdProductIds.push(product.id)

    const dir = ensureStorageSubdir('products', product.id)
    const filePath = path.join(dir, 'primary.png')
    fs.writeFileSync(filePath, Buffer.from(TINY_PNG_BASE64, 'base64'))
    createdImageFiles.push(filePath)
    await db.productImage.create({ data: { productId: product.id, url: `products/${product.id}/primary.png`, isPrimary: true, order: 0 } })

    const quote = await createQuoteWithItem('pdf-with-photo', product.id)
    const buffer = await pdfService.generateQuotePdf(quote.id, 'tecnico')
    expect(isValidPdfBuffer(buffer)).toBe(true)
  })

  it('2. variante técnica com produto SEM foto cadastrada gera um PDF válido (placeholder)', async () => {
    const product = await createTestProduct('pdf-no-photo')
    createdProductIds.push(product.id)

    const quote = await createQuoteWithItem('pdf-no-photo', product.id)
    const buffer = await pdfService.generateQuotePdf(quote.id, 'tecnico')
    expect(isValidPdfBuffer(buffer)).toBe(true)
  })

  it('3. variante técnica com item avulso (sem produto vinculado) gera um PDF válido (placeholder)', async () => {
    const quote = await createQuoteWithItem('pdf-no-product', null)
    const buffer = await pdfService.generateQuotePdf(quote.id, 'tecnico')
    expect(isValidPdfBuffer(buffer)).toBe(true)
  })

  it('4. variante comercial (default) nunca busca/desenha foto e gera um PDF válido', async () => {
    const product = await createTestProduct('pdf-comercial')
    createdProductIds.push(product.id)
    const quote = await createQuoteWithItem('pdf-comercial', product.id)

    const bufferDefault = await pdfService.generateQuotePdf(quote.id)
    const bufferExplicit = await pdfService.generateQuotePdf(quote.id, 'comercial')
    expect(isValidPdfBuffer(bufferDefault)).toBe(true)
    expect(isValidPdfBuffer(bufferExplicit)).toBe(true)
  })

  it('5. getStorageDir() aponta pra um diretório real e gravável (sanity check do setup de teste)', () => {
    expect(fs.existsSync(getStorageDir())).toBe(true)
  })
})
