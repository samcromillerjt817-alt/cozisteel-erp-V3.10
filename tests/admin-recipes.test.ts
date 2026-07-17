import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { adminRecipesService } from '@/app/services/admin-recipes.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase Administração (ADR-021, Subetapa 4) — biblioteca de receitas curadas. `STORAGE_PATH` isolado
 * num diretório temporário (nunca toca `storage/patches/` real deste projeto).
 */
describe('Administração — AdminRecipesService (ADR-021, Subetapa 4)', () => {
  const tmpStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozisteel-recipes-test-'))
  const originalStoragePath = process.env.STORAGE_PATH
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []
  const createdPatchLogIds: string[] = []

  beforeAll(() => {
    process.env.STORAGE_PATH = tmpStorageDir
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    process.env.STORAGE_PATH = originalStoragePath
    fs.rmSync(tmpStorageDir, { recursive: true, force: true })

    await db.patchLog.deleteMany({ where: { id: { in: createdPatchLogIds } } })
    await db.batchConsumption.deleteMany({ where: { productBatch: { productionOrderId: { in: createdOrderIds } } } })
    await db.productBatch.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialBatch.deleteMany({ where: { materialId: { in: createdMaterialIds } } })
    await db.productionOrderExecution.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialReservation.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdOrderIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  // ── Receita 1: destravar status de patch preso ──────────────────────────

  describe('unstick-patch-status', () => {
    const statusFile = path.join(tmpStorageDir, 'patches', 'status.json')

    it('1. rejeita aplicar quando o status não está travado', async () => {
      fs.mkdirSync(path.dirname(statusFile), { recursive: true })
      fs.writeFileSync(statusFile, JSON.stringify({ state: 'done', message: 'ok', timestamp: new Date().toISOString() }))
      const user = await createTestUser('unstick-notstuck')
      createdUserIds.push(user.id)
      await expect(adminRecipesService.applyUnstickPatchStatus(user.id)).rejects.toThrow(/não está preso/i)
    })

    it('2. corrige um status travado e grava em AuditLog', async () => {
      const oldTimestamp = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      fs.writeFileSync(statusFile, JSON.stringify({ state: 'rolling_back', message: 'travado', timestamp: oldTimestamp, pid: 999999999 }))
      const user = await createTestUser('unstick-stuck')
      createdUserIds.push(user.id)

      const before = adminRecipesService.previewUnstickPatchStatus()
      expect(before.stuck).toBe(true)

      const after = await adminRecipesService.applyUnstickPatchStatus(user.id)
      expect(after.state).toBe('failed')
      expect(adminRecipesService.previewUnstickPatchStatus().stuck).toBe(false)

      const log = await db.auditLog.findFirst({ where: { userId: user.id, action: 'CORRECAO', entityName: 'status.json (patch)' } })
      expect(log).not.toBeNull()
      expect((log?.beforeValue as { state: string })?.state).toBe('rolling_back')
      expect((log?.afterValue as { state: string })?.state).toBe('failed')
    })
  })

  // ── Receita 2: reconstruir PatchLog ausente ─────────────────────────────

  describe('reconcile-patch-log', () => {
    const backupsDir = path.join(tmpStorageDir, 'patches', 'backups')

    function createFakeBackup(ts: string, version: string): string {
      const filename = `pre-patch-${ts}.tar.gz`
      const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozisteel-backup-src-'))
      fs.writeFileSync(path.join(sourceDir, 'version.json'), JSON.stringify({ version }))
      fs.mkdirSync(backupsDir, { recursive: true })
      execSync(`tar czf "${path.join(backupsDir, filename)}" -C "${sourceDir}" version.json`)
      fs.rmSync(sourceDir, { recursive: true, force: true })
      return filename
    }

    it('1. encontra um backup órfão (sem PatchLog próximo) e extrai a versão de dentro do tar.gz', async () => {
      const filename = createFakeBackup('20260101-000000', '2.5.0')
      const orphans = await adminRecipesService.previewReconcilePatchLog()
      const found = orphans.find((o) => o.backupTar === filename)
      expect(found).toBeDefined()
      expect(found?.fromVersionInBackup).toBe('2.5.0')
    })

    it('2. não lista como órfão um backup com PatchLog próximo em createdAt', async () => {
      const filename = createFakeBackup('20260102-120000', '2.6.0')
      const nearbyDate = new Date(2026, 0, 2, 12, 5, 0) // 5min depois do timestamp do backup
      const log = await db.patchLog.create({
        data: { fromVersion: '2.6.0', toVersion: '2.7.0', title: 'patch real', appliedVia: 'terminal', status: 'success', createdAt: nearbyDate },
      })
      createdPatchLogIds.push(log.id)

      const orphans = await adminRecipesService.previewReconcilePatchLog()
      expect(orphans.find((o) => o.backupTar === filename)).toBeUndefined()
    })

    it('3. reconcilia um backup órfão: cria PatchLog + AuditLog, remove da lista de órfãos', async () => {
      const filename = createFakeBackup('20260103-093000', '3.0.0')
      const user = await createTestUser('reconcile-user')
      createdUserIds.push(user.id)

      const created = await adminRecipesService.applyReconcilePatchLog(filename, user.id)
      createdPatchLogIds.push(created.id)

      expect(created.fromVersion).toBe('3.0.0')
      expect(created.status).toBe('rolled_back')

      const orphansAfter = await adminRecipesService.previewReconcilePatchLog()
      expect(orphansAfter.find((o) => o.backupTar === filename)).toBeUndefined()

      const log = await db.auditLog.findFirst({ where: { userId: user.id, action: 'CORRECAO', entityId: created.id } })
      expect(log).not.toBeNull()
    })

    it('4. rejeita reconciliar um backup que não está mais entre os órfãos', async () => {
      const user = await createTestUser('reconcile-notfound')
      createdUserIds.push(user.id)
      await expect(adminRecipesService.applyReconcilePatchLog('pre-patch-19990101-000000.tar.gz', user.id)).rejects.toThrow()
    })

    it('5. rejeita nome de arquivo de backup inválido (proteção contra path traversal)', async () => {
      const user = await createTestUser('reconcile-invalidname')
      createdUserIds.push(user.id)
      await expect(adminRecipesService.applyReconcilePatchLog('../../etc/passwd', user.id)).rejects.toThrow(/inválido/i)
    })
  })

  // ── Receita 3: recalcular custo de lote ─────────────────────────────────

  describe('recalculate-batch-cost', () => {
    it('1. recalcula o custo de um lote e grava before/after em AuditLog', async () => {
      const user = await createTestUser('recalc-batch')
      createdUserIds.push(user.id)
      const mesa = await createTestProduct('recalc-batch-mesa')
      createdProductIds.push(mesa.id)
      await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
      const tubo = await createTestMaterial('recalc-batch-tubo')
      createdMaterialIds.push(tubo.id)
      await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })
      await db.materialBatch.create({
        data: { materialId: tubo.id, batchNumber: 'LOTE-RECALC', quantityReceived: 1000, quantityAvailable: 1000, unitCost: 7 },
      })

      const revision = (await bomService.createRevision(mesa.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
      createdRevisionIds.push(revision.id)
      await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
      await bomService.changeStatus(revision.id, 'released', user.id)

      const order = (await productionOrderService.create({ productId: mesa.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string }
      createdOrderIds.push(order.id)
      await productionOrderService.produce(order.id, 5, user.id)

      const productBatch = await db.productBatch.findFirst({ where: { productionOrderId: order.id } })
      expect(productBatch?.materialCost).toBe(35) // 5kg * R$7

      const preview = await adminRecipesService.previewRecalculateBatchCost(productBatch!.id)
      expect(preview.materialCost).toBe(35)

      const after = await adminRecipesService.applyRecalculateBatchCost(productBatch!.id, user.id)
      expect(after.materialCost).toBe(35) // mesmo dado, recalculado dá o mesmo resultado (idempotente)

      const log = await db.auditLog.findFirst({ where: { userId: user.id, action: 'CORRECAO', entityId: productBatch!.id } })
      expect(log).not.toBeNull()
      expect((log?.beforeValue as { materialCost: number })?.materialCost).toBe(35)
      expect((log?.afterValue as { materialCost: number })?.materialCost).toBe(35)
    })

    it('2. lança erro de negócio para lote inexistente', async () => {
      await expect(adminRecipesService.previewRecalculateBatchCost('id-que-nao-existe')).rejects.toThrow(/não encontrado/i)
    })
  })
})
