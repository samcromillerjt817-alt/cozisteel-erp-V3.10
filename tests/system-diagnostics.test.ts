import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { systemDiagnosticsService } from '@/app/services/system-diagnostics.service'

/**
 * Fase Administração (ADR-021, Subetapa 2) — `SystemDiagnosticsService`, foco na detecção de status
 * de patch "preso" (achado 2.2.1: confirmado ao vivo em produção, `status.json` congelado em
 * "rolling_back" há mais de uma semana). Usa `STORAGE_PATH` isolado num diretório temporário — nunca
 * toca `storage/patches/status.json` real deste projeto.
 */
describe('Administração — SystemDiagnosticsService (ADR-021, Subetapa 2)', () => {
  const tmpStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozisteel-diag-test-'))
  const originalStoragePath = process.env.STORAGE_PATH

  beforeAll(() => {
    process.env.STORAGE_PATH = tmpStorageDir
  })

  afterAll(() => {
    process.env.STORAGE_PATH = originalStoragePath
    fs.rmSync(tmpStorageDir, { recursive: true, force: true })
  })

  const statusFile = path.join(tmpStorageDir, 'patches', 'status.json')

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpStorageDir, 'patches'), { recursive: true })
    fs.rmSync(statusFile, { force: true })
  })

  function writeStatus(state: string, ageMinutes: number, pid: number) {
    const timestamp = new Date(Date.now() - ageMinutes * 60 * 1000).toISOString()
    fs.writeFileSync(statusFile, JSON.stringify({ state, message: 'teste', timestamp, pid }))
  }

  it('1. sem status.json: não travado', () => {
    expect(systemDiagnosticsService.getStuckPatchStatus()).toEqual({ stuck: false })
  })

  it('2. estado terminal ("done"), mesmo antigo e sem processo vivo: não travado', () => {
    writeStatus('done', 999, 999999999)
    expect(systemDiagnosticsService.getStuckPatchStatus().stuck).toBe(false)
  })

  it('3. estado não-terminal, recente, processo vivo (o próprio processo de teste): não travado', () => {
    writeStatus('building', 1, process.pid)
    expect(systemDiagnosticsService.getStuckPatchStatus().stuck).toBe(false)
  })

  it('4. estado não-terminal, recente (< 10min), processo morto: não travado ainda (idade não passou do limiar)', () => {
    writeStatus('rolling_back', 2, 999999999)
    expect(systemDiagnosticsService.getStuckPatchStatus().stuck).toBe(false)
  })

  it('5. estado não-terminal, antigo (> 10min), processo morto: travado', () => {
    writeStatus('rolling_back', 15, 999999999)
    const result = systemDiagnosticsService.getStuckPatchStatus()
    expect(result.stuck).toBe(true)
    expect(result.state).toBe('rolling_back')
    expect(result.processAlive).toBe(false)
  })

  it('6. reproduz o incidente real encontrado em produção (2026-07-09): "rolling_back" há mais de uma semana', () => {
    writeStatus('rolling_back', 60 * 24 * 8, 12345) // 8 dias, pid de exemplo
    expect(systemDiagnosticsService.getStuckPatchStatus().stuck).toBe(true)
  })
})
