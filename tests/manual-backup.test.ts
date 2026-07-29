import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { db } from '@/lib/db'
import { systemService } from '@/app/services/system.service'
import { patchService } from '@/app/services/patch.service'
import { createTestUser } from './helpers/fixtures'

/**
 * Fase Administração (ADR-021, Parte 8.5) — backup manual sob demanda (código + banco), pedido pelo
 * usuário como salvaguarda antes de qualquer operação arriscada, independente de aplicar um patch.
 * `STORAGE_PATH` isolado num diretório temporário (nunca toca `storage/patches/` real).
 */
describe('Administração — backup manual sob demanda (ADR-021, Parte 8.5)', () => {
  const tmpStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozisteel-manualbackup-test-'))
  const originalStoragePath = process.env.STORAGE_PATH
  const originalDatabaseUrl = process.env.DATABASE_URL
  const backupsDir = path.join(tmpStorageDir, 'patches', 'backups')
  const createdUserIds: string[] = []

  beforeAll(() => {
    process.env.STORAGE_PATH = tmpStorageDir
  })

  afterAll(async () => {
    process.env.STORAGE_PATH = originalStoragePath
    process.env.DATABASE_URL = originalDatabaseUrl
    fs.rmSync(tmpStorageDir, { recursive: true, force: true })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('1. lista vazio quando não há nenhum backup manual', async () => {
    expect(await systemService.listManualBackups()).toEqual([])
  })

  it('2. cria um backup manual real (tar.gz do código) e grava em AuditLog', async () => {
    const user = await createTestUser('manual-backup')
    createdUserIds.push(user.id)

    const result = await patchService.createManualBackup(user.id)

    expect(result.backupTar).toMatch(/^manual-backup-\d{8}-\d{6}-\d{3}\.tar\.gz$/)
    expect(result.sizeBytes).toBeGreaterThan(0)
    expect(fs.existsSync(path.join(backupsDir, result.backupTar))).toBe(true)

    const log = await db.auditLog.findFirst({ where: { userId: user.id, action: 'BACKUP', entityName: result.backupTar } })
    expect(log).not.toBeNull()
  })

  it('3. inclui o banco de dados no backup quando DATABASE_URL aponta para um arquivo existente (ADR-028 — via sqlite3 .backup, não cp direto)', async () => {
    const fakeDbPath = path.join(tmpStorageDir, 'fake.db')
    // Precisa ser um SQLite de verdade — a partir do ADR-028, o backup usa a API de backup do
    // próprio SQLite (`.backup`, segura sob escrita concorrente), que exige um arquivo de banco
    // válido como origem (não copia bytes arbitrários como o `cp` antigo copiava).
    execSync(`sqlite3 "${fakeDbPath}" "CREATE TABLE t(x TEXT); INSERT INTO t VALUES ('conteudo-fake-do-banco');"`)
    process.env.DATABASE_URL = `file:${fakeDbPath}`

    const user = await createTestUser('manual-backup-with-db')
    createdUserIds.push(user.id)

    const result = await patchService.createManualBackup(user.id)

    expect(result.backupDb).toMatch(/^manual-backup-\d{8}-\d{6}-\d{3}\.db$/)
    const backedUpPath = path.join(backupsDir, result.backupDb!)
    expect(fs.existsSync(backedUpPath)).toBe(true)

    // Verifica que é um SQLite válido e íntegro, com o mesmo conteúdo do original — não mais uma
    // comparação de bytes crus, já que `.backup` grava o arquivo em seu próprio formato interno.
    expect(execSync(`sqlite3 "${backedUpPath}" "PRAGMA integrity_check;"`, { encoding: 'utf8' }).trim()).toBe('ok')
    expect(execSync(`sqlite3 "${backedUpPath}" "SELECT x FROM t;"`, { encoding: 'utf8' }).trim()).toBe('conteudo-fake-do-banco')

    process.env.DATABASE_URL = originalDatabaseUrl
  })

  it('4. lista os backups manuais criados, mais recente primeiro, com tamanho do banco quando presente', async () => {
    const files = await systemService.listManualBackups()
    expect(files.length).toBeGreaterThanOrEqual(2)
    expect(files[0].modifiedAt >= files[files.length - 1].modifiedAt).toBe(true)
    const withDb = files.find((f) => f.dbSizeBytes !== null)
    expect(withDb).toBeDefined()
    expect(withDb!.dbSizeBytes).toBeGreaterThan(0)
  })

  it('5. não lista um backup automático de patch ("pre-patch-*") entre os backups manuais', async () => {
    fs.mkdirSync(backupsDir, { recursive: true })
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozisteel-prepatch-src-'))
    fs.writeFileSync(path.join(sourceDir, 'version.json'), '{}')
    execSync(`tar czf "${path.join(backupsDir, 'pre-patch-20260101-000000.tar.gz')}" -C "${sourceDir}" version.json`)
    fs.rmSync(sourceDir, { recursive: true, force: true })

    const files = await systemService.listManualBackups()
    expect(files.find((f) => f.filename.startsWith('pre-patch-'))).toBeUndefined()
  })
})
