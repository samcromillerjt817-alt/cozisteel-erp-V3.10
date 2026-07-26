import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import { spawn, execSync } from 'child_process'
import { ensureStorageSubdir } from '@/lib/storage'
import { auditService } from '@/app/services/audit.service'
import { BadRequestException } from '@/app/exceptions'

const MAX_PATCH_SIZE_BYTES = 200 * 1024 * 1024 // 200MB

// Mesma lista de inclusão/exclusão do backup automático em scripts/apply-patch.sh — mantém os dois
// mecanismos consistentes (mesmo conteúdo, só muda o prefixo do arquivo e o gatilho).
const BACKUP_TAR_ARGS = `--exclude='node_modules' --exclude='.next' --exclude='storage' --exclude='.git' prisma src public package.json package-lock.json next.config.ts version.json ecosystem.config.cjs`

// Inclui milissegundos (diferente do "pre-patch-*" de scripts/apply-patch.sh, que só precisa de
// segundos porque um patch real leva minutos): o botão de backup manual pode ser clicado mais de uma
// vez na mesma UI dentro do mesmo segundo, e cada clique precisa virar um arquivo distinto.
function formatBackupTimestamp(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`
}

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

  /**
   * Backup sob demanda (código + banco), fora de qualquer aplicação de patch (ADR-021, Parte 8.5 —
   * pedido do usuário para poder tirar uma salvaguarda antes de qualquer operação arriscada feita pela
   * Central de Administração, ex.: rodar uma receita de correção). Prefixo "manual-backup-" (nunca
   * "pre-patch-") de propósito: a receita "reconcile-patch-log" só varre "pre-patch-*.tar.gz" à procura
   * de PatchLog ausente — um backup manual nunca tem PatchLog correspondente por natureza, e não deve
   * virar falso-positivo de "backup órfão" nessa receita.
   */
  async createManualBackup(userId: string) {
    const backupDir = ensureStorageSubdir('patches', 'backups')
    const ts = formatBackupTimestamp(new Date())
    const backupTar = `manual-backup-${ts}.tar.gz`
    const backupTarPath = path.join(backupDir, backupTar)

    execSync(`tar czf "${backupTarPath}" ${BACKUP_TAR_ARGS}`, { cwd: process.cwd() })

    let backupDb: string | null = null
    const dbFile = (process.env.DATABASE_URL || '').replace(/^file:/, '')
    if (dbFile && fsSync.existsSync(dbFile)) {
      backupDb = `manual-backup-${ts}.db`
      await fs.copyFile(dbFile, path.join(backupDir, backupDb))
    }

    const { size: sizeBytes } = await fs.stat(backupTarPath)

    await auditService.log({
      userId,
      action: 'BACKUP',
      module: 'sistema',
      entityName: backupTar,
      details: `Backup manual criado sob demanda (código${backupDb ? ' + banco' : ''})`,
    })

    return { backupTar, backupDb, sizeBytes, createdAt: new Date().toISOString() }
  }
}

export const patchService = new PatchService()
