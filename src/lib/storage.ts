import path from 'path'
import fs from 'fs'

/**
 * Diretório raiz de armazenamento de arquivos enviados pelo usuário (fotos de produto, etc.).
 * Usa STORAGE_PATH do .env quando definido; cai para "<projeto>/storage" caso contrário.
 * Fica FORA de .next de propósito — sobrevive a "rm -rf .next" + rebuild.
 */
export function getStorageDir(): string {
  const base = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage')
  return path.isAbsolute(base) ? base : path.join(process.cwd(), base)
}

/** Garante que um subdiretório dentro do storage exista, criando se necessário. */
export function ensureStorageSubdir(...segments: string[]): string {
  const dir = path.join(getStorageDir(), ...segments)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Extensões de imagem aceitas para upload de fotos de produto. */
export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024 // 8MB
