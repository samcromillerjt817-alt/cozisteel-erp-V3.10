import { sequenceRepository } from '@/app/repositories/sequence.repository'
import { auditService } from '@/app/services/audit.service'
import { BadRequestException, NotFoundException } from '@/app/exceptions'

export interface UpdateSequenceInput {
  prefix?: string
  suffix?: string
  nextNumber?: number
  digits?: number
  increment?: number
  resetAnnual?: boolean
  resetMonthly?: boolean
}

class SequenceService {
  async list() {
    return sequenceRepository.findAllWithUser()
  }

  async update(id: string | undefined, data: UpdateSequenceInput, userId: string) {
    if (!id) throw new BadRequestException('ID é obrigatório')

    const seq = await sequenceRepository.findById(id)
    if (!seq) throw new NotFoundException('Sequência não encontrada')

    const updateData: Record<string, unknown> = {}
    if (data.prefix !== undefined) updateData.prefix = data.prefix
    if (data.suffix !== undefined) updateData.suffix = data.suffix
    if (data.nextNumber !== undefined) updateData.nextNumber = data.nextNumber
    if (data.digits !== undefined) updateData.digits = data.digits
    if (data.increment !== undefined) updateData.increment = data.increment
    if (data.resetAnnual !== undefined) updateData.resetAnnual = data.resetAnnual
    if (data.resetMonthly !== undefined) updateData.resetMonthly = data.resetMonthly
    updateData.updatedBy = userId

    const updated = await sequenceRepository.updateWithUser(id, updateData)

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'sequencias',
      entityId: id,
      entityName: (seq as { documentType: string }).documentType,
      details: `Sequência ${(seq as { documentType: string }).documentType} atualizada`,
    })

    return updated
  }
}

export const sequenceService = new SequenceService()
