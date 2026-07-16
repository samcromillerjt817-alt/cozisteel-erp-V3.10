/* ═══════════════════════════════════════════════════════════
   COZISTEEL ERP v3.0 - Database Seed Script
   Initializes the system with default data for first boot.
   Idempotent: safe to re-run multiple times.
   ═══════════════════════════════════════════════════════════ */

import bcrypt from 'bcryptjs'
import { db } from '../src/lib/db'

// ── Seed Data ──────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { name: 'Coifas',              slug: 'coifas',              order: 1 },
  { name: 'Bancadas',            slug: 'bancadas',            order: 2 },
  { name: 'Estantes',            slug: 'estantes',            order: 3 },
  { name: 'Churrasqueiras',      slug: 'churrasqueiras',      order: 4 },
  { name: 'Acessórios',          slug: 'acessorios',          order: 5 },
]

const DEFAULT_MATERIALS = [
  { name: 'Aço Inox 304',  density: 7.93, description: 'Aço inoxidável austenítico, uso geral em cozinhas industriais' },
  { name: 'Aço Inox 316',  density: 8.00, description: 'Aço inoxidável com maior resistência à corrosão (marinho)' },
  { name: 'Alumínio',      density: 2.70, description: 'Alumínio leve, usado em peças de acabamento' },
  { name: 'Aço Carbono',   density: 7.85, description: 'Aço carbono para estruturas e suportes' },
]

const DEFAULT_SEQUENCES = [
  { documentType: 'orcamento', prefix: 'ORC-', nextNumber: 1, digits: 6 },
  { documentType: 'pedido',    prefix: 'PED-', nextNumber: 1, digits: 6 },
  { documentType: 'op',        prefix: 'OP-',  nextNumber: 1, digits: 6 },
  { documentType: 'requisicao', prefix: 'REQ-', nextNumber: 1, digits: 6 },
  { documentType: 'compra',    prefix: 'PC-',  nextNumber: 1, digits: 6 },
]

