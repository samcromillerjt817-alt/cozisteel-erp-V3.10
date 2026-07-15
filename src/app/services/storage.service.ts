import path from 'path'
import fs from 'fs/promises'
import { getStorageDir } from '@/lib/storage'
import { NotFoundException } from '@/app/exceptions'

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
}

class StorageService {
  /** Resolve um arquivo dentro de STORAGE_PATH a partir dos segmentos de path da URL, com proteção
   *  básica contra path traversal (../). Lança NotFoundException se o arquivo não existir ou o path
   *  escapar do diretório de storage — o chamador decide como isso vira resposta HTTP. */
  async resolveFile(segments: string[]): Promise<{ buffer: Buffer; contentType: string }> {
    const storageDir = getStorageDir()
    const filePath = path.join(storageDir, ...segments)

    if (!filePath.startsWith(storageDir)) {
      throw new NotFoundException()
    }

    const buffer = await fs.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    return { buffer, contentType }
  }
}

export const storageService = new StorageService()
