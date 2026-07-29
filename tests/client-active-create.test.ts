import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { clientService } from '@/app/services/client.service'
import { validateDto, createClientSchema } from '@/app/dto'

/**
 * ADR-022 (Fase UX-6/7, achado #24) — achado do /codex review antes do fechamento: o switch "Cliente
 * ativo" do formulário de criação era ignorado silenciosamente porque `createClientSchema` não
 * declarava `active`, então `validateDto` (Zod) descartava o campo antes mesmo de chegar ao Service —
 * o Prisma aplicava seu próprio default `true` independente do que a UI enviasse.
 */
describe('Clientes — active respeitado na criação (Fase UX-7, achado do /codex review)', () => {
  const createdIds: string[] = []

  afterAll(async () => {
    await db.client.deleteMany({ where: { id: { in: createdIds } } })
  })

  it('cria cliente inativo quando active: false é enviado', async () => {
    const dto = validateDto(createClientSchema, { corporateName: 'Cliente Inativo Teste', active: false })
    const created = (await clientService.create(dto)) as { id: string; active: boolean }
    createdIds.push(created.id)

    expect(created.active).toBe(false)
    const fetched = await db.client.findUnique({ where: { id: created.id } })
    expect(fetched?.active).toBe(false)
  })

  it('mantém o default true quando active não é enviado', async () => {
    const dto = validateDto(createClientSchema, { corporateName: 'Cliente Default Teste' })
    const created = (await clientService.create(dto)) as { id: string; active: boolean }
    createdIds.push(created.id)

    expect(created.active).toBe(true)
  })
})
