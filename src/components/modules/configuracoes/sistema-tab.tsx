'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { AUDIT_MODULES, AUDIT_ACTIONS, type AuditEntry } from './types'

interface SystemInfo {
  version?: string
  installedAt?: string
  updatedAt?: string
}

const PAGE_SIZE = 20

/**
 * Aba "Sistema" de Configurações — cartão de leitura (versão/instalação) + Logs de Auditoria, que já
 * usava `Table` do shadcn (não HTML cru) mas nunca teve filtro nenhum, apesar de
 * `auditService.list()` já suportar `module`/`action`/`from`/`to` no backend (Subetapa 11.5.9: fecha
 * essa lacuna com um `FilterBar` de módulo/ação). **Bug corrigido**: o estado `systemLoading` desta
 * tela nunca era setado para `true` em lugar nenhum do código antigo — o esqueleto de carregamento
 * nunca aparecia, mesmo com a busca em andamento. Agora é o `loading` real do próprio módulo.
 */
export function SistemaTab() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [systemLoading, setSystemLoading] = useState(false)

  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [moduleFilter, setModuleFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const loadSystemInfo = useCallback(async () => {
    setSystemLoading(true)
    try {
      const r = await fetch('/api/system/info')
      if (r.ok) setSystemInfo(await r.json())
    } catch {
      toast.error('Erro ao carregar informações do sistema')
    } finally {
      setSystemLoading(false)
    }
  }, [])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams()
      if (moduleFilter !== 'all') params.set('module', moduleFilter)
      if (actionFilter !== 'all') params.set('action', actionFilter)
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/audit?${params}`)
      if (r.ok) {
        const json = await r.json()
        setLogs(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar logs de auditoria')
    } finally {
      setLogsLoading(false)
    }
  }, [moduleFilter, actionFilter, page])

  useEffect(() => {
    loadSystemInfo()
  }, [loadSystemInfo])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  function handleModuleFilterChange(value: string) {
    setModuleFilter(value)
    setPage(1)
  }

  function handleActionFilterChange(value: string) {
    setActionFilter(value)
    setPage(1)
  }

  const columns: DataTableColumn<AuditEntry>[] = [
    { id: 'createdAt', header: 'Data', cell: (log) => <span className="whitespace-nowrap text-muted-foreground">{log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : '-'}</span> },
    { id: 'userName', header: 'Usuário', cell: (log) => <span className="font-medium">{log.userName || '-'}</span> },
    { id: 'module', header: 'Módulo', cell: (log) => <Badge variant="outline" className="text-xs">{log.module}</Badge> },
    { id: 'action', header: 'Ação', cell: (log) => <Badge variant="secondary" className="text-xs">{log.action}</Badge> },
    { id: 'details', header: 'Detalhes', cell: (log) => <span className="text-muted-foreground max-w-xs truncate block">{log.details || '-'}</span> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Informações do Sistema" />
      {systemLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Sistema</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-sm">
              <div><span className="text-muted-foreground">Versão:</span> <span className="font-medium">{systemInfo?.version || '4.0.0'}</span></div>
              <div><span className="text-muted-foreground">Instalado em:</span> <span className="font-medium">{systemInfo?.installedAt ? new Date(systemInfo.installedAt).toLocaleDateString('pt-BR') : '-'}</span></div>
              <div><span className="text-muted-foreground">Atualizado em:</span> <span className="font-medium">{systemInfo?.updatedAt ? new Date(systemInfo.updatedAt).toLocaleDateString('pt-BR') : '-'}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Logs de Auditoria</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <FilterBar onClear={() => { setModuleFilter('all'); setActionFilter('all'); setPage(1) }}>
            <Select value={moduleFilter} onValueChange={handleModuleFilterChange}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Módulo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os módulos</SelectItem>
                {AUDIT_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={handleActionFilterChange}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {AUDIT_ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterBar>

          <DataTable
            columns={columns}
            rows={logs}
            getRowId={(log) => log.id}
            loading={logsLoading}
            emptyMessage="Nenhum log encontrado"
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
