'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { AsyncButton } from '@/components/domain/async-button'
import { PageHeader } from '@/components/platform/page-header'
import type { AdminQueryResult } from './types'

/**
 * Aba "Console SQL" de Configurações (ADR-021, Subetapa 3) — consulta somente-leitura direta ao
 * banco, metade "sem escrita" da postura híbrida decidida no ADR-021 (Parte 3, opção "c"). O backend
 * (`AdminQueryService`) já rejeita qualquer coisa que não comece com SELECT/WITH — esta tela não
 * duplica essa validação, só exibe o erro que a API devolver.
 */
export function ConsoleTab() {
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<AdminQueryResult | null>(null)
  const [error, setError] = useState('')

  async function run() {
    setError('')
    setResult(null)
    try {
      const r = await fetch('/api/admin/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      })
      const json = await r.json()
      if (r.ok) {
        setResult(json)
        if (json.truncated) toast.warning('Resultado truncado em 500 linhas')
      } else {
        setError(json.error || 'Erro ao executar consulta')
      }
    } catch {
      setError('Erro ao executar consulta')
    }
  }

  const columns = result && result.rows.length > 0 ? Object.keys(result.rows[0]) : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Console SQL"
        description="Consultas SELECT somente-leitura, para diagnóstico. Nenhuma escrita é permitida aqui — correções de dado usam a aba Correções."
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Consulta</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={6}
            placeholder="SELECT * FROM Product WHERE active = true LIMIT 20"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            className="font-mono text-sm"
          />
          <div className="flex justify-end">
            <AsyncButton onClick={run} disabled={!sql.trim()}>Executar</AsyncButton>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader><CardTitle className="text-base">Resultado ({result.rows.length}{result.truncated ? '+' : ''} linhas)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {result.rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma linha retornada</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {columns.map((c) => <th key={c} className="text-left p-2 font-medium whitespace-nowrap">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {columns.map((c) => (
                        <td key={c} className="p-2 whitespace-nowrap max-w-xs truncate">{formatCell(row[c])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
