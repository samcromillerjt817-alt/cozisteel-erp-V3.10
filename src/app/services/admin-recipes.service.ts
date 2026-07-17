import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { db } from '@/lib/db'
import { getStorageDir } from '@/lib/storage'
import { productBatchRepository } from '@/app/repositories/product-batch.repository'
import { costingService } from '@/app/services/costing.service'
import { systemDiagnosticsService } from '@/app/services/system-diagnostics.service'
import { auditService } from '@/app/services/audit.service'
import { BadRequestException, NotFoundException } from '@/app/exceptions'

export type RecipeId = 'unstick-patch-status' | 'reconcile-patch-log' | 'recalculate-batch-cost'

export const ADMIN_RECIPES: { id: RecipeId; name: string; description: string }[] = [
  {
    id: 'unstick-patch-status',
    name: 'Destravar status de atualização preso',
    description: 'Corrige storage/patches/status.json quando fica preso num estado não-terminal (o processo que o escreveu já não está mais rodando).',
  },
  {
    id: 'reconcile-patch-log',
    name: 'Reconstruir registro de atualização ausente',
    description: 'Lista backups de patch em disco sem registro correspondente em PatchLog (ex.: rollback que falhou ao se registrar) e cria o registro faltante.',
  },
  {
    id: 'recalculate-batch-cost',
    name: 'Recalcular custo de lote de produção',
    description: 'Recalcula materialCost/laborCost/overheadCost de um lote específico a partir dos dados atuais (BOM, taxas de custeio configuradas).',
  },
]

interface OrphanedBackup {
  backupTar: string
  timestamp: string
  fromVersionInBackup: string | null
}

/**
 * Fase Administração (ADR-021, Subetapa 4) — biblioteca de receitas curadas: a metade "com escrita"
 * da postura híbrida decidida no ADR-021 Parte 3(c). Cada receita é uma operação pré-definida e
 * testável, nunca SQL livre — resolve o achado técnico sem herdar o risco de um console de escrita
 * livre (postura (a), rejeitada). Toda `apply()` grava em `AuditLog` com before/after reais.
 */
class AdminRecipesService {
  list() {
    return ADMIN_RECIPES
  }

  // ── Receita 1: destravar status de patch preso ──────────────────────────

  previewUnstickPatchStatus() {
    return systemDiagnosticsService.getStuckPatchStatus()
  }

  async applyUnstickPatchStatus(userId: string) {
    const stuckInfo = systemDiagnosticsService.getStuckPatchStatus()
    if (!stuckInfo.stuck) throw new BadRequestException('O status de atualização não está preso — nada para corrigir')

    const statusFile = path.join(getStorageDir(), 'patches', 'status.json')
    const before = JSON.parse(fs.readFileSync(statusFile, 'utf8'))
    const after = {
      state: 'failed',
      message: `Estado travado (${stuckInfo.state}) corrigido manualmente via Administração em ${new Date().toLocaleString('pt-BR')}.`,
      timestamp: new Date().toISOString(),
    }
    fs.writeFileSync(statusFile, JSON.stringify(after, null, 2))

    await auditService.log({
      userId,
      action: 'CORRECAO',
      module: 'sistema',
      entityName: 'status.json (patch)',
      details: `Destravado estado preso "${stuckInfo.state}" (${stuckInfo.ageMinutes} min sem processo vivo)`,
      beforeValue: before,
      afterValue: after,
    })

    return after
  }

  // ── Receita 2: reconstruir PatchLog ausente ─────────────────────────────

  /** Backup "órfão" = sem nenhum PatchLog com createdAt dentro de ±30min do timestamp embutido no
   * nome do arquivo de backup — mesma janela usada pelo próprio `apply-patch.sh` entre o início do
   * backup e o fim do registro (patches normais levam 1-3 minutos; a folga cobre até um rollback
   * mais lento). Heurística, não uma referência exata — `PatchLog` não guarda o nome do arquivo de
   * backup que o originou. */
  async previewReconcilePatchLog(): Promise<OrphanedBackup[]> {
    const backupDir = path.join(getStorageDir(), 'patches', 'backups')
    let files: string[]
    try {
      files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.tar.gz'))
    } catch {
      return []
    }

    const allLogs = await db.patchLog.findMany({ select: { createdAt: true } })
    const orphans: OrphanedBackup[] = []

    for (const file of files) {
      const match = file.match(/^pre-patch-(\d{8}-\d{6})\.tar\.gz$/)
      if (!match) continue
      const ts = match[1]
      const backupDate = parseBackupTimestamp(ts)
      const hasNearbyLog = allLogs.some((log) => Math.abs(log.createdAt.getTime() - backupDate.getTime()) < 30 * 60 * 1000)
      if (hasNearbyLog) continue

      let fromVersionInBackup: string | null = null
      try {
        const raw = execSync(`tar xzOf "${path.join(backupDir, file)}" version.json`, { encoding: 'utf8' })
        fromVersionInBackup = JSON.parse(raw).version ?? null
      } catch {
        fromVersionInBackup = null
      }

      orphans.push({ backupTar: file, timestamp: backupDate.toISOString(), fromVersionInBackup })
    }

    return orphans
  }

