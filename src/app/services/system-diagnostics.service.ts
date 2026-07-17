import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { getStorageDir } from '@/lib/storage'

export interface DiskSpaceInfo {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  usedPercent: number
}

export interface Pm2ProcessInfo {
  name: string
  pid: number
  status: string
  restarts: number
  uptimeMs: number
  memoryBytes: number
  cpuPercent: number
}

export interface StuckPatchInfo {
  stuck: boolean
  state?: string
  message?: string
  ageMinutes?: number
  pid?: number
  processAlive?: boolean
}

export interface SystemDiagnostics {
  databaseSizeBytes: number | null
  diskSpace: DiskSpaceInfo | null
  pm2: Pm2ProcessInfo[] | null
  stuckPatch: StuckPatchInfo
}

const TERMINAL_PATCH_STATES = new Set(['done', 'failed'])
const STUCK_THRESHOLD_MINUTES = 10

/**
 * Fase Administração (ADR-021, Subetapa 2) — leituras de diagnóstico/saúde, todas best-effort:
 * qualquer falha individual (comando ausente, arquivo não encontrado) devolve `null`/estado neutro
 * em vez de derrubar a tela inteira. Nenhuma escrita aqui — puro diagnóstico.
 */
class SystemDiagnosticsService {
  getDatabaseSizeBytes(): number | null {
    try {
      const dbUrl = process.env.DATABASE_URL || ''
      const filePath = dbUrl.replace(/^file:/, '')
      if (!filePath) return null
      return fs.statSync(filePath).size
    } catch {
      return null
    }
  }

  /** `df` do diretório de storage — aproxima o disco relevante pro sistema (mesmo volume do
   * banco/backups na prática, já que tudo fica sob o mesmo `STORAGE_PATH`/projeto). */
  getDiskSpace(): DiskSpaceInfo | null {
    try {
      const out = execSync(`df -k --output=size,used,avail "${getStorageDir()}" | tail -1`, { encoding: 'utf8' })
      const [totalKb, usedKb, availKb] = out.trim().split(/\s+/).map(Number)
      if (!totalKb) return null
      return {
        totalBytes: totalKb * 1024,
        usedBytes: usedKb * 1024,
        availableBytes: availKb * 1024,
        usedPercent: Math.round((usedKb / totalKb) * 100),
      }
    } catch {
      return null
    }
  }

  getPm2Status(): Pm2ProcessInfo[] | null {
    try {
      const out = execSync('pm2 jlist', { encoding: 'utf8' })
      const list = JSON.parse(out) as Array<{
        name: string
        pid: number
        pm2_env?: { status: string; restart_time: number; pm_uptime: number }
        monit?: { memory: number; cpu: number }
      }>
      return list.map((p) => ({
        name: p.name,
        pid: p.pid,
        status: p.pm2_env?.status ?? 'desconhecido',
        restarts: p.pm2_env?.restart_time ?? 0,
        uptimeMs: p.pm2_env?.pm_uptime ?? 0,
        memoryBytes: p.monit?.memory ?? 0,
        cpuPercent: p.monit?.cpu ?? 0,
      }))
    } catch {
      return null
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  /** ADR-021 (achado 2.2.1) — `status.json` pode ficar preso num estado não-terminal pra sempre se
   * o script morrer sem chegar a "done"/"failed" (confirmado ao vivo: preso em "rolling_back" desde
   * 2026-07-09). "Preso" exige as duas coisas: estado não-terminal há mais de
   * `STUCK_THRESHOLD_MINUTES` E o processo que escreveu esse estado (via `pid`, gravado pelo script
   * desde esta mesma rodada) não estar mais rodando — nunca só idade, ou um patch legitimamente lento
   * seria falsamente marcado como preso. */
  getStuckPatchStatus(): StuckPatchInfo {
    try {
      const raw = fs.readFileSync(path.join(getStorageDir(), 'patches', 'status.json'), 'utf8')
      const status = JSON.parse(raw) as { state: string; message: string; timestamp: string; pid?: number }
      if (TERMINAL_PATCH_STATES.has(status.state)) return { stuck: false }

      const ageMinutes = (Date.now() - new Date(status.timestamp).getTime()) / 60000
      const processAlive = typeof status.pid === 'number' ? this.isProcessAlive(status.pid) : false
      const stuck = ageMinutes > STUCK_THRESHOLD_MINUTES && !processAlive

      return { stuck, state: status.state, message: status.message, ageMinutes: Math.round(ageMinutes), pid: status.pid, processAlive }
    } catch {
      return { stuck: false }
    }
  }

  getDiagnostics(): SystemDiagnostics {
    return {
      databaseSizeBytes: this.getDatabaseSizeBytes(),
      diskSpace: this.getDiskSpace(),
      pm2: this.getPm2Status(),
      stuckPatch: this.getStuckPatchStatus(),
    }
  }
}

export const systemDiagnosticsService = new SystemDiagnosticsService()