const DEFAULT_SETTINGS = [
  // ── Company Info ────────────────────────────────
  { key: 'company.name',         value: 'Cozisteel Equipamentos Inoxidaveis Ltda-ME', group: 'company', type: 'string',  label: 'Razão Social',        description: 'Nome legal da empresa' },
  { key: 'company.tradeName',    value: 'COZISTEEL',                                       group: 'company', type: 'string',  label: 'Nome Fantasia',      description: 'Nome comercial' },
  { key: 'company.cnpj',         value: '48.880.720/0001-15',                              group: 'company', type: 'string',  label: 'CNPJ',               description: 'CNPJ da empresa' },
  { key: 'company.ie',           value: '138.313.061.118',                                 group: 'company', type: 'string',  label: 'Inscrição Estadual',  description: 'IE da empresa' },
  { key: 'company.im',           value: '',                                                group: 'company', type: 'string',  label: 'Inscrição Municipal', description: 'IM da empresa' },
  { key: 'company.address',      value: 'Rua: Jaboticabeira, No 186',                      group: 'company', type: 'string',  label: 'Endereço',           description: 'Endereço da empresa' },
  { key: 'company.neighborhood', value: 'Terceira Divisao',                                group: 'company', type: 'string',  label: 'Bairro',             description: 'Bairro' },
  { key: 'city.state',           value: 'SAO PAULO - SP',                                  group: 'company', type: 'string',  label: 'Cidade / Estado',    description: 'Cidade e UF' },
  { key: 'company.cep',          value: '08383-000',                                       group: 'company', type: 'string',  label: 'CEP',                description: 'CEP da empresa' },
  { key: 'company.contact',      value: 'SERGIO MELLO',                                    group: 'company', type: 'string',  label: 'Contato',            description: 'Pessoa de contato' },
  { key: 'company.phone',        value: '(11) 2736-1376',                                  group: 'company', type: 'string',  label: 'Telefone',           description: 'Telefone principal' },
  { key: 'company.email',        value: 'comercial@cozisteel.com.br',                      group: 'company', type: 'string',  label: 'Email',              description: 'Email comercial' },
  { key: 'company.bankData',     value: 'Banco 403 Cora SCD - AG 0001 - CC 3419692-5 Chave Pix (CNPJ): 48.880.720/0001-15', group: 'company', type: 'string', label: 'Dados Bancários', description: 'Dados bancários para pagamento' },
  { key: 'company.website',      value: '',                                                group: 'company', type: 'string',  label: 'Website',            description: 'Site da empresa' },

  // ── PDF Config ─────────────────────────────────
  { key: 'pdf.logoPath',         value: '',         group: 'pdf', type: 'string',  label: 'Logo Path',          description: 'Caminho do logo para PDF' },
  { key: 'pdf.headerColor',      value: '#dc2626',  group: 'pdf', type: 'string',  label: 'Cor do Cabeçalho',  description: 'Cor primária do PDF (hex)' },
  { key: 'pdf.fontSize',         value: '10',       group: 'pdf', type: 'number',  label: 'Tamanho da Fonte',   description: 'Tamanho base da fonte' },
  { key: 'pdf.showFooter',       value: 'true',     group: 'pdf', type: 'boolean', label: 'Mostrar Rodapé',     description: 'Exibe rodapé no PDF' },
  { key: 'pdf.showWatermark',    value: 'false',    group: 'pdf', type: 'boolean', label: 'Mostrar Marca d\'Água', description: 'Exibe marca d\'água' },
  { key: 'pdf.watermarkText',    value: '',         group: 'pdf', type: 'string',  label: 'Texto da Marca d\'Água', description: 'Texto da marca d\'água' },

  // ── Numbering ─────────────────────────────────
  { key: 'numbering.orcamento.prefix', value: 'ORC-',  group: 'numbering', type: 'string', label: 'Prefixo Orçamento',  description: 'Prefixo do número de orçamento' },
  { key: 'numbering.orcamento.digits', value: '6',     group: 'numbering', type: 'number', label: 'Dígitos Orçamento',   description: 'Número de dígitos' },
  { key: 'numbering.pedido.prefix',    value: 'PED-',  group: 'numbering', type: 'string', label: 'Prefixo Pedido',      description: 'Prefixo do número de pedido' },
  { key: 'numbering.pedido.digits',    value: '6',     group: 'numbering', type: 'number', label: 'Dígitos Pedido',      description: 'Número de dígitos' },
  { key: 'numbering.op.prefix',        value: 'OP-',   group: 'numbering', type: 'string', label: 'Prefixo OP',          description: 'Prefixo do número de OP' },
  { key: 'numbering.op.digits',        value: '6',     group: 'numbering', type: 'number', label: 'Dígitos OP',          description: 'Número de dígitos' },
  { key: 'numbering.compra.prefix',    value: 'PC-',   group: 'numbering', type: 'string', label: 'Prefixo Pedido de Compra', description: 'Prefixo do número de pedido de compra' },
  { key: 'numbering.compra.digits',    value: '6',     group: 'numbering', type: 'number', label: 'Dígitos Pedido de Compra', description: 'Número de dígitos' },

  // ── Quote Defaults ────────────────────────────
  { key: 'quotes.defaultValidity',     value: '10 DIAS',                                        group: 'quotes', type: 'string', label: 'Validade Padrão',           description: 'Prazo de validade padrão' },
  { key: 'quotes.defaultDeliveryTime', value: '30 DIAS',                                        group: 'quotes', type: 'string', label: 'Prazo de Entrega Padrão',  description: 'Prazo de entrega padrão' },
  { key: 'quotes.defaultWarranty',     value: '90 DIAS CONTRA DEFEITO DE FABRICAÇÃO',           group: 'quotes', type: 'string', label: 'Garantia Padrão',          description: 'Texto de garantia padrão' },
  { key: 'quotes.defaultPaymentTerms', value: '50% NA ENTRADA + 50% ANTES DO ENVIO',            group: 'quotes', type: 'string', label: 'Condições de Pagamento',   description: 'Condições de pagamento padrão' },
  { key: 'quotes.defaultConditions',   value: 'ORÇAMENTO VÁLIDO POR 10 DIAS ÚTEIS. PREÇOS SUJEITOS A ALTERAÇÃO SEM AVISO PRÉVIO.', group: 'quotes', type: 'string', label: 'Condições Gerais', description: 'Condições gerais padrão' },

  // ── Security ──────────────────────────────────
  { key: 'security.sessionTimeout',    value: '480', group: 'security', type: 'number', label: 'Timeout de Sessão (min)', description: 'Tempo de inatividade para expirar sessão' },
  { key: 'security.maxLoginAttempts',  value: '5',   group: 'security', type: 'number', label: 'Tentativas de Login',     description: 'Máximo de tentativas antes de bloquear' },
  { key: 'security.passwordMinLength', value: '8',   group: 'security', type: 'number', label: 'Comprimento Mín. Senha',  description: 'Tamanho mínimo da senha' },

  // ── Custeio (Fase 12, Subetapa 8, ADR-020) ─────
  // Valores neutros (0) até o usuário configurar — laborCost/overheadCost calculam 0 enquanto isso,
  // nunca bloqueiam a produção nem quebram o cálculo por falta de configuração.
  { key: 'custeio.laborRatePerHour', value: '0', group: 'custeio', type: 'number', label: 'Taxa de Mão de Obra (R$/hora)', description: 'Taxa única aplicada ao tempo padrão de operação da BOM' },
  { key: 'custeio.overheadPercent',  value: '0', group: 'custeio', type: 'number', label: 'Overhead (%)',                 description: 'Percentual sobre o custo de material, rateio único global' },
]

