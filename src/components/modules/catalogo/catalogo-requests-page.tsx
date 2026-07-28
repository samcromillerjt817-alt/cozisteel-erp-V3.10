'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Eye, ExternalLink, Archive, Link2 } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { StatusBadge } from '@/components/domain/status-badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { statusLabels } from '@/lib/format'

const CATALOG_REQUEST_STATUS_LABELS: Record<string, string> = {
  recebida: 'Recebida', em_triagem: 'Em triagem', convertida: 'Convertida', arquivada: 'Arquivada',
}

const INTERNAL_STAGE_LABELS: Record<string, string> = {
  aguardando_triagem: 'Aguardando triagem',
  analise_comercial: 'Em análise comercial',
  analise_tecnica: 'Em análise técnica',
  aguardando_cliente: 'Aguardando informações do cliente',
  em_elaboracao: 'Orçamento em elaboração',
}

interface CatalogRequestRow {
  id: string
  protocol: string
  status: string
  clientName: string
  clientCompany: string
  createdAt: string
  _count: { items: number }
  quote: { id: string; number: string; status: string; internalStage: string | null; user: { id: string; name: string } | null } | null
}

interface CatalogRequestItemDetail {
  id: string
  quantity: number
  width: number | null
  height: number | null
  length: number | null
  material: string
  finish: string
  voltage: string
  operationSide: string
  accessories: string
  modifications: string
  notes: string
  isCustomized: boolean
  product: { id: string; name: string; internalCode: string }
}

interface CatalogRequestDetail extends CatalogRequestRow {
  clientCpfCnpj: string
  clientContact: string
  clientEmail: string
  clientPhone: string
  clientCity: string
  clientState: string
  generalNotes: string
  archivedReason: string
  items: CatalogRequestItemDetail[]
}

const PAGE_SIZE = 20

interface CatalogoRequestsPageProps {
  onNavigateToOrcamento: (quoteId: string) => void
}

/**
 * Fila de triagem do Catálogo Digital Público (ADR-026, Fase 4) — não duplica a tela de Orçamento:
 * "Abrir Orçamento" navega pro módulo Orçamentos de verdade (mesmo padrão já usado por Requisições/
 * Pedidos). Esta tela só mostra o que é específico da solicitação (personalização, protocolo,
 * dados do lead) + permite arquivar o intake, sem nunca mexer no Orçamento já gerado.
 */
export function CatalogoRequestsPage({ onNavigateToOrcamento }: CatalogoRequestsPageProps) {
  const [rows, setRows] = useState<CatalogRequestRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<CatalogRequestDetail | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<CatalogRequestRow | null>(null)
  const [archiveReason, setArchiveReason] = useState('')
  const [assignableUsers, setAssignableUsers] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/catalog-requests/assignable-users')
      .then((r) => r.json())
      .then((json) => setAssignableUsers(json.data || []))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const r = await fetch(`/api/catalog-requests?${params.toString()}`)
      const json = await r.json()
      setRows(json.data || [])
      setTotal(json.total || 0)
    } catch {
      toast.error('Erro ao carregar solicitações do catálogo')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  function copyCatalogLink() {
    const url = `${window.location.origin}/catalogo`
    navigator.clipboard.writeText(url)
    toast.success('Link do catálogo copiado — envie para o cliente')
  }

  async function openDetail(row: CatalogRequestRow) {
    try {
      const r = await fetch(`/api/catalog-requests/${row.id}`)
      if (!r.ok) throw new Error()
      setDetail(await r.json())
    } catch {
      toast.error('Erro ao carregar detalhes da solicitação')
    }
  }

  async function updateTriagem(patch: { userId?: string; internalStage?: string }) {
    if (!detail?.quote) return
    try {
      const r = await fetch(`/api/quotes/${detail.quote.id}/triagem`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!r.ok) throw new Error()
      toast.success('Orçamento atualizado')
      await openDetail(detail)
      load()
    } catch {
      toast.error('Erro ao atualizar orçamento')
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return
    try {
      const r = await fetch(`/api/catalog-requests/${archiveTarget.id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: archiveReason }),
      })
      if (!r.ok) throw new Error()
      toast.success('Solicitação arquivada')
      setArchiveTarget(null)
      setArchiveReason('')
      load()
    } catch {
      toast.error('Erro ao arquivar solicitação')
    }
  }

  const columns: DataTableColumn<CatalogRequestRow>[] = [
    { id: 'protocol', header: 'Protocolo', cell: (r) => <span className="font-mono font-medium text-primary">{r.protocol}</span> },
    { id: 'client', header: 'Cliente', cell: (r) => r.clientCompany || r.clientName || '-' },
    { id: 'date', header: 'Recebida em', cell: (r) => new Date(r.createdAt).toLocaleString('pt-BR'), hideBelow: 'sm' },
    { id: 'items', header: 'Itens', align: 'right', cell: (r) => r._count.items },
    { id: 'status', header: 'Status', cell: (r) => <StatusBadge domain="catalogRequest" status={r.status} label={CATALOG_REQUEST_STATUS_LABELS[r.status] || r.status} /> },
    {
      id: 'quote', header: 'Orçamento', cell: (r) => r.quote ? (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{r.quote.number}</span>
          <StatusBadge domain="quote" status={r.quote.status} label={statusLabels[r.quote.status] || r.quote.status} />
        </div>
      ) : '-',
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Catálogo Digital — Solicitações"
        actions={
          <Button variant="outline" onClick={copyCatalogLink}>
            <Link2 className="w-4 h-4 mr-1" /> Copiar link do catálogo
          </Button>
        }
      />

      <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="convertida">Convertidas</TabsTrigger>
          <TabsTrigger value="arquivada">Arquivadas</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        loading={loading}
        emptyMessage="Nenhuma solicitação recebida ainda"
        rowActions={[
          { label: 'Ver detalhes', icon: <Eye />, onClick: (r) => openDetail(r) },
          { label: 'Abrir Orçamento', icon: <ExternalLink />, onClick: (r) => r.quote && onNavigateToOrcamento(r.quote.id), disabled: (r) => !r.quote },
          { label: 'Arquivar', icon: <Archive />, onClick: (r) => setArchiveTarget(r), disabled: (r) => r.status === 'arquivada' },
        ]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>Solicitação {detail.protocol}</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4 space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">Cliente</p>
                  <p className="text-sm">{detail.clientName}{detail.clientCompany ? ` — ${detail.clientCompany}` : ''}</p>
                  <p className="text-xs text-slate-500">{detail.clientCpfCnpj} {detail.clientContact && `· ${detail.clientContact}`}</p>
                  <p className="text-xs text-slate-500">{detail.clientEmail} {detail.clientPhone && `· ${detail.clientPhone}`}</p>
                  <p className="text-xs text-slate-500">{[detail.clientCity, detail.clientState].filter(Boolean).join(' - ')}</p>
                </div>

                <Separator />

                {detail.quote && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Responsável</Label>
                      <Select value={detail.quote.user?.id || ''} onValueChange={(v) => updateTriagem({ userId: v })}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{assignableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Etapa de triagem</Label>
                      <Select value={detail.quote.internalStage || ''} onValueChange={(v) => updateTriagem({ internalStage: v })}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(INTERNAL_STAGE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="text-sm font-medium mb-2">Itens ({detail.items.length})</p>
                  <div className="space-y-2">
                    {detail.items.map((item) => (
                      <div key={item.id} className="border rounded-md p-2 text-sm space-y-0.5">
                        <div className="flex justify-between">
                          <span className="font-medium">{item.product.name}</span>
                          <span className="text-slate-500">Qtd. {item.quantity}</span>
                        </div>
                        {item.isCustomized && <p className="text-xs text-amber-600 font-medium">PERSONALIZADO — revisar viabilidade</p>}
                        {(item.width || item.height || item.length) && (
                          <p className="text-xs text-slate-500">{item.width || '-'} x {item.height || '-'} x {item.length || '-'} cm</p>
                        )}
                        {[item.material, item.finish, item.voltage, item.operationSide].filter(Boolean).length > 0 && (
                          <p className="text-xs text-slate-500">{[item.material, item.finish, item.voltage, item.operationSide].filter(Boolean).join(' · ')}</p>
                        )}
                        {item.accessories && <p className="text-xs text-slate-500">Acessórios: {item.accessories}</p>}
                        {item.modifications && <p className="text-xs text-slate-500">Modificações: {item.modifications}</p>}
                        {item.notes && <p className="text-xs text-slate-500">Obs.: {item.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                {detail.generalNotes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-1">Observações gerais</p>
                      <p className="text-sm text-slate-600">{detail.generalNotes}</p>
                    </div>
                  </>
                )}

                {detail.archivedReason && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-1">Motivo do arquivamento</p>
                      <p className="text-sm text-slate-600">{detail.archivedReason}</p>
                    </div>
                  </>
                )}

                {detail.quote && (
                  <Button className="w-full" onClick={() => onNavigateToOrcamento(detail.quote!.id)}>
                    <ExternalLink className="w-4 h-4 mr-1" /> Abrir Orçamento {detail.quote.number}
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Arquivar solicitação {archiveTarget?.protocol}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea rows={3} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} />
          </div>
          <p className="text-xs text-slate-500">O Orçamento já gerado não é alterado — continua existindo normalmente.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmArchive}>Arquivar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
