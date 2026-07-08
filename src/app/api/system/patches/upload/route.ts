import { NextRequest } from 'next/server'
import { requireRole, unauthorized, forbidden, ok, badRequest } from '@/lib/api-utils'
import { getStorageDir, ensureStorageSubdir } from '@/lib/storage'
import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'

const MAX_PATCH_SIZE_BYTES = 200 * 1024 * 1024 // 200MB

/**
 * POST /api/system/patches/upload — multipart/form-data com campo "file" (.zip)
 *
 * Salva o patch em STORAGE_PATH/patches/pending, valida o manifesto (patch.json)
 * e dispara scripts/apply-patch.sh em segundo plano (o processo Node atual pode
 * ser reiniciado pelo PM2 no meio do caminho — é esperado, o script continua
 * rodando de forma independente). Responde imediatamente com o status "queued".
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('admin')

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return badRequest('Nenhum arquivo enviado (campo "file")')
    if (!file.name.endsWith('.zip')) return badRequest('O patch precisa ser um arquivo .zip')
    if (file.size > MAX_PATCH_SIZE_BYTES) return badRequest('Arquivo muito grande (máx. 200MB)')

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
      return badRequest('Arquivo inválido: patch.json não encontrado ou mal formatado dentro do .zip')
    }
    if (!manifest?.version) {
      await fs.unlink(filePath).catch(() => {})
      return badRequest('Manifesto do patch inválido: campo "version" ausente')
    }

    const projectRoot = process.cwd()
    const scriptPath = path.join(projectRoot, 'scripts', 'apply-patch.sh')

    const child = spawn(
      'bash',
      [scriptPath, filePath, `--applied-via=upload`, `--user-id=${user.id}`],
      { cwd: projectRoot, detached: true, stdio: 'ignore' }
    )
    child.unref()

    return ok({
      status: 'queued',
      manifest,
      message: 'Patch recebido e está sendo aplicado. O sistema pode reiniciar em instantes — acompanhe o progresso nesta tela.',
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('POST /api/system/patches/upload error:', error)
    return badRequest('Erro ao enviar patch')
  }
}
