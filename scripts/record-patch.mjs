#!/usr/bin/env node
/**
 * scripts/record-patch.mjs
 *
 * Registra no banco (SystemInfo + PatchLog) que uma atualização foi aplicada.
 * Roda como script Node standalone (usa @prisma/client direto, sem depender do
 * servidor Next.js estar de pé) — por isso funciona tanto no fim do
 * apply-patch.sh (terminal) quanto disparado pelo upload dentro do sistema.
 *
 * Uso:
 *   node scripts/record-patch.mjs --to=3.1.0 --from=3.0.0 --title="..." \
 *     --description="..." --via=terminal|upload --status=success|failed \
 *     --error="" --user=<userId ou vazio>
 */
import { PrismaClient } from '@prisma/client'

function parseArgs() {
  const args = {}
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([a-zA-Z]+)=(.*)$/)
    if (m) args[m[1]] = m[2]
  }
  return args
}

async function main() {
  const args = parseArgs()
  const toVersion = args.to
  if (!toVersion) {
    console.error('Uso: node record-patch.mjs --to=X.Y.Z [--from=] [--title=] [--description=] [--via=] [--status=] [--error=] [--user=]')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  try {
    const current = await prisma.systemInfo.findUnique({ where: { id: 'main' } })
    const fromVersion = args.from || current?.version || '0.0.0'
    const status = args.status || 'success'

    if (status === 'success') {
      await prisma.systemInfo.upsert({
        where: { id: 'main' },
        update: { version: toVersion },
        create: { id: 'main', version: toVersion },
      })
    }

    await prisma.patchLog.create({
      data: {
        fromVersion,
        toVersion,
        title: args.title || '',
        description: args.description || '',
        appliedVia: args.via || 'terminal',
        status,
        errorMessage: args.error || '',
        userId: args.user || null,
      },
    })

    console.log(`[record-patch] Registrado: ${fromVersion} -> ${toVersion} (status=${status}, via=${args.via || 'terminal'})`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[record-patch] Erro ao registrar patch:', err)
  process.exit(1)
})