// ── Seed Functions ──────────────────────────────────────

async function seedSystemInfo(): Promise<void> {
  const existing = await db.systemInfo.findUnique({ where: { id: 'main' } })

  if (existing) {
    console.log('ℹ️  SystemInfo already exists (v' + existing.version + ')')
    return
  }

  await db.systemInfo.create({
    data: {
      id: 'main',
      version: '4.0.0',
      maintenanceMode: false,
    },
  })
  console.log('✅ SystemInfo created (v4.0.0)')
}

async function seedAdminUser(): Promise<void> {
  const existing = await db.user.findUnique({ where: { username: 'admin' } })

  if (existing) {
    console.log('ℹ️  Admin user already exists')
    return
  }

  const hashedPassword = await bcrypt.hash('cozisteel2024', 10)

  await db.user.create({
    data: {
      username: 'admin',
      name: 'Administrador',
      email: 'admin@cozisteel.com.br',
      password: hashedPassword,
      role: 'admin',
      active: true,
    },
  })
  console.log('✅ Admin user created (admin / cozisteel2024)')
}

async function seedNumberSequences(): Promise<void> {
  for (const seq of DEFAULT_SEQUENCES) {
    const existing = await db.numberSequence.findUnique({
      where: { documentType: seq.documentType },
    })

    if (existing) {
      console.log(`ℹ️  Sequence '${seq.documentType}' already exists (${existing.prefix}${String(existing.nextNumber).padStart(existing.digits, '0')})`)
      continue
    }

    const now = new Date()
    await db.numberSequence.create({
      data: {
        documentType: seq.documentType,
        prefix: seq.prefix,
        suffix: '',
        nextNumber: seq.nextNumber,
        digits: seq.digits,
        increment: 1,
        resetAnnual: false,
        resetMonthly: false,
        currentYear: now.getFullYear(),
        currentMonth: now.getMonth() + 1,
      },
    })
    console.log(`✅ NumberSequence created: ${seq.prefix}${String(seq.nextNumber).padStart(seq.digits, '0')} (digits=${seq.digits})`)
  }
}

async function seedSystemSettings(): Promise<void> {
  let created = 0

  for (const setting of DEFAULT_SETTINGS) {
    const existing = await db.systemSetting.findUnique({ where: { key: setting.key } })

    if (!existing) {
      await db.systemSetting.create({
        data: {
          key: setting.key,
          value: setting.value,
          group: setting.group,
          type: setting.type,
          label: setting.label,
          description: setting.description,
        },
      })
      created++
    }
  }

  if (created > 0) {
    console.log(`✅ ${created} system settings created`)
  } else {
    console.log('ℹ️  All system settings already exist')
  }
}

async function seedCategories(): Promise<void> {
  let created = 0

  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await db.category.findUnique({ where: { slug: cat.slug } })

    if (!existing) {
      await db.category.create({ data: cat })
      created++
    }
  }

  if (created > 0) {
    console.log(`✅ ${created} categories created: ${DEFAULT_CATEGORIES.map(c => c.name).join(', ')}`)
  } else {
    console.log('ℹ️  All categories already exist')
  }
}

async function seedMaterials(): Promise<void> {
  let created = 0

  for (const mat of DEFAULT_MATERIALS) {
    const existing = await db.material.findUnique({ where: { name: mat.name } })

    if (!existing) {
      await db.material.create({
        data: {
          name: mat.name,
          density: mat.density,
          description: mat.description,
          active: true,
        },
      })
      created++
    }
  }

  if (created > 0) {
    console.log(`✅ ${created} materials created: ${DEFAULT_MATERIALS.map(m => m.name).join(', ')}`)
  } else {
    console.log('ℹ️  All materials already exist')
  }
}

// ── Main ───────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('')
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║   COZISTEEL ERP v3.0 — Database Seed            ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')

  await seedSystemInfo()
  await seedAdminUser()
  await seedNumberSequences()
  await seedSystemSettings()
  await seedCategories()
  await seedMaterials()

  console.log('')
  console.log('🎉 Seed completed successfully!')
  console.log('')
}

main()
  .catch((error: unknown) => {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })