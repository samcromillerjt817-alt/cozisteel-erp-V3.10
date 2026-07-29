'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AsyncButton } from '@/components/domain/async-button'
import { PageHeader } from '@/components/platform/page-header'
import type { AdminQueryResult, AdminWriteQueryResult } from './types'

/**
 * Aba "Console SQL" de Configurações (ADR-021, Subetapa 3 + addendum de escrita controlada) — 2
 * modos:
 *  - "Consulta": somente-leitura direta ao banco (`AdminQueryService`), como sempre foi.
 *  - "Correção": UPDATE/DELETE/INSERT controlado, pedido explícito do usuário por acesso direto ao
 *    banco pra correções ("parecido com o APSDU do TOTVS"), depois de confirmar que aceita esse
 *    risco em vez de manter só leitura + receitas. Sempre exige PRÉ-VISUALIZAR antes de aplicar —
 *    o backend (`AdminWriteQueryService`) roda a instrução de verdade numa transação e desfaz nesse
 *    passo, só persistindo quando o usuário confirma explicitamente depois de ver o antes/depois.
 */
export function ConsoleTab() {
  const [mode, setMode] = useState<'read' | 'write'>('read')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Console SQL"
        description="Consulta somente-leitura para diagnóstico, ou correção direta controlada (sempre com pré-visualização antes de aplicar)."
      />
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'read' | 'write')}>
        <TabsList>
          <TabsTrigger value="read">Consulta</TabsTrigger>
          <TabsTrigger value="write">Correção</TabsTrigger>
        </TabsList>
        <TabsContent value="read"><ReadConsole /></TabsContent>
        <TabsContent value="write"><WriteConsole /></TabsContent>
      </Tabs>
    </div>
  )
}

function ReadConsole() {
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
    <div className="space-y-6 pt-4">
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
            <ResultTable rows={result.rows} columns={columns} emptyLabel="Nenhuma linha retornada" />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function WriteConsole() {
  const [sql, setSql] = useState('')
  const [preview, setPreview] = useState<AdminWriteQueryResult | null>(null)
  const [previewedSql, setPreviewedSql] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState<AdminWriteQueryResult | null>(null)

  function onSqlChange(value: string) {
    setSql(value)
    // Qualquer edição invalida o preview anterior — nunca deixa confirmar em cima de um preview
    // que não corresponde mais ao texto atual da instrução.
    setPreview(null)
    setPreviewedSql(null)
    setApplied(null)
  }

  async function runQuery(commit: boolean) {
    setError('')
    if (!commit) { setPreview(null); setApplied(null) }
    try {
      const r = await fetch('/api/admin/query/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, commit }),
      })
      const json = await r.json()
      if (!r.ok) {
        setError(json.error || 'Erro ao executar instrução')
        return
      }
      if (commit) {
        setApplied(json)
        setPreview(null)
        setPreviewedSql(null)
        toast.success(`Aplicado: ${json.affectedCount} linha(s) afetada(s) em "${json.table}"`)
      } else {
        setPreview(json)
        setPreviewedSql(sql)
        if (json.truncatedPreview) toast.warning(`Pré-visualização truncada em 50 linhas (${json.affectedCount} linha(s) afetada(s) no total)`)
      }
    } catch {
      setError('Erro ao executar instrução')
    }
  }

  const canConfirm = preview !== null && previewedSql === sql && !preview.committed

  return (
    <div className="space-y-6 pt-4">
      <Card className="border-amber-300 bg-amber-50/50">
        <CardContent className="pt-6 text-sm text-amber-900 space-y-1">
          <p className="font-medium">Correção direta no banco de produção.</p>
          <p>UPDATE/DELETE exigem WHERE. Sempre pré-visualize antes de aplicar — a pré-visualização roda a instrução de verdade e desfaz, sem persistir nada. Qualquer edição no texto invalida a pré-visualização anterior.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Instrução (UPDATE, DELETE ou INSERT — 1 por vez)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={6}
            placeholder="UPDATE Client SET email = 'novo@exemplo.com' WHERE id = '...'"
            value={sql}
            onChange={(e) => onSqlChange(e.target.value)}
            className="font-mono text-sm"
          />
          <div className="flex justify-end gap-2">
            <AsyncButton variant="outline" onClick={() => runQuery(false)} disabled={!sql.trim()}>
              Pré-visualizar
            </AsyncButton>
            <AsyncButton variant="destructive" onClick={() => runQuery(true)} disabled={!canConfirm}>
              Confirmar e aplicar
            </AsyncButton>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pré-visualização — {preview.statementType} em &quot;{preview.table}&quot;, {preview.affectedCount} linha(s) afetada(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 overflow-x-auto">
            <div>
              <p className="text-sm font-medium mb-2">Antes</p>
              <ResultTable rows={preview.beforeRows} columns={columnsOf(preview.beforeRows)} emptyLabel="Nenhuma linha (INSERT — não existia antes)" />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Depois</p>
              <ResultTable rows={preview.afterRows} columns={columnsOf(preview.afterRows)} emptyLabel="Nenhuma linha (DELETE — deixou de existir)" />
            </div>
          </CardContent>
        </Card>
      )}

      {applied && (
        <Card className="border-green-300 bg-green-50/50">
          <CardHeader><CardTitle className="text-base">Aplicado com sucesso</CardTitle></CardHeader>
          <CardContent className="space-y-4 overflow-x-auto">
            <p className="text-sm">{applied.statementType} em &quot;{applied.table}&quot; — {applied.affectedCount} linha(s) afetada(s). Registrado em Auditoria.</p>
            <div>
              <p className="text-sm font-medium mb-2">Estado final</p>
              <ResultTable rows={applied.afterRows} columns={columnsOf(applied.afterRows)} emptyLabel="Sem linhas (DELETE)" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function columnsOf(rows: Record<string, unknown>[]): string[] {
  return rows.length > 0 ? Object.keys(rows[0]) : []
}

function ResultTable({ rows, columns, emptyLabel }: { rows: Record<string, unknown>[]; columns: string[]; emptyLabel: string }) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{emptyLabel}</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          {columns.map((c) => <th key={c} className="text-left p-2 font-medium whitespace-nowrap">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b last:border-0">
            {columns.map((c) => (
              <td key={c} className="p-2 whitespace-nowrap max-w-xs truncate">{formatCell(row[c])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
