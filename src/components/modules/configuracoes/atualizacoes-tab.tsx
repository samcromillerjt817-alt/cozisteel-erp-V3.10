'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/platform/page-header'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { StatusBadge } from '@/components/domain/status-badge'
import { useConfirm } from '@/components/domain/confirm-dialog'
import type { PatchLogEntry } from './types'

interface AtualizacoesTabProps {
  isAdmin: boolean
}

const PATCH_STATUS_LABELS: Record<string, string> = {
  success: 'Sucesso', failed: 'Falhou', rolled_back: 'Revertido',
}

/**
 * Aba "Atualizações" de Configurações (Subetapa 11.5.9). Histórico já usava `Table` do shadcn — vira
 * `DataTable` sem paginação de servidor (o endpoint devolve os 50 mais recentes, sem `page`/`limit`;
 * manter esse limite tal como está, sem inventar paginação de backend que não existia). Upload/status
 * de patch continua um widget próprio, não é uma tabela.
 */
export function AtualizacoesTab({ isAdmin }: AtualizacoesTabProps) {
  const confirmAction = useConfirm()
  const [history, setHistory] = useState<PatchLogEntry[]>([])
  const [currentVersion, setCurrentVersion] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [polling, setPolling] = useState(false)
  const [status, setStatus] = useState<{ state: string; message: string } | null>(null)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/system/patches/history')
      if (r.ok) {
        const json = await r.json()
        setHistory(json.history || [])
        setCurrentVersion(json.currentVersion || '')
      }
    } catch {
      toast.error('Erro ao carregar histórico de atualizações')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    if (!polling) return
    const interval = setInterval(async () => {
      try {
        const r = await fetch('/api/system/patches/status')
        if (r.ok) {
          const json = await r.json()
          setStatus(json)
          if (json.state === 'done' || json.state === 'failed') {
            setPolling(false)
            loadHistory()
            if (json.state === 'done') toast.success(json.message)
            else toast.error(json.message)
          }
        }
      } catch {
        // servidor pode estar reiniciando — tenta de novo no próximo tick
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [polling, loadHistory])

  async function uploadPatch(file: File) {
    if (!file.name.endsWith('.zip')) {
      toast.error('O patch precisa ser um arquivo .zip')
      return
    }
    if (!(await confirmAction('Aplicar esta atualização agora? O sistema fará backup automático, mas pode reiniciar e ficar indisponível por alguns instantes.'))) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await fetch('/api/system/patches/upload', { method: 'POST', body: formData })
      const json = await r.json()
      if (r.ok) {
        toast.success(json.message || 'Patch enviado, aplicando...')
        setPolling(true)
      } else {
        toast.error(json.error || 'Erro ao enviar patch')
      }
    } catch {
      toast.error('Erro ao enviar patch (se o sistema reiniciou, isso pode ser esperado — aguarde e recarregue a página)')
      setPolling(true)
    } finally {
      setUploading(false)
    }
  }

  const columns: DataTableColumn<PatchLogEntry>[] = [
    { id: 'createdAt', header: 'Data', cell: (p) => <span className="whitespace-nowrap">{new Date(p.createdAt).toLocaleString('pt-BR')}</span> },
    { id: 'version', header: 'Versão', cell: (p) => <span className="font-mono">{p.fromVersion} → {p.toVersion}</span> },
    { id: 'title', header: 'Título', cell: (p) => p.title || '-' },
    { id: 'appliedVia', header: 'Via', cell: (p) => p.appliedVia === 'upload' ? 'Upload' : 'Terminal' },
    { id: 'status', header: 'Status', cell: (p) => <StatusBadge domain="patch" status={p.status} label={PATCH_STATUS_LABELS[p.status] || p.status} /> },
    { id: 'user', header: 'Usuário', cell: (p) => p.user?.name || '-' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Atualizações do Sistema" />

      <Card>
        <CardHeader><CardTitle className="text-base">Versão Atual</CardTitle></CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-primary">{currentVersion || '-'}</p>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Aplicar Nova Atualização</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Envie o arquivo de patch (.zip) recebido. O sistema faz backup automático do código e
              do banco antes de aplicar — se algo der errado no meio do processo, reverte sozinho para
              a versão anterior. Durante a atualização (1–3 minutos), o sistema pode ficar
              temporariamente indisponível enquanto reinicia.
            </p>
            <div>
              <input
                type="file" accept=".zip" id="patch-upload" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPatch(f); e.target.value = '' }}
              />
              <Button disabled={uploading || polling} onClick={() => document.getElementById('patch-upload')?.click()}>
                {uploading ? 'Enviando...' : 'Selecionar arquivo de patch (.zip)'}
              </Button>
            </div>
            {status && polling && (
              <div className="flex items-center gap-3 bg-muted/50 rounded p-3">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                <span className="text-sm">{status.message}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de Atualizações</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={history}
            getRowId={(p) => p.id}
            loading={loading}
            emptyMessage="Nenhuma atualização registrada ainda"
          />
        </CardContent>
      </Card>
    </div>
  )
}
