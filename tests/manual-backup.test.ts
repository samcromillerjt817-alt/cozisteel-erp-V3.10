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

  it('3. inclui o banco de dados no backup quando DATABASE_URL aponta para um arquivo existente', async () => {
    const fakeDbPath = path.join(tmpStorageDir, 'fake.db')
    fs.writeFileSync(fakeDbPath, 'conteudo-fake-do-banco')
    process.env.DATABASE_URL = `file:${fakeDbPath}`

    const user = await createTestUser('manual-backup-with-db')
    createdUserIds.push(user.id)

    const result = await patchService.createManualBackup(user.id)

    expect(result.backupDb).toMatch(/^manual-backup-\d{8}-\d{6}-\d{3}\.db$/)
    expect(fs.existsSync(path.join(backupsDir, result.backupDb!))).toBe(true)
    expect(fs.readFileSync(path.join(backupsDir, result.backupDb!), 'utf8')).toBe('conteudo-fake-do-banco')

    process.env.DATABASE_URL = originalDatabaseUrl
  })

  it('4. lista os backups manuais criados, mais recente primeiro, com tamanho do banco quando presente', async () => {
    const files = await systemService.listManualBackups()
    expect(files.length).toBeGreaterThanOrEqual(2)
    expect(files[0].modifiedAt >= files[files.length - 1].modifiedAt).toBe(true)
    const withDb = files.find((f) => f.dbSizeBytes !== null)
    expect(withDb).toBeDefined()
    expect(withDb!.dbSizeBytes).toBe('conteudo-fake-do-banco'.length)
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
