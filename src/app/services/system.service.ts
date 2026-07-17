import path from 'path'
import fs from 'fs/promises'
import { systemInfoRepository } from '@/app/repositories/system-info.repository'
import { patchLogRepository } from '@/app/repositories/patch-log.repository'
import { getStorageDir } from '@/lib/storage'
import { BadRequestException, NotFoundException } from '@/app/exceptions'

// Mesmo padrão gravado por scripts/apply-patch.sh ("patch-$TS.log", TS = "date +%Y%m%d-%H%M%S") —
// validado antes de qualquer leitura de arquivo pra nunca aceitar um path arbitrário (ADR-021).
const PATCH_LOG_FILENAME_PATTERN = /^patch-\d{8}-\d{6}\.log$/
const MAX_LOG_READ_CHARS = 500_000 // ~500KB — evita resposta gigante se um log fugir do normal

class SystemService {
  async getInfo() {
    let info = await systemInfoRepository.findMain()
    if (!info) info = await systemInfoRepository.createMain()

    return {
      version: (info as { version: string }).version,
      installedAt: (info as { installedAt: Date }).installedAt,
      updatedAt: (info as { updatedAt: Date }).updatedAt,
      maintenanceMode: (info as { maintenanceMode: boolean }).maintenanceMode,
    }
  }

  async getPatchHistory() {
    const [systemInfo, history] = await Promise.all([
      systemInfoRepository.findMain(),
      patchLogRepository.findRecent(50),
    ])

    return {
      currentVersion: (systemInfo as { version: string } | null)?.version || '4.0.0',
      updatedAt: (systemInfo as { updatedAt: Date } | null)?.updatedAt || null,
      history,
    }
  }

  /** Lê o arquivo de status escrito progressivamente pelo scripts/apply-patch.sh. Nunca lança —
   *  qualquer falha de leitura/parse (arquivo ausente, corrompido) é tratada como "sem atualização
   *  em andamento", preservando o comportamento original da rota. */
  async getPatchStatus() {
    const statusFile = path.join(getStorageDir(), 'patches', 'status.json')
    try {
      const raw = await fs.readFile(statusFile, 'utf8')
      return JSON.parse(raw)
    } catch {
      return { state: 'idle', message: 'Nenhuma atualização em andamento' }
    }
  }

  /** Logs de execução de scripts/apply-patch.sh (ADR-021, achado 2.2.3 — antes disto a saída do
   * script ia pro vazio quando disparado via upload). Mais recente primeiro — o nome do arquivo já
   * embute o timestamp, então ordenar por nome equivale a ordenar por data. */
  async listPatchLogs() {
    const logsDir = path.join(getStorageDir(), 'patches', 'logs')
    let files: string[]
    try {
      files = await fs.readdir(logsDir)
    } catch {
      return []
    }

    const entries = await Promise.all(
      files
        .filter((f) => PATCH_LOG_FILENAME_PATTERN.test(f))
        .map(async (filename) => {
          const stat = await fs.stat(path.join(logsDir, filename))
          return { filename, sizeBytes: stat.size, modifiedAt: stat.mtime }
        })
    )
    return entries.sort((a, b) => b.filename.localeCompare(a.filename))
  }

  /** `truncated` mostra só o FINAL do log (onde o erro normalmente aparece), não o início — mais
   * útil para diagnóstico do que cortar o final de um log muito grande. */
  async readPatchLog(filename: string): Promise<{ content: string; truncated: boolean }> {
    if (!PATCH_LOG_FILENAME_PATTERN.test(filename)) throw new BadRequestException('Nome de arquivo de log inválido')

    const filePath = path.join(getStorageDir(), 'patches', 'logs', filename)
    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch {
      throw new NotFoundException('Log de atualização não encontrado')
    }

    const truncated = content.length > MAX_LOG_READ_CHARS
    return { content: truncated ? content.slice(-MAX_LOG_READ_CHARS) : content, truncated }
  }
}

export const systemService = new SystemService()
