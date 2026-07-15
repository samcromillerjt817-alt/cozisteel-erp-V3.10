'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/platform/page-header'
import type { Sequence } from './types'

/** Aba "Numeração" de Configurações — lista de cartões (uma sequência de documento por cartão, salvo
 * individualmente), não um `DataTable` — poucos registros fixos, cada um é um mini-formulário, não
 * uma listagem paginável (Subetapa 11.5.9). */
export function NumeracaoTab() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/sequences')
      if (r.ok) setSequences(await r.json())
    } catch {
      toast.error('Erro ao carregar sequências')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function updateSequence(id: string, patch: Partial<Sequence>) {
    setSequences((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  async function saveSequence(seq: Sequence) {
    try {
      const r = await fetch('/api/sequences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(seq) })
      if (r.ok) toast.success('Sequência atualizada!')
      else toast.error('Erro ao salvar')
    } catch {
      toast.error('Erro ao salvar')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Numeração de Documentos" />
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : sequences.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nenhuma sequência configurada</p>
      ) : (
        <div className="space-y-4">
          {sequences.map((seq) => (
            <Card key={seq.id}>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Input value={seq.documentType} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prefixo</Label>
                    <Input value={seq.prefix || ''} onChange={(e) => updateSequence(seq.id, { prefix: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sufixo</Label>
                    <Input value={seq.suffix || ''} onChange={(e) => updateSequence(seq.id, { suffix: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Próximo Número</Label>
                    <Input type="number" value={seq.nextNumber} onChange={(e) => updateSequence(seq.id, { nextNumber: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dígitos</Label>
                    <Input type="number" value={seq.digits} onChange={(e) => updateSequence(seq.id, { digits: parseInt(e.target.value) || 4 })} />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch checked={seq.resetAnnual} onCheckedChange={(v) => updateSequence(seq.id, { resetAnnual: v })} />
                    <Label>Reset Anual</Label>
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch checked={seq.resetMonthly} onCheckedChange={(v) => updateSequence(seq.id, { resetMonthly: v })} />
                    <Label>Reset Mensal</Label>
                  </div>
                  <div className="flex items-end">
                    <div className="w-full">
                      <Label>Preview</Label>
                      <p className="font-mono text-sm text-primary bg-primary/5 rounded-md px-3 py-2">
                        {seq.prefix || ''}{String(seq.nextNumber || 0).padStart(seq.digits || 4, '0')}{seq.suffix || ''}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button size="sm" onClick={() => saveSequence(seq)}><Save className="w-4 h-4 mr-1" /> Salvar</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