  async applyReconcilePatchLog(backupTar: string, userId: string) {
    if (!/^pre-patch-\d{8}-\d{6}\.tar\.gz$/.test(backupTar)) throw new BadRequestException('Nome de arquivo de backup inválido')

    const orphans = await this.previewReconcilePatchLog()
    const target = orphans.find((o) => o.backupTar === backupTar)
    if (!target) throw new NotFoundException('Backup não encontrado entre os órfãos atuais (já pode ter sido reconciliado)')

    const created = await db.patchLog.create({
      data: {
        fromVersion: target.fromVersionInBackup || 'desconhecida',
        toVersion: target.fromVersionInBackup || 'desconhecida',
        title: 'Reconciliado manualmente via Administração',
        description: `Backup órfão "${backupTar}" sem registro correspondente — provável rollback cujo registro em PatchLog falhou silenciosamente (ADR-021, achado 2.2.2).`,
        appliedVia: 'terminal',
        status: 'rolled_back',
        errorMessage: 'Reconstruído a partir de backup em disco — detalhe original não disponível',
        userId,
        createdAt: new Date(target.timestamp),
      },
    })

    await auditService.log({
      userId,
      action: 'CORRECAO',
      module: 'sistema',
      entityId: created.id,
      entityName: 'PatchLog',
      details: `Registro reconstruído a partir do backup órfão "${backupTar}"`,
      beforeValue: undefined,
      afterValue: { fromVersion: created.fromVersion, toVersion: created.toVersion, status: created.status, createdAt: created.createdAt },
    })

    return created
  }

  // ── Receita 3: recalcular custo de lote ─────────────────────────────────

  async previewRecalculateBatchCost(productBatchId: string) {
    const batch = await productBatchRepository.findById(productBatchId)
    if (!batch) throw new NotFoundException('Lote de produção não encontrado')
    return batch as { id: string; batchNumber: string; materialCost: number | null; laborCost: number | null; overheadCost: number | null }
  }

  /** Nota honesta: o "preview" mostra o valor ATUAL, não simula o valor novo antes de aplicar —
   * `CostingService` sempre calcula E persiste no mesmo passo (é assim desde o ADR-016/ADR-020, sem
   * um modo "dry run" próprio). Recalcular de fato é a única forma de saber o valor novo; o
   * before/after fica registrado corretamente no `AuditLog` de qualquer forma. */
  async applyRecalculateBatchCost(productBatchId: string, userId: string) {
    const before = await this.previewRecalculateBatchCost(productBatchId)

    await costingService.calculateAndPersistMaterialCost(productBatchId)
    await costingService.calculateAndPersistLaborAndOverheadCost(productBatchId)

    const after = await productBatchRepository.findById(productBatchId) as {
      materialCost: number | null; laborCost: number | null; overheadCost: number | null
    }

    await auditService.log({
      userId,
      action: 'CORRECAO',
      module: 'sistema',
      entityId: productBatchId,
      entityName: `Lote ${before.batchNumber}`,
      details: 'Custo de material/mão de obra/overhead recalculado manualmente via Administração',
      beforeValue: { materialCost: before.materialCost, laborCost: before.laborCost, overheadCost: before.overheadCost },
      afterValue: { materialCost: after.materialCost, laborCost: after.laborCost, overheadCost: after.overheadCost },
    })

    return after
  }
}

function parseBackupTimestamp(ts: string): Date {
  // "YYYYMMDD-HHMMSS" -> Date (hora local do servidor, mesma convenção do "date +%Y%m%d-%H%M%S" do script)
  const [datePart, timePart] = ts.split('-')
  const year = Number(datePart.slice(0, 4))
  const month = Number(datePart.slice(4, 6)) - 1
  const day = Number(datePart.slice(6, 8))
  const hour = Number(timePart.slice(0, 2))
  const minute = Number(timePart.slice(2, 4))
  const second = Number(timePart.slice(4, 6))
  return new Date(year, month, day, hour, minute, second)
}

export const adminRecipesService = new AdminRecipesService()
