import path from 'path'
import fs from 'fs/promises'
import { systemInfoRepository } from '@/app/repositories/system-info.repository'
import { patchLogRepository } from '@/app/repositories/patch-log.repository'
import { getStorageDir } from '@/lib/storage'

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
}

export const systemService = new SystemService()
