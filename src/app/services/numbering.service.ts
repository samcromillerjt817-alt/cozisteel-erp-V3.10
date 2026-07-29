import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

type DbClient = typeof db | Prisma.TransactionClient

class NumberingService {
  /** `client` opcional (auditoria de segurança, 2ª rodada) — quando chamado de dentro de uma
   *  `db.$transaction`, passar o `tx` garante que o incremento da sequência participa do mesmo
   *  rollback-tudo-ou-nada da operação (ex.: `confirmByClient`); default `db` preserva o
   *  comportamento de todo chamador existente, sem transação nenhuma. */
  async getNextNumber(documentType: string, client: DbClient = db) {
    const seq = await client.numberSequence.findUnique({
      where: { documentType },
    })

    if (!seq) {
      const created = await client.numberSequence.create({
        data: { documentType, nextNumber: 1 },
      })
      const number = this.formatNumber(created)
      // Sem este incremento, a segunda chamada para o mesmo documentType recém-criado lia
      // nextNumber ainda em 1 (nunca avançado aqui) e devolvia o mesmo número já emitido.
      await client.numberSequence.update({
        where: { documentType },
        data: { nextNumber: created.nextNumber + created.increment },
      })
      return number
    }

    // Handle annual/monthly reset
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    if (seq.resetAnnual && seq.currentYear !== currentYear) {
      await client.numberSequence.update({
        where: { documentType },
        data: { nextNumber: 1, currentYear, currentMonth },
      })
      return this.formatNumber({ ...seq, nextNumber: 1, currentYear })
    }

    if (seq.resetMonthly && seq.currentMonth !== currentMonth) {
      await client.numberSequence.update({
        where: { documentType },
        data: { nextNumber: 1, currentMonth },
      })
      return this.formatNumber({ ...seq, nextNumber: 1, currentMonth })
    }

    const number = this.formatNumber(seq)

    await client.numberSequence.update({
      where: { documentType },
      data: { nextNumber: seq.nextNumber + seq.increment },
    })

    return number
  }

  private formatNumber(seq: {
    prefix: string
    suffix: string
    nextNumber: number
    digits: number
    currentYear?: number | null
    currentMonth?: number | null
    resetAnnual?: boolean
  }): string {
    let num = String(seq.nextNumber).padStart(seq.digits, '0')

    if (seq.resetAnnual && seq.currentYear) {
      num = `${seq.currentYear}${num}`
    }

    return `${seq.prefix}${num}${seq.suffix}`
  }
}

export const numberingService = new NumberingService()
