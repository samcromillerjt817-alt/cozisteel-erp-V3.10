import path from 'path'
import fs from 'fs/promises'
import { productRepository } from '@/app/repositories/product.repository'
import { productImageRepository } from '@/app/repositories/product-image.repository'
import { productMaterialRepository } from '@/app/repositories/product-material.repository'
import { materialRepository } from '@/app/repositories/material.repository'
import { auditService } from '@/app/services/audit.service'
import { NotFoundException, BadRequestException } from '@/app/exceptions'
import { ensureStorageSubdir, getStorageDir, ALLOWED_IMAGE_EXTENSIONS, MAX_IMAGE_SIZE_BYTES } from '@/lib/storage'
import type { CreateProductDto, ProductMaterialDto } from '@/app/dto'

export interface ListProductsInput {
  search?: string
  categoryId?: string
  active?: string | null
  page: number
  limit: number
}

class ProductService {
  /** cm³→m³: mesma fórmula usada em create e update — antes duplicada nas duas rotas. */
  private calculateVolume(width: number, height: number, length: number): number {
    return (width * height * length) / 1_000_000
  }

  async list(input: ListProductsInput) {
    const where: Record<string, unknown> = {}
    if (input.search) {
      where.OR = [
        { name: { contains: input.search } },
        { internalCode: { contains: input.search } },
        { sku: { contains: input.search } },
        { description: { contains: input.search } },
      ]
    }
    if (input.categoryId) where.categoryId = input.categoryId
    if (input.active !== null && input.active !== undefined && input.active !== '') {
      where.active = input.active === 'true'
    }
    const { data, total } = await productRepository.findManyPaginated(where, (input.page - 1) * input.limit, input.limit)
    return { data, total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) }
  }

  async getById(id: string) {
    const product = await productRepository.findByIdDetailed(id)
    if (!product) throw new NotFoundException('Produto não encontrado')
    return product
  }

  async create(data: CreateProductDto) {
    const volumeM3 = this.calculateVolume(data.width, data.height, data.length)
    return productRepository.createWithMutationInclude({
      internalCode: data.internalCode,
      sku: data.sku,
      barcode: data.barcode,
      name: data.name,
      description: data.description,
      categoryId: data.categoryId || null,
      materialId: data.materialId || null,
      unit: data.unit,
      costPrice: data.costPrice,
      salePrice: data.salePrice,
      width: data.width,
      height: data.height,
      length: data.length,
      thickness: data.thickness,
      weight: data.weight,
      volumeM3,
      ncm: data.ncm,
      ipi: data.ipi,
      icms: data.icms,
      finish: data.finish,
      family: data.family,
      line: data.line,
      notes: data.notes,
    })
  }

  async update(id: string, body: Record<string, unknown>) {
    const target = await productRepository.findById(id)
    if (!target) throw new NotFoundException('Produto não encontrado')

    const { category, material, bomItems, bomComponents, quoteItems, createdAt, updatedAt, id: _id, ...updateData } = body

    const t = target as { width: number; height: number; length: number }
    const w = (updateData.width as number) ?? t.width
    const h = (updateData.height as number) ?? t.height
    const l = (updateData.length as number) ?? t.length
    if (updateData.width !== undefined || updateData.height !== undefined || updateData.length !== undefined) {
      updateData.volumeM3 = this.calculateVolume(w, h, l)
    }

    return productRepository.updateWithMutationInclude(id, updateData)
  }

  /** Produto usa soft-delete (active:false), diferente de Material/Fornecedor — preservado como está. */
  async deactivate(id: string) {
    const product = await productRepository.findById(id)
    if (!product) throw new NotFoundException('Produto não encontrado')
    await productRepository.update(id, { active: false })
    return { success: true }
  }

  // ── Imagens ──

  async listImages(productId: string) {
    return productImageRepository.findManyByProduct(productId)
  }

  async uploadImage(productId: string, file: File, userId: string) {
    const product = await productRepository.findById(productId)
    if (!product) throw new NotFoundException('Produto não encontrado')

    const ext = path.extname(file.name || '').toLowerCase()
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(`Formato não suportado. Use: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`)
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException(`Arquivo muito grande (máx. ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB)`)
    }

    const dir = ensureStorageSubdir('products', productId)
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(path.join(dir, filename), buffer)

    const existingCount = await productImageRepository.countByProduct(productId)
    const image = await productImageRepository.create({
      productId,
      url: `products/${productId}/${filename}`,
      isPrimary: existingCount === 0,
      order: existingCount,
    })

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'produtos',
      entityId: productId,
      entityName: (product as { name: string }).name,
      details: `Imagem adicionada ao produto "${(product as { name: string }).name}"`,
    })

    return image
  }

  async deleteImage(productId: string, imageId: string, userId: string) {
    const image = await productImageRepository.findById(imageId)
    if (!image || (image as { productId: string }).productId !== productId) throw new NotFoundException('Imagem não encontrada')

    await productImageRepository.delete(imageId)

    try {
      await fs.unlink(path.join(getStorageDir(), (image as { url: string }).url))
    } catch {
      // arquivo já pode ter sido removido manualmente — não impede a exclusão do registro
    }

    if ((image as { isPrimary: boolean }).isPrimary) {
      const next = await productImageRepository.findFirstOrdered(productId)
      if (next) await productImageRepository.setPrimary((next as { id: string }).id)
    }

    await auditService.log({
      userId,
      action: 'DELETE',
      module: 'produtos',
      entityId: productId,
      entityName: productId,
      details: `Imagem removida do produto`,
    })

    return { success: true }
  }

  async setPrimaryImage(productId: string, imageId: string, isPrimary: boolean) {
    const image = await productImageRepository.findById(imageId)
    if (!image || (image as { productId: string }).productId !== productId) throw new NotFoundException('Imagem não encontrada')

    if (isPrimary) {
      await productImageRepository.unsetAllPrimaryForProduct(productId)
      await productImageRepository.setPrimary(imageId)
    }

    return { success: true }
  }

  // ── Vínculo Produto ↔ Matéria-prima (receita/BOM simples) ──

  async listLinkedMaterials(productId: string) {
    return productMaterialRepository.findManyByProduct(productId)
  }

  async linkMaterial(productId: string, data: ProductMaterialDto, userId: string) {
    const product = await productRepository.findById(productId)
    if (!product) throw new NotFoundException('Produto não encontrado')

    const material = await materialRepository.findById(data.materialId)
    if (!material) throw new NotFoundException('Matéria-prima não encontrada')

    const link = await productMaterialRepository.upsert(productId, data.materialId, {
      quantity: data.quantity,
      unit: data.unit,
      scrapPct: data.scrapPct,
      notes: data.notes,
    })

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'produtos',
      entityId: productId,
      entityName: (product as { name: string }).name,
      details: `Matéria-prima "${(material as { name: string }).name}" vinculada ao produto (qtd ${data.quantity} ${data.unit})`,
    })

    return link
  }

  async unlinkMaterial(productId: string, materialId: string, userId: string) {
    const link = await productMaterialRepository.findByCompositeKey(productId, materialId, { material: true, product: true })
    if (!link) throw new NotFoundException('Vínculo não encontrado')

    await productMaterialRepository.delete(productId, materialId)

    const linked = link as unknown as { material: { name: string }; product: { name: string } }
    await auditService.log({
      userId,
      action: 'DELETE',
      module: 'produtos',
      entityId: productId,
      entityName: linked.product.name,
      details: `Matéria-prima "${linked.material.name}" desvinculada do produto`,
    })

    return { success: true }
  }
}

export const productService = new ProductService()
