'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Truck, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { QuantityInput } from '@/components/form/quantity-input'
import { StatusBadge } from '@/components/domain/status-badge'
import { FormDialog } from '@/components/domain/form-dialog'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { SHIPMENT_STATUS_LABELS, SHIPMENT_TRANSITIONS, type ShippableItemBalance, type ShipmentRecord } from './types'

interface ShipmentSectionProps {
  salesOrderId: string
  salesOrderStatus: string
}

const EMPTY_FORM = { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: '', proofDocument: '', notes: '' }

/**
 * ADR-023 (item 6, Decisão #3) — primeira tela de Expedição: entidade nova (`Shipment`/
 * `ShipmentItem`), máquina de estados própria (nunca misturada com a do Pedido de Venda). Só
 * habilitada quando o Pedido já está "Pronto para expedição" ou "Atendimento parcial" — criar antes
 * disso é bloqueado pelo próprio Service.
 */
export function ShipmentSection({ salesOrderId, salesOrderStatus }: ShipmentSectionProps) {
  const confirmAction = useConfirm()
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState<ShippableItemBalance[]>([])
  const [shipments, setShipments] = useState<ShipmentRecord[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/sales-orders/${salesOrderId}/shipments`)
      if (r.ok) {
        const json = await r.json()
        setBalance(json.balance || [])
        setShipments(json.shipments || [])
        const next: Record<string, number> = {}
        for (const item of json.balance || []) next[item.salesOrderItemId] = item.quantityRemaining
        setQuantities(next)
      }
    } catch {
      toast.error('Erro ao carregar expedições do pedido')
    } finally {
      setLoading(false)
    }
  }, [salesOrderId])

  useEffect(() => {
    load()
  }, [load])

  const canCreateShipment = ['ready_for_shipping', 'partially_fulfilled'].includes(salesOrderStatus)
  const hasSomethingToShip = balance.some((item) => (quantities[item.salesOrderItemId] || 0) > 0)

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(shipment: ShipmentRecord) {
    setEditingId(shipment.id)
    setForm({
      carrier: shipment.carrier, vehiclePlate: shipment.vehiclePlate, driverName: shipment.driverName,
      scheduledDate: shipment.scheduledDate ? shipment.scheduledDate.slice(0, 10) : '',
      proofDocument: shipment.proofDocument, notes: shipment.notes,
    })
    setDialogOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      if (editingId) {
        const r = await fetch(`/api/shipments/${editingId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        })
        if (r.ok) {
          toast.success('Expedição atualizada!')
          setDialogOpen(false)
          load()
        } else {
          const err = await r.json()
          toast.error(err.error || 'Erro ao atualizar expedição')
        }
      } else {
        const items = balance
          .map((item) => ({ salesOrderItemId: item.salesOrderItemId, quantity: quantities[item.salesOrderItemId] || 0 }))
          .filter((i) => i.quantity > 0)
        if (items.length === 0) { toast.error('Informe ao menos um item a expedir'); return }

        const r = await fetch(`/api/sales-orders/${salesOrderId}/shipments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, items }),
        })
        if (r.ok) {
          toast.success('Expedição criada!')
          setDialogOpen(false)
          load()
        } else {
          const err = await r.json()
          toast.error(err.error || 'Erro ao criar expedição')
        }
      }
    } catch {
      toast.error('Erro ao salvar expedição')
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(shipment: ShipmentRecord, status: string) {
    if (status === 'shipped' && !(await confirmAction({
      title: 'Expedir',
      description: 'Confirma a saída física da mercadoria? A partir daqui a quantidade passa a contar como atendida no Pedido de Venda, e a expedição não pode mais ser cancelada.',
    }))) return
    if (status === 'cancelled' && !(await confirmAction('Cancelar esta expedição?'))) return

    const r = await fetch(`/api/shipments/${shipment.id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    if (r.ok) {
      toast.success('Status da expedição atualizado!')
      load()
    } else {
      const err = await r.json()
      toast.error(err.error || 'Erro ao mudar status da expedição')
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Carregando expedições...</p>
  if (salesOrderStatus === 'cancelled' || salesOrderStatus === 'open') return null

  return (
    <div className="space-y-4">
      {canCreateShipment && (
        <div className="space-y-2">
          <Label className="text-xs">Saldo a expedir</Label>
          <div className="space-y-2">
            {balance.map((item) => (
              <div key={item.salesOrderItemId} className="border rounded p-2 text-sm space-y-1.5">
                <span className="font-medium">{item.description}</span>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>Pedido: {item.quantityOrdered} {item.unit} · Expedido: {item.quantityShipped} · Restante: {item.quantityRemaining}</span>
                  <QuantityInput
                    className="w-24 h-8"
                    value={quantities[item.salesOrderItemId] ?? 0}
                    max={item.quantityRemaining}
                    onChange={(v) => setQuantities((prev) => ({ ...prev, [item.salesOrderItemId]: v }))}
                  />
                </div>
              </div>
            ))}
          </div>
          <Button className="w-full" disabled={!hasSomethingToShip} onClick={openNew}>
            <Truck className="w-4 h-4" /> Nova Expedição
          </Button>
        </div>
      )}

      {shipments.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Expedições</Label>
          <div className="space-y-1.5">
            {shipments.map((shipment) => {
              const transitions = SHIPMENT_TRANSITIONS[shipment.status] || []
              const editable = ['draft', 'picking'].includes(shipment.status)
              return (
                <div key={shipment.id} className="border rounded p-2 text-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono">{shipment.number}</span>
                    {transitions.length > 0 ? (
                      <Select value={shipment.status} onValueChange={(v) => changeStatus(shipment, v)}>
                        <SelectTrigger className="w-auto h-7 text-xs">
                          <SelectValue><StatusBadge domain="shipment" status={shipment.status} label={SHIPMENT_STATUS_LABELS[shipment.status]} /></SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={shipment.status}>{SHIPMENT_STATUS_LABELS[shipment.status]}</SelectItem>
                          {transitions.map((s) => <SelectItem key={s} value={s}>{SHIPMENT_STATUS_LABELS[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <StatusBadge domain="shipment" status={shipment.status} label={SHIPMENT_STATUS_LABELS[shipment.status]} />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {shipment.items.map((i) => `${i.salesOrderItem.description || i.salesOrderItem.code}: ${i.quantity} ${i.salesOrderItem.unit}`).join(' · ')}
                  </div>
                  {(shipment.carrier || shipment.driverName || shipment.vehiclePlate) && (
                    <div className="text-xs text-muted-foreground">
                      {[shipment.carrier, shipment.vehiclePlate, shipment.driverName].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {editable && (
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(shipment)}>
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingId ? 'Editar Expedição' : 'Nova Expedição'}
        onSave={save}
        saving={saving}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Transportadora</Label><Input value={form.carrier} onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Veículo</Label><Input value={form.vehiclePlate} onChange={(e) => setForm((f) => ({ ...f, vehiclePlate: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Motorista</Label><Input value={form.driverName} onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Data prevista</Label><Input type="date" value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))} /></div>
          </div>
          {editingId && (
            <div className="space-y-1.5">
              <Label>Comprovante (URL/caminho)</Label>
              <Input value={form.proofDocument} onChange={(e) => setForm((f) => ({ ...f, proofDocument: e.target.value }))} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </FormDialog>
    </div>
  )
}
