import path from 'path'
import fs from 'fs/promises'
import { spawn, execSync } from 'child_process'
import { getStorageDir, ensureStorageSubdir } from '@/lib/storage'
import { BadRequestException } from '@/app/exceptions'

const MAX_PATCH_SIZE_BYTES = 200 * 1024 * 1024 // 200MB

/**
 * Isolado de SystemService de propósito (ADR-001, achado do levantamento da Fase 1): esta é a única
 * lógica do módulo de sistema com efeitos colaterais de processo (shell exec + spawn desacoplado do
 * processo Node atual) — vale a pena manter separado por testabilidade/risco, mesmo operando sobre o
 * mesmo `PatchLog`/`SystemInfo` que `SystemService` lê.
 */
class PatchService {
  /**
   * Salva o patch em STORAGE_PATH/patches/pending, valida o manifesto (patch.json) e dispara
   * scripts/apply-patch.sh em segundo plano (o processo Node atual pode ser reiniciado pelo PM2 no
   * meio do caminho — é esperado, o script continua rodando de forma independente).
   */
  async validateAndQueueUpload(file: File, userId: string) {
    if (!file.name.endsWith('.zip')) throw new BadRequestException('O patch precisa ser um arquivo .zip')
    if (file.size > MAX_PATCH_SIZE_BYTES) throw new BadRequestException('Arquivo muito grande (máx. 200MB)')

    const pendingDir = ensureStorageSubdir('patches', 'pending')
    const filename = `patch-${Date.now()}.zip`
    const filePath = path.join(pendingDir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(filePath, buffer)

    // Valida o manifesto lendo direto do zip, sem aplicar nada ainda
     
    let manifest: any = null
    try {
      const manifestRaw = execSync(`unzip -p "${filePath}" patch.json`, { encoding: 'utf8' })
      manifest = JSON.parse(manifestRaw)
    } catch {
      await fs.unlink(filePath).catch(() => {})
      throw new BadRequestException('Arquivo inválido: patch.json não encontrado ou mal formatado dentro do .zip')
    }
    if (!manifest?.version) {
      await fs.unlink(filePath).catch(() => {})
      throw new BadRequestException('Manifesto do patch inválido: campo "version" ausente')
    }

    const projectRoot = process.cwd()
    const scriptPath = path.join(projectRoot, 'scripts', 'apply-patch.sh')

    const child = spawn(
      'bash',
      [scriptPath, filePath, `--applied-via=upload`, `--user-id=${userId}`],
      { cwd: projectRoot, detached: true, stdio: 'ignore' }
    )
    child.unref()

    return {
      status: 'queued',
      manifest,
      message: 'Patch recebido e está sendo aplicado. O sistema pode reiniciar em instantes — acompanhe o progresso nesta tela.',
    }
  }
}

export const patchService = new PatchService()
