import { describe, it, expect, afterEach, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { approvalService } from '@/app/services/approval.service'
import { createTestUser } from './helpers/fixtures'

async function createUserWithRole(suffix: string, role: string) {
  const passwordHash = await bcrypt.hash('teste123', 4)
  return db.user.create({ data: { username: `test_user_${suffix}`, name: 'Test User', password: passwordHash, role, active: true } })
}

/**
 * ADR-023 (item 5, Decisão #4) — motor de alçada genuinamente configurável. Enquanto nenhuma
 * `ApprovalRule` existe para um tipo de documento, a política implícita preserva o comportamento de
 * antes (1 aprovação, sem faixa de valor, qualquer aprovador aprova, autoaprovação permitida) — mas
 * já passando por `recordApproval()`, nunca por um atalho paralelo.
 */
describe('Motor de Alçada (ADR-023, item 5)', () => {
  const createdUserIds: string[] = []
  const createdRuleIds: string[] = []
  const createdDocumentIds: string[] = []

  // `ApprovalRule` é config global (não escopada por teste) — cada teste que cria uma regra pra
  // "purchase_order"/"quote"/"requisition" vazaria pra testes seguintes do mesmo tipo se não fosse
  // limpa entre casos. Sem isso, testes 6/7 pegavam regra de teste 2/4 por engano.
  afterEach(async () => {
    await db.approvalRecord.deleteMany({ where: { documentId: { in: createdDocumentIds } } })
    await db.approvalRule.deleteMany({ where: { id: { in: createdRuleIds } } })
    createdDocumentIds.length = 0
    createdRuleIds.length = 0
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('1. Política implícita (sem nenhuma ApprovalRule cadastrada): 1 aprovação já completa, sem gravar ApprovalRecord', async () => {
    const user = await createTestUser('approval-implicit')
    createdUserIds.push(user.id)
    const documentId = 'doc-implicit-1'
    createdDocumentIds.push(documentId)

    const outcome = await approvalService.recordApproval('quote', documentId, 1000, user.id, user.id, user.role)

    expect(outcome.complete).toBe(true)
    expect(outcome.approvalsGiven).toBe(1)
    expect(outcome.approvalsNeeded).toBe(1)

    const records = await db.approvalRecord.findMany({ where: { documentId } })
    expect(records).toHaveLength(0) // política implícita não é uma regra real — nada pra contar
  })

  it('2. Regra exigindo 2 aprovações: primeira fica incompleta, segunda (outro usuário) completa', async () => {
    const userA = await createTestUser('approval-multi-a')
    createdUserIds.push(userA.id)
    const userB = await createTestUser('approval-multi-b')
    createdUserIds.push(userB.id)
    const documentId = 'doc-multi-1'
    createdDocumentIds.push(documentId)

    const rule = (await approvalService.createRule({
      documentType: 'purchase_order', minValue: null, maxValue: null, approverRole: null,
      requiredApprovals: 2, allowSelfApproval: true, order: 0, active: true, notes: '',
    })) as { id: string }
    createdRuleIds.push(rule.id)

    const first = await approvalService.recordApproval('purchase_order', documentId, 5000, userA.id, userA.id, userA.role)
    expect(first.complete).toBe(false)
    expect(first.approvalsGiven).toBe(1)
    expect(first.approvalsNeeded).toBe(2)

    const second = await approvalService.recordApproval('purchase_order', documentId, 5000, userB.id, userA.id, userB.role)
    expect(second.complete).toBe(true)
    expect(second.approvalsGiven).toBe(2)
  })

  it('3. Mesmo usuário não pode aprovar o mesmo documento duas vezes pela mesma regra', async () => {
    const user = await createTestUser('approval-duplicate')
    createdUserIds.push(user.id)
    const documentId = 'doc-duplicate-1'
    createdDocumentIds.push(documentId)

    const rule = (await approvalService.createRule({
      documentType: 'purchase_order', minValue: null, maxValue: null, approverRole: null,
      requiredApprovals: 2, allowSelfApproval: true, order: 0, active: true, notes: '',
    })) as { id: string }
    createdRuleIds.push(rule.id)

    await approvalService.recordApproval('purchase_order', documentId, 5000, user.id, user.id, user.role)
    await expect(approvalService.recordApproval('purchase_order', documentId, 5000, user.id, user.id, user.role)).rejects.toThrow(/já aprovou/)
  })

  it('4. allowSelfApproval=false recusa quando o aprovador é o próprio criador do documento', async () => {
    const user = await createTestUser('approval-self')
    createdUserIds.push(user.id)
    const documentId = 'doc-self-1'
    createdDocumentIds.push(documentId)

    const rule = (await approvalService.createRule({
      documentType: 'quote', minValue: null, maxValue: null, approverRole: null,
      requiredApprovals: 1, allowSelfApproval: false, order: 0, active: true, notes: '',
    })) as { id: string }
    createdRuleIds.push(rule.id)

    await expect(approvalService.recordApproval('quote', documentId, 1000, user.id, user.id, user.role)).rejects.toThrow(/Autoaprovação não é permitida/)
  })

  it('5. approverRole exige o perfil configurado', async () => {
    const managerUser = await createUserWithRole('approval-role-manager', 'manager')
    createdUserIds.push(managerUser.id)
    const viewerUser = await createUserWithRole('approval-role-viewer', 'viewer')
    createdUserIds.push(viewerUser.id)
    const creator = await createTestUser('approval-role-creator')
    createdUserIds.push(creator.id)
    const documentId = 'doc-role-1'
    createdDocumentIds.push(documentId)

    const rule = (await approvalService.createRule({
      documentType: 'requisition', minValue: null, maxValue: null, approverRole: 'manager',
      requiredApprovals: 1, allowSelfApproval: true, order: 0, active: true, notes: '',
    })) as { id: string }
    createdRuleIds.push(rule.id)

    await expect(approvalService.recordApproval('requisition', documentId, 1000, viewerUser.id, creator.id, viewerUser.role)).rejects.toThrow(/exige o perfil "manager"/)

    const outcome = await approvalService.recordApproval('requisition', documentId, 1000, managerUser.id, creator.id, managerUser.role)
    expect(outcome.complete).toBe(true)
  })

  it('6. Faixa de valor: regra só se aplica dentro de [minValue, maxValue]; fora da faixa, cai para outra regra/política implícita', async () => {
    const user = await createTestUser('approval-range')
    createdUserIds.push(user.id)
    const documentIdHigh = 'doc-range-high'
    const documentIdLow = 'doc-range-low'
    createdDocumentIds.push(documentIdHigh, documentIdLow)

    const highValueRule = (await approvalService.createRule({
      documentType: 'purchase_order', minValue: 10000, maxValue: null, approverRole: null,
      requiredApprovals: 2, allowSelfApproval: true, order: 0, active: true, notes: '',
    })) as { id: string }
    createdRuleIds.push(highValueRule.id)

    // Acima do piso: cai na regra de 2 aprovações.
    const highOutcome = await approvalService.recordApproval('purchase_order', documentIdHigh, 15000, user.id, user.id, user.role)
    expect(highOutcome.complete).toBe(false)
    expect(highOutcome.approvalsNeeded).toBe(2)

    // Abaixo do piso: nenhuma regra cobre — cai na política implícita (1 aprovação já completa).
    const lowOutcome = await approvalService.recordApproval('purchase_order', documentIdLow, 500, user.id, user.id, user.role)
    expect(lowOutcome.complete).toBe(true)
    expect(lowOutcome.approvalsNeeded).toBe(1)
  })

  it('7. Regra inativa (active=false) nunca se aplica', async () => {
    const user = await createTestUser('approval-inactive')
    createdUserIds.push(user.id)
    const documentId = 'doc-inactive-1'
    createdDocumentIds.push(documentId)

    const rule = (await approvalService.createRule({
      documentType: 'quote', minValue: null, maxValue: null, approverRole: null,
      requiredApprovals: 5, allowSelfApproval: true, order: 0, active: false, notes: '',
    })) as { id: string }
    createdRuleIds.push(rule.id)

    const outcome = await approvalService.recordApproval('quote', documentId, 1000, user.id, user.id, user.role)
    expect(outcome.complete).toBe(true) // ignora a regra de 5 aprovações porque está inativa, usa a política implícita
  })

  it('8. CRUD de regras: recusa minValue maior que maxValue', async () => {
    await expect(
      approvalService.createRule({
        documentType: 'quote', minValue: 100, maxValue: 50, approverRole: null,
        requiredApprovals: 1, allowSelfApproval: true, order: 0, active: true, notes: '',
      })
    ).rejects.toThrow(/valor mínimo não pode ser maior/)
  })

  it('9. CRUD de regras: cria, lista, atualiza e exclui', async () => {
    const created = (await approvalService.createRule({
      documentType: 'requisition', minValue: null, maxValue: null, approverRole: null,
      requiredApprovals: 1, allowSelfApproval: true, order: 0, active: true, notes: 'regra de teste',
    })) as { id: string }
    createdRuleIds.push(created.id)

    const list = await approvalService.listRules()
    expect(list.some((r) => r.id === created.id)).toBe(true)

    const updated = (await approvalService.updateRule(created.id, {
      documentType: 'requisition', minValue: null, maxValue: null, approverRole: null,
      requiredApprovals: 3, allowSelfApproval: true, order: 0, active: true, notes: 'atualizada',
    })) as { requiredApprovals: number; notes: string }
    expect(updated.requiredApprovals).toBe(3)
    expect(updated.notes).toBe('atualizada')

    const result = await approvalService.deleteRule(created.id)
    expect(result.success).toBe(true)
    createdRuleIds.splice(createdRuleIds.indexOf(created.id), 1)

    const listAfter = await approvalService.listRules()
    expect(listAfter.some((r) => r.id === created.id)).toBe(false)
  })
})
