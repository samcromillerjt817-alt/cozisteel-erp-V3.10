'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/domain/search-input'

interface MaterialBatchHit { id: string; batchNumber: string; materialName: string; receivedAt: string }
interface ProductBatchHit { id: string; batchNumber: string; productName: string; producedAt: string }

interface MaterialBatchNode {
  materialBatchId: string; materialName: string; batchNumber: string
  supplierName: string | null; purchaseOrderNumber: string | null
  receivedAt: string; quantityReceived: number; quantityAvailable: number
}
interface ProductBatchNode {
  productBatchId: string; productName: string; productionOrderNumber: string
  batchNumber: string; quantityProduced: number; producedAt: string
}
interface ForwardResult {
  origin: MaterialBatchNode
  consumedBy: Array<{ productBatch: ProductBatchNode; edge: { quantityConsumed: number; depth: number } }>
}
interface BackwardResult {
  origin: ProductBatchNode
  materialOrigins: Array<{ materialBatch: MaterialBatchNode; edge: { quantityConsumed: number; depth: number } }>
  subassemblyBatches: Array<{ productBatch: ProductBatchNode; edge: { quantityConsumed: number; depth: number } }>
}

/**
 * Aba "Rastreabilidade" de Estoque (ADR-022, Fase UX-3, achado #06) — `BatchTraceabilityService`
 * existia desde o ADR-013 (Fase 10) sem nenhuma rota nem tela; primeira exposição, só consulta
 * (decisão do usuário: menor risco antes de qualquer ação sobre o resultado).
 */
export function BatchTraceabilityTab() {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [materialHits, setMaterialHits] = useState<MaterialBatchHit[]>([])
  const [productHits, setProductHits] = useState<ProductBatchHit[]>([])
  const [searched, setSearched] = useState(false)

  const [forward, setForward] = useState<ForwardResult | null>(null)
  const [backward, setBackward] = useState<BackwardResult | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)

  async function search() {
    if (!query.trim()) return
    setSearching(true)
    setForward(null)
    setBackward(null)
    try {
      const r = await fetch(`/api/batches/search?q=${encodeURIComponent(query)}`)
      if (r.ok) {
        const json = await r.json()
        setMaterialHits(json.materialBatches || [])
        setProductHits(json.productBatches || [])
      } else {
        toast.error('Erro ao buscar lote')
      }
    } catch {
      toast.error('Erro ao buscar lote')
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }

  async function traceForward(id: string) {
    setTraceLoading(true)
    setBackward(null)
    try {
      const r = await fetch(`/api/batches/material/${id}/forward`)
      if (r.ok) setForward(await r.json())
      else toast.error('Erro ao rastrear lote')
    } catch {
      toast.error('Erro ao rastrear lote')
    } finally {
      setTraceLoading(false)
    }
  }

  async function traceBackward(id: string) {
    setTraceLoading(true)
    setForward(null)
    try {
      const r = await fetch(`/api/batches/product/${id}/backward`)
      if (r.ok) setBackward(await r.json())
      else toast.error('Erro ao rastrear lote')
    } catch {
      toast.error('Erro ao rastrear lote')
    } finally {
      setTraceLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por número de lote (matéria-prima ou produto)..." />
        <Button onClick={search} disabled={searching || !query.trim()}>
          <Search className="w-4 h-4" /> Buscar
        </Button>
      </div>

      {searched && materialHits.length === 0 && productHits.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum lote encontrado com esse número.</p>
      )}

      {materialHits.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Lotes de Matéria-Prima</p>
            {materialHits.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                <div>
                  <span className="font-mono">{h.batchNumber}</span> — {h.materialName}
                  <span className="text-muted-foreground"> · recebido em {new Date(h.receivedAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => traceForward(h.id)}>Rastrear (forward)</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {productHits.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Lotes de Produto</p>
            {productHits.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                <div>
                  <span className="font-mono">{h.batchNumber}</span> — {h.productName}
                  <span className="text-muted-foreground"> · produzido em {new Date(h.producedAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => traceBackward(h.id)}>Rastrear (backward)</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {traceLoading && <p className="text-sm text-muted-foreground">Rastreando...</p>}

      {forward && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Origem</p>
              <p><span className="font-mono">{forward.origin.batchNumber}</span> — {forward.origin.materialName} ({forward.origin.quantityAvailable}/{forward.origin.quantityReceived} disponível{forward.origin.supplierName ? `, fornecedor ${forward.origin.supplierName}` : ''})</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Consumido por</p>
              {forward.consumedBy.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este lote ainda não foi consumido por nenhuma produção.</p>
              ) : (
                <div className="space-y-1.5">
                  {forward.consumedBy.map((c) => (
                    <div key={c.productBatch.productBatchId} className="text-sm border rounded px-3 py-1.5 flex justify-between">
                      <span style={{ paddingLeft: `${(c.edge.depth - 1) * 16}px` }}>
                        <span className="font-mono">{c.productBatch.batchNumber}</span> — {c.productBatch.productName} (OP {c.productBatch.productionOrderNumber})
                      </span>
                      <span className="text-muted-foreground">{c.edge.quantityConsumed} consumido</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {backward && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Origem</p>
              <p><span className="font-mono">{backward.origin.batchNumber}</span> — {backward.origin.productName} (OP {backward.origin.productionOrderNumber}, {backward.origin.quantityProduced} produzido)</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Origem de matéria-prima</p>
              {backward.materialOrigins.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lote de matéria-prima rastreado (produto sem componentes lote-controlados).</p>
              ) : (
                <div className="space-y-1.5">
                  {backward.materialOrigins.map((m) => (
                    <div key={m.materialBatch.materialBatchId} className="text-sm border rounded px-3 py-1.5 flex justify-between">
                      <span style={{ paddingLeft: `${(m.edge.depth - 1) * 16}px` }}>
                        <span className="font-mono">{m.materialBatch.batchNumber}</span> — {m.materialBatch.materialName}
                        {m.materialBatch.supplierName ? ` (${m.materialBatch.supplierName})` : ''}
                      </span>
                      <span className="text-muted-foreground">{m.edge.quantityConsumed} consumido</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {backward.subassemblyBatches.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Subconjuntos intermediários</p>
                <div className="space-y-1.5">
                  {backward.subassemblyBatches.map((s) => (
                    <div key={s.productBatch.productBatchId} className="text-sm border rounded px-3 py-1.5 flex justify-between">
                      <span style={{ paddingLeft: `${(s.edge.depth - 1) * 16}px` }}>
                        <span className="font-mono">{s.productBatch.batchNumber}</span> — {s.productBatch.productName}
                      </span>
                      <span className="text-muted-foreground">{s.edge.quantityConsumed} consumido</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
