import { db } from '@/lib/db'

class NumberingService {
  async getNextNumber(documentType: string) {
    const seq = await db.numberSequence.findUnique({
      where: { documentType },
    })

    if (!seq) {
      const created = await db.numberSequence.create({
        data: { documentType, nextNumber: 1 },
      })
      const number = this.formatNumber(created)
      // Sem este incremento, a segunda chamada para o mesmo documentType recém-criado lia
      // nextNumber ainda em 1 (nunca avançado aqui) e devolvia o mesmo número já emitido.
      await db.numberSequence.update({
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
      await db.numberSequence.update({
        where: { documentType },
        data: { nextNumber: 1, currentYear, currentMonth },
      })
      return this.formatNumber({ ...seq, nextNumber: 1, currentYear })
    }

    if (seq.resetMonthly && seq.currentMonth !== currentMonth) {
      await db.numberSequence.update({
        where: { documentType },
        data: { nextNumber: 1, currentMonth },
      })
      return this.formatNumber({ ...seq, nextNumber: 1, currentMonth })
    }

    const number = this.formatNumber(seq)

    await db.numberSequence.update({
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