'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

/**
 * Empresa e PDF leem/gravam o mesmo `SystemSetting` (chave-valor livre, agrupado só na resposta da
 * API) — cada aba busca sua própria cópia via este hook (independente, não estado compartilhado),
 * o que corrige de quebra o bug encontrado na auditoria original: a aba PDF dependia silenciosamente
 * de Empresa já ter carregado `settings` primeiro (só funcionava por `configSub` sempre iniciar em
 * "empresa"). Cada aba agora busca sozinha, na hora que monta.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/settings')
      if (r.ok) {
        const json = await r.json()
        // `GET /api/settings` (settingService.getAllGrouped()) devolve `Record<grupo, SystemSetting[]>`
        // — cada grupo é um ARRAY de registros completos ({id,key,value,group,...}), nunca um mapa
        // chave→valor já achatado. O achatamento antigo (herdado de page.tsx, `Object.entries(group)`
        // tratando o array como se already fosse o mapa) produzia `flat["0"] = <objeto inteiro>`,
        // `flat["1"] = ...` — por isso o PUT de volta enviava `{ key: "0", value: <objeto> }` e o
        // Prisma rejeitava (`Argument value: Expected String, provided Object`). Corrigido lendo o
        // formato real: cada grupo é um array de `{key, value}`.
        const flat: Record<string, string> = {}
        for (const group of Object.values(json) as Array<{ key: string; value: string }>[]) {
          for (const setting of group) {
            flat[setting.key] = setting.value
          }
        }
        setSettings(flat)
      }
    } catch {
      toast.error('Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    setSaving(true)
    try {
      const body = Object.entries(settings).map(([key, value]) => ({ key, value }))
      const r = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) toast.success('Configurações salvas!')
      else toast.error('Erro ao salvar')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return { settings, setSettings, loading, saving, save }
}
