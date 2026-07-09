'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { formatCurrency, statusLabels, statusColors } from '@/lib/format'
import { maskPhone, maskCpfCnpj, maskCep, fetchAddressByCep, fetchCompanyByCnpj, onlyDigits } from '@/lib/masks'
import { hasPermission } from '@/app/middleware/rbac'
import {
  LayoutDashboard, FileText, Package, Users, Settings, LogOut, Plus, Search,
  Edit, Copy, Trash2, X, Save, ChevronDown, ChevronRight, Menu, Bell,
  UserCog, Building2, Hash, FileOutput, ShieldCheck, Eye, Download, Truck, Layers, ShoppingCart
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'

/* ══════════════════════════════════════════════════════════════
   TYPE DECLARATIONS
   ══════════════════════════════════════════════════════════════ */

type Role = 'admin' | 'manager' | 'user' | 'viewer'
interface SessionUser { id: string; name: string; role: string; email?: string }
interface Quote { id: string; number: string; status: string; date: string; clientName: string; total: number; clientId: string; version: number; createdAt: string; items?: QuoteItem[] }
interface QuoteItem { id?: string; productId?: string; code: string; description: string; quantity: number; unit: string; unitPrice: number; total: number; weight: number; width: number; height: number; length: number; order: number }
interface Client { id: string; corporateName: string; tradeName: string; cpfCnpj: string; email: string; phone: string; city: string; state: string; active: boolean; createdAt: string }
interface Product { id: string; internalCode: string; name: string; description: string; categoryName: string; materialName: string; costPrice: number; salePrice: number; weight: number; unit?: string; active: boolean; createdAt: string; images?: { id: string; url: string; isPrimary: boolean }[] }
interface User { id: string; username: string; name: string; role: string; email: string; active: boolean; lastLogin: string; createdAt: string }
interface Sequence { id: string; documentType: string; prefix: string; suffix: string; nextNumber: number; digits: number; resetAnnual: boolean; resetMonthly: boolean }
interface DashboardStats { totalQuotes: number; totalClients: number; totalProducts: number; totalRevenue: number; quotesByStatus: Record<string, number>; recentQuotes: Quote[]; quotesThisMonth: number; quotesThisWeek: number }
interface AuditEntry { id: string; action: string; module: string; entityId: string; details: string; userName: string; createdAt: string }

type ModuleKey = 'dashboard' | 'orcamentos' | 'pedidos' | 'clientes' | 'produtos' | 'materiais' | 'producao' | 'fornecedores' | 'requisicoes' | 'compras' | 'estoque' | 'relatorios' | 'usuarios' | 'configuracoes'
type ConfigSubModule = 'empresa' | 'numeracao' | 'pdf' | 'sistema' | 'atualizacoes'

/* ══════════════════════════════════════════════════════════════
   EMPTY ITEM / FORM TEMPLATES
   ══════════════════════════════════════════════════════════════ */

const emptyQuoteItem = (): QuoteItem => ({
  id: '', productId: '', code: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, total: 0, weight: 0, width: 0, height: 0, length: 0, order: 0,
})

const emptyQuote = (): Record<string, unknown> => ({
  clientId: '', clientName: '', clientCnpj: '', clientContact: '', clientPhone: '', clientEmail: '',
  clientAddress: '', clientNeighborhood: '', clientCep: '',
  items: [emptyQuoteItem()],
  discountType: 'value', discountValue: 0, freightMode: 'combined', freightValue: 0, freightText: 'A COMBINAR',
  paymentTerms: '', warranty: '', validity: '', deliveryTime: '', notes: '', status: 'draft',
})

const emptyClient = (): Record<string, unknown> => ({
  corporateName: '', tradeName: '', cpfCnpj: '', ie: '', email: '', phone: '',
  contactName: '', contactPhone: '', zipCode: '', address: '', neighborhood: '', city: '', state: '',
})

const emptyProduct = (): Record<string, unknown> => ({
  internalCode: '', name: '', description: '', categoryId: '', materialId: '', unit: 'UN',
  costPrice: 0, salePrice: 0, width: 0, height: 0, length: 0, thickness: 0, weight: 0,
  ncm: '', ipi: 0, icms: 0, finish: '', family: '', line: '', notes: '',
})

const emptyUser = (): Record<string, unknown> => ({
  name: '', username: '', password: '', role: 'user', active: true, email: '',
})

const emptySupplier = (): Record<string, unknown> => ({
  corporateName: '', tradeName: '', cpfCnpj: '', ie: '', email: '', phone: '',
  contactName: '', contactPhone: '', zipCode: '', address: '', neighborhood: '', city: '', state: '',
  paymentTerms: '', leadTimeDays: 0, notes: '', active: true,
})

const emptyMaterialFull = (): Record<string, unknown> => ({
  internalCode: '', name: '', categoryId: '', density: 0, description: '', unit: 'KG',
  stockQty: 0, minStockQty: 0, costPrice: 0, notes: '', active: true,
})

type RequisitionItemInput = { materialId: string; supplierId: string; quantity: number; unit: string; estimatedPrice: number; notes: string }

const emptyRequisitionItem = (): RequisitionItemInput => ({
  materialId: '', supplierId: '', quantity: 1, unit: 'KG', estimatedPrice: 0, notes: '',
})

const emptyRequisition = (): { productionOrderId: string; neededBy: string; notes: string; items: RequisitionItemInput[] } => ({
  productionOrderId: '', neededBy: '', notes: '', items: [emptyRequisitionItem()],
})

const requisitionStatusLabels: Record<string, string> = {
  draft: 'Rascunho', sent: 'Enviada', approved: 'Aprovada', ordered: 'Pedido feito', cancelled: 'Cancelada',
}

const purchaseOrderStatusLabels: Record<string, string> = {
  draft: 'Rascunho', sent: 'Enviado', confirmed: 'Confirmado',
  partially_received: 'Recebido parcial', received: 'Recebido', cancelled: 'Cancelado',
}

const productionStatusLabels: Record<string, string> = {
  planned: 'Planejada', in_progress: 'Em execução', paused: 'Pausada', completed: 'Concluída', cancelled: 'Cancelada',
}

const salesOrderStatusLabels: Record<string, string> = {
  open: 'Aberto', in_production: 'Em produção', completed: 'Concluído', cancelled: 'Cancelado',
}

const roleLabels: Record<string, string> = {
  admin: 'Administrador', manager: 'Gerente', user: 'Usuario', viewer: 'Visualizador',
  comercial: 'Comercial', producao: 'Produção', compras: 'Compras', estoque: 'Estoque', financeiro: 'Financeiro',
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function ERPPage() {
  const { data: session, status } = useSession()
  const user = session?.user as SessionUser | undefined
  const userRole = (user?.role || 'viewer') as Role

  /* ── Global UI State ── */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard')
  const [configSub, setConfigSub] = useState<ConfigSubModule>('empresa')

  /* ── Notificacoes ── */
  const [notifOpen, setNotifOpen] = useState(false)
  const [lowStockMaterials, setLowStockMaterials] = useState<any[]>([])
  const [pendingRequisitionsCount, setPendingRequisitionsCount] = useState<any[]>([])

  /* ── Login State ── */
  const [loginErr, setLoginErr] = useState('')
  const [loginLoad, setLoginLoad] = useState(false)

  /* ── Dashboard ── */
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null)
  const [dashLoading, setDashLoading] = useState(false)

  /* ── Orcamentos ── */
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [quotesLoading, setQuotesLoading] = useState(false)
  const [quoteSearch, setQuoteSearch] = useState('')
  const [quoteStatusFilter, setQuoteStatusFilter] = useState('all')
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false)
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)
  const [quoteForm, setQuoteForm] = useState<Record<string, unknown>>(emptyQuote())
  const [quoteSaving, setQuoteSaving] = useState(false)

  /* ── Pedidos de Venda ── */
  const [salesOrders, setSalesOrders] = useState<any[]>([])
  const [salesOrdersLoading, setSalesOrdersLoading] = useState(false)
  const [salesOrderStatusFilter, setSalesOrderStatusFilter] = useState('all')

  /* ── Clientes ── */
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const [clientForm, setClientForm] = useState<Record<string, unknown>>(emptyClient())
  const [clientSaving, setClientSaving] = useState(false)

  /* ── Produtos ── */
  const [products, setProducts] = useState<(Product & { category?: { name: string } | null; material?: { name: string } | null })[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [productForm, setProductForm] = useState<Record<string, unknown>>(emptyProduct())
  const [productSaving, setProductSaving] = useState(false)
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [materials, setMaterials] = useState<{ id: string; name: string }[]>([])
  const [categoryForm, setCategoryForm] = useState({ name: '', slug: '' })
  const [materialForm, setMaterialForm] = useState({ name: '', density: 0, description: '' })
  const [categorySaving, setCategorySaving] = useState(false)
  const [materialSaving, setMaterialSaving] = useState(false)

  /* ── Producao ── */
  const [productionOrders, setProductionOrders] = useState<any[]>([])
  const [productionOrdersLoading, setProductionOrdersLoading] = useState(false)
  const [productionOrderDialogOpen, setProductionOrderDialogOpen] = useState(false)
  const [editingProductionOrderId, setEditingProductionOrderId] = useState<string | null>(null)
  const [productionOrderForm, setProductionOrderForm] = useState<Record<string, unknown>>({
    productId: '', productName: '', quantity: 1, unit: 'UN', status: 'planned', priority: 'normal', date: new Date().toLocaleDateString('pt-BR'), dueDate: '', description: '', notes: '',
  })
  const [productionOrderSaving, setProductionOrderSaving] = useState(false)
  const [selectedSalesOrderForOP, setSelectedSalesOrderForOP] = useState('')

  /* ── Materiais (lista completa, com estoque/custo) ── */
  const [materialsFull, setMaterialsFull] = useState<any[]>([])

  /* ── Materiais (módulo dedicado) ── */
  const [materialsPage, setMaterialsPage] = useState<any[]>([])
  const [materialsPageLoading, setMaterialsPageLoading] = useState(false)
  const [materialSearchFull, setMaterialSearchFull] = useState('')
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState('')
  const [materialLowOnlyFull, setMaterialLowOnlyFull] = useState(false)
  const [materialFullDialogOpen, setMaterialFullDialogOpen] = useState(false)
  const [editingMaterialFullId, setEditingMaterialFullId] = useState<string | null>(null)
  const [materialFullForm, setMaterialFullForm] = useState<Record<string, unknown>>(emptyMaterialFull())
  const [materialFullSaving, setMaterialFullSaving] = useState(false)
  const [materialDetailSuppliers, setMaterialDetailSuppliers] = useState<any[]>([])
  const [materialDetailProducts, setMaterialDetailProducts] = useState<any[]>([])

  /* ── Fornecedores ── */
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false)
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null)
  const [supplierForm, setSupplierForm] = useState<Record<string, unknown>>(emptySupplier())
  const [supplierSaving, setSupplierSaving] = useState(false)
  const [supplierMaterialLinks, setSupplierMaterialLinks] = useState<any[]>([])
  const [newSupplierMaterial, setNewSupplierMaterial] = useState({ materialId: '', lastPrice: 0, leadTimeDays: 0, isPreferred: false })

  /* ── Produto x Materia-prima (dentro do dialog de Produto) ── */
  const [productMaterialLinks, setProductMaterialLinks] = useState<any[]>([])
  const [productImages, setProductImages] = useState<any[]>([])
  const [productImageUploading, setProductImageUploading] = useState(false)
  const [newProductMaterial, setNewProductMaterial] = useState({ materialId: '', quantity: 1, unit: 'KG', scrapPct: 0 })

  /* ── Requisicoes ── */
  const [requisitions, setRequisitions] = useState<any[]>([])
  const [requisitionsLoading, setRequisitionsLoading] = useState(false)
  const [requisitionStatusFilter, setRequisitionStatusFilter] = useState('all')
  const [requisitionDialogOpen, setRequisitionDialogOpen] = useState(false)
  const [requisitionForm, setRequisitionForm] = useState<{ productionOrderId: string; neededBy: string; notes: string; items: RequisitionItemInput[] }>(emptyRequisition())
  const [requisitionSaving, setRequisitionSaving] = useState(false)

  /* ── Cotacao (fornecedores por item da requisicao) ── */
  const [cotacaoDialogOpen, setCotacaoDialogOpen] = useState(false)
  const [cotacaoRequisition, setCotacaoRequisition] = useState<any>(null)
  const [cotacaoLoading, setCotacaoLoading] = useState(false)
  const [cotacaoNewQuote, setCotacaoNewQuote] = useState<Record<string, { supplierId: string; price: number; leadTimeDays: number }>>({})

  /* ── Compras (Pedidos de Compra) ── */
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
  const [purchaseOrdersLoading, setPurchaseOrdersLoading] = useState(false)
  const [purchaseOrderStatusFilter, setPurchaseOrderStatusFilter] = useState('all')
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false)
  const [receivePurchaseOrder, setReceivePurchaseOrder] = useState<any>(null)
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({})
  const [receiveSaving, setReceiveSaving] = useState(false)

  /* ── Estoque ── */
  const [stockSummary, setStockSummary] = useState<any[]>([])
  const [stockSummaryLoading, setStockSummaryLoading] = useState(false)
  const [stockTypeFilter, setStockTypeFilter] = useState<'all' | 'material' | 'product'>('all')
  const [stockSearch, setStockSearch] = useState('')
  const [stockLowOnly, setStockLowOnly] = useState(false)
  const [stockView, setStockView] = useState<'saldo' | 'movimentacoes'>('saldo')
  const [stockMovements, setStockMovements] = useState<any[]>([])
  const [stockMovementsLoading, setStockMovementsLoading] = useState(false)
  const [stockMovementFilter, setStockMovementFilter] = useState<{ itemType: string; itemId: string; itemName: string }>({ itemType: '', itemId: '', itemName: '' })
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustForm, setAdjustForm] = useState<{ itemType: string; itemId: string; itemName: string; currentQty: number; unit: string; newQuantity: number; reason: string }>({
    itemType: '', itemId: '', itemName: '', currentQty: 0, unit: '', newQuantity: 0, reason: '',
  })
  const [adjustSaving, setAdjustSaving] = useState(false)

  /* ── Relatorios ── */
  const [reportType, setReportType] = useState<'sales' | 'production' | 'purchases' | 'stock'>('sales')
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [reportStatus, setReportStatus] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportResult, setReportResult] = useState<{ summary: Record<string, unknown>; rows: Record<string, unknown>[] } | null>(null)

  /* ── Atualizacoes (sistema de patch) ── */
  const [patchHistory, setPatchHistory] = useState<any[]>([])
  const [currentVersion, setCurrentVersion] = useState('')
  const [patchUploading, setPatchUploading] = useState(false)
  const [patchStatus, setPatchStatus] = useState<{ state: string; message: string } | null>(null)
  const [patchPolling, setPatchPolling] = useState(false)

  /* ── Usuarios ── */
  const [usersList, setUsersList] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [userForm, setUserForm] = useState<Record<string, unknown>>(emptyUser())
  const [userSaving, setUserSaving] = useState(false)

  /* ── Config: Empresa ── */
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)

  /* ── Config: Numeracao ── */
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [sequencesLoading, setSequencesLoading] = useState(false)

  /* ── Config: Sistema ── */
  const [systemInfo, setSystemInfo] = useState<Record<string, unknown> | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
  const [systemLoading, setSystemLoading] = useState(false)

  /* ══════════════════════════════════════════════════════════════
     LOGIN
     ══════════════════════════════════════════════════════════════ */

  const doLogin = async () => {
    const u = (document.getElementById('lu') as HTMLInputElement)?.value?.trim()
    const p = (document.getElementById('lp') as HTMLInputElement)?.value
    if (!u || !p) { setLoginErr('Preencha usuario e senha'); return }
    setLoginLoad(true)
    const result = await signIn('credentials', { username: u, password: p, redirect: false })
    if (result?.ok) { setLoginErr('') } else { setLoginErr('Usuario ou senha incorretos') }
    setLoginLoad(false)
  }

  /* ══════════════════════════════════════════════════════════════
     DATA FETCHING
     ══════════════════════════════════════════════════════════════ */

  const loadDashboard = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard/stats')
      if (r.ok) setDashStats(await r.json())
    } catch { toast.error('Erro ao carregar dashboard') }
  }, [])

  const loadQuotes = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (quoteStatusFilter !== 'all') params.set('status', quoteStatusFilter)
      if (quoteSearch) params.set('search', quoteSearch)
      const r = await fetch(`/api/quotes?${params}`)
      if (r.ok) {
        const json = await r.json()
        setQuotes(json.data || [])
      }
    } catch { toast.error('Erro ao carregar orcamentos') }
  }, [quoteStatusFilter, quoteSearch])

  const loadSalesOrders = useCallback(async () => {
    try {
      setSalesOrdersLoading(true)
      const params = new URLSearchParams()
      if (salesOrderStatusFilter !== 'all') params.set('status', salesOrderStatusFilter)
      const r = await fetch(`/api/sales-orders?${params}`)
      if (r.ok) { const json = await r.json(); setSalesOrders(json.data || []) }
    } catch { toast.error('Erro ao carregar pedidos de venda') }
    finally { setSalesOrdersLoading(false) }
  }, [salesOrderStatusFilter])

  const convertQuoteToOrder = async (quoteId: string) => {
    if (!confirm('Converter este orçamento aprovado em Pedido de Venda?')) return
    try {
      const r = await fetch(`/api/quotes/${quoteId}/convert-to-order`, { method: 'POST' })
      const json = await r.json()
      if (r.ok) { toast.success(`Pedido de Venda ${json.number} criado!`); loadQuotes() }
      else toast.error(json.error || 'Erro ao converter orçamento')
    } catch { toast.error('Erro ao converter orçamento') }
  }

  const changeSalesOrderStatus = async (id: string, status: string) => {
    try {
      const r = await fetch(`/api/sales-orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (r.ok) { toast.success('Status atualizado!'); loadSalesOrders() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao mudar status') }
    } catch { toast.error('Erro ao mudar status') }
  }

  const loadClients = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (clientSearch) params.set('search', clientSearch)
      const r = await fetch(`/api/clients?${params}`)
      if (r.ok) {
        const json = await r.json()
        setClients(json.data || [])
      }
    } catch { toast.error('Erro ao carregar clientes') }
  }, [clientSearch])

  const loadProducts = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (productSearch) params.set('search', productSearch)
      const r = await fetch(`/api/products?${params}`)
      if (r.ok) {
        const json = await r.json()
        setProducts(json.data || [])
      }
    } catch { toast.error('Erro ao carregar produtos') }
  }, [productSearch])

  const loadCategoriesAndMaterials = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([fetch('/api/categories'), fetch('/api/materials')])
      if (c.ok) setCategories(((await c.json()) || []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
      if (m.ok) setMaterials(((await m.json()) || []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
    } catch { /* silent */ }
  }, [])

  const saveCategory = useCallback(async () => {
    if (!categoryForm.name.trim() || !categoryForm.slug.trim()) {
      toast.error('Preencha nome e slug da categoria')
      return
    }
    setCategorySaving(true)
    try {
      const r = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryForm),
      })
      const json = await r.json()
      if (!r.ok) {
        toast.error(json.error || 'Erro ao salvar categoria')
        return
      }
      toast.success('Categoria salva com sucesso')
      setCategoryForm({ name: '', slug: '' })
      await loadCategoriesAndMaterials()
    } catch {
      toast.error('Erro ao salvar categoria')
    } finally {
      setCategorySaving(false)
    }
  }, [categoryForm, loadCategoriesAndMaterials])

  const saveMaterial = useCallback(async () => {
    if (!materialForm.name.trim()) {
      toast.error('Preencha o nome do material')
      return
    }
    setMaterialSaving(true)
    try {
      const r = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(materialForm),
      })
      const json = await r.json()
      if (!r.ok) {
        toast.error(json.error || 'Erro ao salvar material')
        return
      }
      toast.success('Matéria-prima salva com sucesso')
      setMaterialForm({ name: '', density: 0, description: '' })
      await loadCategoriesAndMaterials()
    } catch {
      toast.error('Erro ao salvar material')
    } finally {
      setMaterialSaving(false)
    }
  }, [materialForm, loadCategoriesAndMaterials])

  const loadUsers = useCallback(async () => {
    try {
      const r = await fetch('/api/users')
      if (r.ok) {
        const json = await r.json()
        setUsersList(json.data || [])
      }
    } catch { toast.error('Erro ao carregar usuarios') }
  }, [])

  const loadProductionOrders = useCallback(async () => {
    try {
      setProductionOrdersLoading(true)
      const r = await fetch('/api/production-orders')
      if (r.ok) {
        const json = await r.json()
        setProductionOrders(json.data || [])
      }
    } catch { toast.error('Erro ao carregar ordens de produção') }
    finally { setProductionOrdersLoading(false) }
  }, [])

  const loadMaterialsFull = useCallback(async () => {
    try {
      const r = await fetch('/api/materials')
      if (r.ok) setMaterialsFull((await r.json()) || [])
    } catch { /* silent */ }
  }, [])

  const loadMaterialsPage = useCallback(async () => {
    try {
      setMaterialsPageLoading(true)
      const params = new URLSearchParams()
      if (materialSearchFull) params.set('search', materialSearchFull)
      if (materialCategoryFilter) params.set('categoryId', materialCategoryFilter)
      if (materialLowOnlyFull) params.set('lowStock', 'true')
      const r = await fetch(`/api/materials?${params}`)
      if (r.ok) setMaterialsPage((await r.json()) || [])
    } catch { toast.error('Erro ao carregar matérias-primas') }
    finally { setMaterialsPageLoading(false) }
  }, [materialSearchFull, materialCategoryFilter, materialLowOnlyFull])

  const loadSuppliers = useCallback(async () => {
    try {
      setSuppliersLoading(true)
      const r = await fetch(`/api/suppliers?search=${encodeURIComponent(supplierSearch)}&limit=100`)
      if (r.ok) { const json = await r.json(); setSuppliers(json.data || []) }
    } catch { toast.error('Erro ao carregar fornecedores') }
    finally { setSuppliersLoading(false) }
  }, [supplierSearch])

  const loadRequisitions = useCallback(async () => {
    try {
      setRequisitionsLoading(true)
      const qs = requisitionStatusFilter !== 'all' ? `?status=${requisitionStatusFilter}&limit=100` : '?limit=100'
      const r = await fetch(`/api/requisitions${qs}`)
      if (r.ok) { const json = await r.json(); setRequisitions(json.data || []) }
    } catch { toast.error('Erro ao carregar requisições') }
    finally { setRequisitionsLoading(false) }
  }, [requisitionStatusFilter])

  const loadPurchaseOrders = useCallback(async () => {
    try {
      setPurchaseOrdersLoading(true)
      const qs = purchaseOrderStatusFilter !== 'all' ? `?status=${purchaseOrderStatusFilter}&limit=100` : '?limit=100'
      const r = await fetch(`/api/purchase-orders${qs}`)
      if (r.ok) { const json = await r.json(); setPurchaseOrders(json.data || []) }
    } catch { toast.error('Erro ao carregar pedidos de compra') }
    finally { setPurchaseOrdersLoading(false) }
  }, [purchaseOrderStatusFilter])

  const loadStockSummary = useCallback(async () => {
    try {
      setStockSummaryLoading(true)
      const params = new URLSearchParams()
      params.set('type', stockTypeFilter)
      if (stockSearch) params.set('search', stockSearch)
      if (stockLowOnly) params.set('lowStockOnly', 'true')
      const r = await fetch(`/api/stock/summary?${params}`)
      if (r.ok) setStockSummary((await r.json()) || [])
    } catch { toast.error('Erro ao carregar estoque') }
    finally { setStockSummaryLoading(false) }
  }, [stockTypeFilter, stockSearch, stockLowOnly])

  const loadStockMovements = useCallback(async () => {
    try {
      setStockMovementsLoading(true)
      const params = new URLSearchParams()
      params.set('limit', '100')
      if (stockMovementFilter.itemType) params.set('itemType', stockMovementFilter.itemType)
      if (stockMovementFilter.itemType === 'material' && stockMovementFilter.itemId) params.set('materialId', stockMovementFilter.itemId)
      if (stockMovementFilter.itemType === 'product' && stockMovementFilter.itemId) params.set('productId', stockMovementFilter.itemId)
      const r = await fetch(`/api/stock/movements?${params}`)
      if (r.ok) { const json = await r.json(); setStockMovements(json.data || []) }
    } catch { toast.error('Erro ao carregar movimentações') }
    finally { setStockMovementsLoading(false) }
  }, [stockMovementFilter])

  const loadNotifications = useCallback(async () => {
    try {
      const [matRes, reqRes] = await Promise.all([
        fetch('/api/materials?lowStock=true'),
        fetch('/api/requisitions?status=sent&limit=50'),
      ])
      if (matRes.ok) setLowStockMaterials((await matRes.json()) || [])
      if (reqRes.ok) { const json = await reqRes.json(); setPendingRequisitionsCount(json.data || []) }
    } catch { /* silent — notificacoes nao sao criticas */ }
  }, [])

  useEffect(() => {
    if (!session) return
    loadNotifications()
  }, [session, loadNotifications])

  const notifCount = lowStockMaterials.length + pendingRequisitionsCount.length

  const goToNotification = (target: ModuleKey) => {
    setNotifOpen(false)
    setActiveModule(target)
  }

  useEffect(() => {
    if (activeModule === 'estoque' && stockView === 'saldo') loadStockSummary()
  }, [activeModule, stockView, stockTypeFilter, stockLowOnly, loadStockSummary])

  useEffect(() => {
    if (activeModule === 'materiais') loadMaterialsPage()
  }, [activeModule, materialSearchFull, materialCategoryFilter, materialLowOnlyFull, loadMaterialsPage])

  useEffect(() => {
    if (activeModule === 'orcamentos') loadQuotes()
  }, [activeModule, quoteStatusFilter, quoteSearch, loadQuotes])

  useEffect(() => {
    if (activeModule === 'pedidos') loadSalesOrders()
  }, [activeModule, salesOrderStatusFilter, loadSalesOrders])

  useEffect(() => {
    if (activeModule === 'estoque' && stockView === 'movimentacoes') loadStockMovements()
  }, [activeModule, stockView, stockMovementFilter, loadStockMovements])

  const loadSettings = useCallback(async () => {
    try {
      const r = await fetch('/api/settings')
      if (r.ok) {
        const json = await r.json()
        const flat: Record<string, string> = {}
        for (const group of Object.values(json) as Record<string, string>[]) {
          if (typeof group === 'object' && group !== null) {
            for (const [k, v] of Object.entries(group)) flat[k] = v
          }
        }
        setSettings(flat)
      }
    } catch { toast.error('Erro ao carregar configuracoes') }
  }, [])

  const loadSequences = useCallback(async () => {
    try {
      const r = await fetch('/api/sequences')
      if (r.ok) setSequences(await r.json())
    } catch { toast.error('Erro ao carregar sequencias') }
  }, [])

  const loadSystemInfo = useCallback(async () => {
    try {
      const [si, al] = await Promise.all([fetch('/api/system/info'), fetch('/api/audit?limit=20')])
      if (si.ok) setSystemInfo(await si.json())
      if (al.ok) {
        const json = await al.json()
        setAuditLogs(json.data || [])
      }
    } catch { toast.error('Erro ao carregar informacoes do sistema') }
  }, [])

  const loadPatchHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/system/patches/history')
      if (r.ok) {
        const json = await r.json()
        setPatchHistory(json.history || [])
        setCurrentVersion(json.currentVersion || '')
      }
    } catch { toast.error('Erro ao carregar histórico de atualizações') }
  }, [])

  const uploadPatch = async (file: File) => {
    if (!file.name.endsWith('.zip')) { toast.error('O patch precisa ser um arquivo .zip'); return }
    if (!confirm('Aplicar esta atualização agora? O sistema fará backup automático, mas pode reiniciar e ficar indisponível por alguns instantes.')) return
    setPatchUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await fetch('/api/system/patches/upload', { method: 'POST', body: formData })
      const json = await r.json()
      if (r.ok) {
        toast.success(json.message || 'Patch enviado, aplicando...')
        setPatchPolling(true)
      } else {
        toast.error(json.error || 'Erro ao enviar patch')
      }
    } catch {
      toast.error('Erro ao enviar patch (se o sistema reiniciou, isso pode ser esperado — aguarde e recarregue a página)')
      setPatchPolling(true)
    }
    setPatchUploading(false)
  }

  useEffect(() => {
    if (!patchPolling) return
    const interval = setInterval(async () => {
      try {
        const r = await fetch('/api/system/patches/status')
        if (r.ok) {
          const json = await r.json()
          setPatchStatus(json)
          if (json.state === 'done' || json.state === 'failed') {
            setPatchPolling(false)
            loadPatchHistory()
            if (json.state === 'done') toast.success(json.message)
            else toast.error(json.message)
          }
        }
      } catch { /* servidor pode estar reiniciando — tenta de novo no próximo tick */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [patchPolling, loadPatchHistory])

  /* ── Module change effect ── */
  const moduleRef = activeModule
  const configSubRef = configSub
  const sessionRef = session
  useEffect(() => {
    if (!sessionRef) return
    const loads: Record<string, () => Promise<void>> = {
      dashboard: loadDashboard,
      orcamentos: loadQuotes,
      pedidos: loadSalesOrders,
      clientes: loadClients,
      usuarios: loadUsers,
      producao: loadProductionOrders,
      empresa: loadSettings,
      numeracao: loadSequences,
      sistema: loadSystemInfo,
      atualizacoes: loadPatchHistory,
      produtos: loadProducts,
      categoriesMaterials: loadCategoriesAndMaterials,
      fornecedores: loadSuppliers,
      requisicoes: loadRequisitions,
      compras: loadPurchaseOrders,
      estoque: loadStockSummary,
      materiais: loadMaterialsPage,
    }
    const fn = loads[moduleRef] || loads[configSubRef]
    if (fn) fn()
    if (moduleRef === 'produtos') { loads.categoriesMaterials(); loadMaterialsFull() }
    if (moduleRef === 'materiais') { loads.categoriesMaterials() }
    if (moduleRef === 'producao') {
      loads.producao()
      loadProducts()
      loadSalesOrders()
    }
    if (moduleRef === 'orcamentos') {
      loadClients()
      loadProducts()
    }
    if (moduleRef === 'fornecedores') { loadMaterialsFull() }
    if (moduleRef === 'requisicoes') { loadMaterialsFull(); loadSuppliers(); loadProductionOrders() }
    if (moduleRef === 'estoque' && stockView === 'movimentacoes') { loadStockMovements() }
  }, [session, activeModule, configSub])

  /* ══════════════════════════════════════════════════════════════
     QUOTE ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const openNewQuote = () => { setEditingQuoteId(null); setQuoteForm(emptyQuote()); setQuoteDialogOpen(true) }

  /** Preenche os dados do cliente no orçamento a partir de um cliente já cadastrado. */
  const selectQuoteClient = (clientId: string) => {
    const c: any = clients.find(cl => cl.id === clientId)
    if (!c) return
    setQuoteForm(prev => ({
      ...prev, clientId,
      clientName: c.corporateName || c.tradeName || '',
      clientCnpj: c.cpfCnpj || '',
      clientContact: c.contactName || '',
      clientPhone: c.phone || c.contactPhone || '',
      clientEmail: c.email || '',
      clientAddress: [c.address, c.number].filter(Boolean).join(', '),
      clientNeighborhood: c.neighborhood || '',
      clientCep: c.zipCode || '',
    }))
  }

  const openEditQuote = async (id: string) => {
    try {
      const r = await fetch(`/api/quotes/${id}`)
      if (!r.ok) { toast.error('Erro ao carregar orcamento'); return }
      const q = await r.json()
      setEditingQuoteId(id)
      setQuoteForm({
        clientId: q.clientId || '', clientName: q.clientName || '', clientCnpj: q.clientCnpj || '',
        clientContact: q.clientContact || '', clientPhone: q.clientPhone || '', clientEmail: q.clientEmail || '',
        clientAddress: q.clientAddress || '', clientNeighborhood: q.clientNeighborhood || '', clientCep: q.clientCep || '',
        items: (q.items || []).length > 0 ? q.items : [emptyQuoteItem()],
        discountType: q.discountType || 'value', discountValue: q.discountValue || 0,
        freightMode: q.freightMode || 'combined', freightValue: q.freightValue || 0, freightText: q.freightText || 'A COMBINAR',
        paymentTerms: q.paymentTerms || '', warranty: q.warranty || '', validity: q.validity || '',
        deliveryTime: q.deliveryTime || '', notes: q.notes || '', status: q.status || 'draft',
      })
      setQuoteDialogOpen(true)
    } catch { toast.error('Erro ao carregar orcamento') }
  }

  const saveQuote = async () => {
    setQuoteSaving(true)
    try {
      const items = (quoteForm.items as QuoteItem[] || []).map((item, idx) => ({
        ...item, total: item.quantity * item.unitPrice, order: item.order ?? idx,
      }))
      const body = { ...quoteForm, items }
      const url = editingQuoteId ? `/api/quotes/${editingQuoteId}` : '/api/quotes'
      const method = editingQuoteId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) {
        toast.success(editingQuoteId ? 'Orcamento atualizado!' : 'Orcamento criado!')
        setQuoteDialogOpen(false)
        loadQuotes()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar')
      }
    } catch { toast.error('Erro ao salvar orcamento') }
    setQuoteSaving(false)
  }

  const duplicateQuote = async (id: string) => {
    try {
      const r = await fetch(`/api/quotes/${id}/duplicate`, { method: 'POST' })
      if (r.ok) { toast.success('Orcamento duplicado!'); loadQuotes() }
      else toast.error('Erro ao duplicar')
    } catch { toast.error('Erro ao duplicar') }
  }

  const changeQuoteStatus = async (id: string, status: string) => {
    try {
      const r = await fetch(`/api/quotes/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      const json = await r.json()
      if (!r.ok) { toast.error(json.error || 'Erro ao alterar status'); return }
      const generated = json.generatedProductionOrders as any[] | undefined
      if (generated && generated.length > 0) {
        toast.success(`Orçamento aprovado! ${generated.length} Ordem(ns) de Produção gerada(s): ${generated.map((o) => o.number).join(', ')}`)
      } else {
        toast.success('Status atualizado!')
      }
      loadQuotes()
    } catch { toast.error('Erro ao alterar status') }
  }

  const deleteQuote = async (id: string) => {
    if (!confirm('Deseja realmente excluir este orcamento?')) return
    try {
      const r = await fetch(`/api/quotes/${id}`, { method: 'DELETE' })
      if (r.ok) { toast.success('Orcamento excluido!'); loadQuotes() }
      else toast.error('Erro ao excluir')
    } catch { toast.error('Erro ao excluir') }
  }

  const updateQuoteItem = (idx: number, field: string, value: unknown) => {
    const items = [...(quoteForm.items as QuoteItem[])]
    items[idx] = { ...items[idx], [field]: value }
    if (field === 'quantity' || field === 'unitPrice') {
      items[idx].total = items[idx].quantity * items[idx].unitPrice
    }
    setQuoteForm({ ...quoteForm, items })
  }

  const selectQuoteItemProduct = (idx: number, productId: string) => {
    const items = [...(quoteForm.items as QuoteItem[])]
    const product = products.find((p: any) => p.id === productId)
    if (!product) return
    items[idx] = {
      ...items[idx],
      productId,
      code: product.internalCode || items[idx].code,
      description: product.name || items[idx].description,
      unit: product.unit || items[idx].unit || 'UN',
      unitPrice: product.salePrice || 0,
      weight: product.weight || items[idx].weight || 0,
    }
    items[idx].total = items[idx].quantity * items[idx].unitPrice
    setQuoteForm({ ...quoteForm, items })
  }

  const addQuoteItem = () => {
    const items = [...(quoteForm.items as QuoteItem[]), emptyQuoteItem()]
    setQuoteForm({ ...quoteForm, items })
  }

  const removeQuoteItem = (idx: number) => {
    const items = (quoteForm.items as QuoteItem[]).filter((_, i) => i !== idx)
    setQuoteForm({ ...quoteForm, items: items.length > 0 ? items : [emptyQuoteItem()] })
  }

  /* ══════════════════════════════════════════════════════════════
     CLIENT ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const handleCepLookup = async (cep: string, setForm: React.Dispatch<React.SetStateAction<any>>, fieldMap: { address?: string; neighborhood?: string; city?: string; state?: string } = { address: 'address', neighborhood: 'neighborhood', city: 'city', state: 'state' }) => {
    const addr = await fetchAddressByCep(cep)
    if (!addr) return
    setForm((prev: any) => {
      const next = { ...prev }
      if (fieldMap.address) next[fieldMap.address] = addr.logradouro || prev[fieldMap.address]
      if (fieldMap.neighborhood) next[fieldMap.neighborhood] = addr.bairro || prev[fieldMap.neighborhood]
      if (fieldMap.city) next[fieldMap.city] = addr.localidade || prev[fieldMap.city]
      if (fieldMap.state) next[fieldMap.state] = addr.uf || prev[fieldMap.state]
      return next
    })
  }

  /** Busca automática pelo CNPJ (razão social, endereço, telefone) — usado em Cliente e Fornecedor. */
  const handleCnpjLookup = async (cnpj: string, setForm: React.Dispatch<React.SetStateAction<any>>, fieldMap: { corporateName?: string; tradeName?: string; address?: string; neighborhood?: string; city?: string; state?: string; zipCode?: string; phone?: string; email?: string }) => {
    if (onlyDigits(cnpj).length !== 14) return // só busca para CNPJ (14 dígitos), não CPF
    toast.info('Buscando dados do CNPJ...')
    const data = await fetchCompanyByCnpj(cnpj)
    if (!data) { toast.error('CNPJ não encontrado ou API indisponível'); return }
    setForm((prev: any) => {
      const next = { ...prev }
      if (fieldMap.corporateName) next[fieldMap.corporateName] = data.razao_social || prev[fieldMap.corporateName]
      if (fieldMap.tradeName) next[fieldMap.tradeName] = data.nome_fantasia || prev[fieldMap.tradeName]
      if (fieldMap.address) next[fieldMap.address] = `${data.logradouro || ''}${data.numero ? `, ${data.numero}` : ''}`.trim() || prev[fieldMap.address]
      if (fieldMap.neighborhood) next[fieldMap.neighborhood] = data.bairro || prev[fieldMap.neighborhood]
      if (fieldMap.city) next[fieldMap.city] = data.municipio || prev[fieldMap.city]
      if (fieldMap.state) next[fieldMap.state] = data.uf || prev[fieldMap.state]
      if (fieldMap.zipCode) next[fieldMap.zipCode] = data.cep ? maskCep(data.cep) : prev[fieldMap.zipCode]
      if (fieldMap.phone && data.ddd_telefone_1) next[fieldMap.phone] = maskPhone(data.ddd_telefone_1)
      if (fieldMap.email && data.email) next[fieldMap.email] = data.email
      return next
    })
    toast.success('Dados preenchidos a partir do CNPJ!')
  }

  const openNewClient = () => { setEditingClientId(null); setClientForm(emptyClient()); setClientDialogOpen(true) }

  const openEditClient = (c: Client) => {
    setEditingClientId(c.id)
    setClientForm({
      corporateName: c.corporateName || '', tradeName: c.tradeName || '', cpfCnpj: c.cpfCnpj || '',
      ie: '', email: c.email || '', phone: c.phone || '',
      contactName: '', contactPhone: '', zipCode: '', address: '', neighborhood: '',
      city: c.city || '', state: c.state || '',
    })
    setClientDialogOpen(true)
  }

  const saveClient = async () => {
    setClientSaving(true)
    try {
      const url = editingClientId ? `/api/clients/${editingClientId}` : '/api/clients'
      const method = editingClientId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clientForm) })
      if (r.ok) { toast.success(editingClientId ? 'Cliente atualizado!' : 'Cliente criado!'); setClientDialogOpen(false); loadClients() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao salvar') }
    } catch { toast.error('Erro ao salvar cliente') }
    setClientSaving(false)
  }

  const deleteClient = async (id: string) => {
    if (!confirm('Deseja realmente excluir este cliente?')) return
    try {
      const r = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
      if (r.ok) { toast.success('Cliente excluido!'); loadClients() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao excluir') }
    } catch { toast.error('Erro ao excluir') }
  }

  /* ══════════════════════════════════════════════════════════════
     PRODUCT ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const openNewProduct = () => { setEditingProductId(null); setProductForm(emptyProduct()); setProductImages([]); setProductDialogOpen(true) }

  const openEditProduct = (p: Product & { category?: { name: string } | null; material?: { name: string } | null }) => {
    setEditingProductId(p.id)
    setProductForm({
      internalCode: p.internalCode || '', name: p.name || '', description: p.description || '',
      categoryId: (p as any).categoryId || '', materialId: (p as any).materialId || '', unit: (p as any).unit || 'UN', costPrice: p.costPrice || 0, salePrice: p.salePrice || 0,
      width: (p as any).width || 0, height: (p as any).height || 0, length: (p as any).length || 0, thickness: (p as any).thickness || 0, weight: p.weight || 0,
      ncm: (p as any).ncm || '', ipi: (p as any).ipi || 0, icms: (p as any).icms || 0, finish: (p as any).finish || '', family: (p as any).family || '', line: (p as any).line || '', notes: (p as any).notes || '',
    })
    setProductMaterialLinks([])
    setProductImages([])
    setProductDialogOpen(true)
    fetch(`/api/products/${p.id}/materials`).then(r => r.ok ? r.json() : []).then(links => setProductMaterialLinks(links || [])).catch(() => {})
    fetch(`/api/products/${p.id}/images`).then(r => r.ok ? r.json() : []).then(imgs => setProductImages(imgs || [])).catch(() => {})
  }

  const saveProduct = async () => {
    setProductSaving(true)
    try {
      const url = editingProductId ? `/api/products/${editingProductId}` : '/api/products'
      const method = editingProductId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(productForm) })
      if (r.ok) { toast.success(editingProductId ? 'Produto atualizado!' : 'Produto criado!'); setProductDialogOpen(false); loadProducts() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao salvar') }
    } catch { toast.error('Erro ao salvar produto') }
    setProductSaving(false)
  }

  const deleteProduct = async (id: string) => {
    if (!confirm('Deseja realmente desativar este produto?')) return
    try {
      const r = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (r.ok) { toast.success('Produto desativado!'); loadProducts() }
      else toast.error('Erro ao desativar')
    } catch { toast.error('Erro ao desativar') }
  }

  /* ══════════════════════════════════════════════════════════════
     PRODUCTION ORDER ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const openNewProductionOrder = () => {
    setEditingProductionOrderId(null)
    setSelectedSalesOrderForOP('')
    setProductionOrderForm({
      productId: '', productName: '', quantity: 1, unit: 'UN', status: 'planned', priority: 'normal', date: new Date().toLocaleDateString('pt-BR'), dueDate: '', description: '', notes: '',
    })
    setProductionOrderDialogOpen(true)
  }

  const pickSalesOrderItem = (salesOrderId: string, itemId: string) => {
    const so = salesOrders.find((s: any) => s.id === salesOrderId)
    const item = so?.items?.find((i: any) => i.id === itemId)
    if (!item) return
    setProductionOrderForm(prev => ({
      ...prev,
      productId: item.productId || '',
      productName: item.description || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'UN',
      salesOrderId,
    }))
  }

  const openEditProductionOrder = (order: any) => {
    setEditingProductionOrderId(order.id)
    setProductionOrderForm({
      productId: order.productId || '', productName: order.productName || order.product?.name || '', quantity: order.quantity || 1, unit: order.unit || 'UN', status: order.status || 'planned', priority: order.priority || 'normal', date: order.date || '', dueDate: order.dueDate || '', description: order.description || '', notes: order.notes || '',
    })
    setProductionOrderDialogOpen(true)
  }

  const saveProductionOrder = async () => {
    setProductionOrderSaving(true)
    try {
      const url = editingProductionOrderId ? `/api/production-orders/${editingProductionOrderId}` : '/api/production-orders'
      const method = editingProductionOrderId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(productionOrderForm) })
      if (r.ok) {
        toast.success(editingProductionOrderId ? 'Ordem atualizada!' : 'Ordem criada!')
        setProductionOrderDialogOpen(false)
        loadProductionOrders()
      } else {
        const err = await r.json(); toast.error(err.error || 'Erro ao salvar')
      }
    } catch { toast.error('Erro ao salvar ordem') }
    setProductionOrderSaving(false)
  }

  const deleteProductionOrder = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta ordem de produção?')) return
    try {
      const r = await fetch(`/api/production-orders/${id}`, { method: 'DELETE' })
      if (r.ok) { toast.success('Ordem excluida!'); loadProductionOrders() }
      else toast.error('Erro ao excluir')
    } catch { toast.error('Erro ao excluir') }
  }

  /* ══════════════════════════════════════════════════════════════
     PRODUTO x MATERIA-PRIMA (receita de consumo)
     ══════════════════════════════════════════════════════════════ */

  const linkProductMaterial = async () => {
    if (!editingProductId || !newProductMaterial.materialId) { toast.error('Selecione a materia-prima'); return }
    try {
      const r = await fetch(`/api/products/${editingProductId}/materials`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newProductMaterial),
      })
      if (r.ok) {
        toast.success('Materia-prima vinculada ao produto!')
        setNewProductMaterial({ materialId: '', quantity: 1, unit: 'KG', scrapPct: 0 })
        const links = await (await fetch(`/api/products/${editingProductId}/materials`)).json()
        setProductMaterialLinks(links || [])
      } else { const err = await r.json(); toast.error(err.error || 'Erro ao vincular') }
    } catch { toast.error('Erro ao vincular materia-prima') }
  }

  const unlinkProductMaterial = async (materialId: string) => {
    if (!editingProductId) return
    try {
      const r = await fetch(`/api/products/${editingProductId}/materials/${materialId}`, { method: 'DELETE' })
      if (r.ok) { toast.success('Vinculo removido'); setProductMaterialLinks(prev => prev.filter((l: any) => l.materialId !== materialId)) }
      else toast.error('Erro ao remover vinculo')
    } catch { toast.error('Erro ao remover vinculo') }
  }

  /* ══════════════════════════════════════════════════════════════
     PRODUTO — IMAGENS
     ══════════════════════════════════════════════════════════════ */

  const uploadProductImage = async (file: File) => {
    if (!editingProductId) return
    if (file.size > 8 * 1024 * 1024) { toast.error('Arquivo muito grande (máx. 8MB)'); return }
    setProductImageUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await fetch(`/api/products/${editingProductId}/images`, { method: 'POST', body: formData })
      if (r.ok) {
        toast.success('Imagem enviada!')
        const imgs = await (await fetch(`/api/products/${editingProductId}/images`)).json()
        setProductImages(imgs || [])
      } else { const err = await r.json(); toast.error(err.error || 'Erro ao enviar imagem') }
    } catch { toast.error('Erro ao enviar imagem') }
    setProductImageUploading(false)
  }

  const deleteProductImage = async (imageId: string) => {
    if (!editingProductId) return
    try {
      const r = await fetch(`/api/products/${editingProductId}/images/${imageId}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Imagem removida')
        const imgs = await (await fetch(`/api/products/${editingProductId}/images`)).json()
        setProductImages(imgs || [])
      } else toast.error('Erro ao remover imagem')
    } catch { toast.error('Erro ao remover imagem') }
  }

  const setPrimaryProductImage = async (imageId: string) => {
    if (!editingProductId) return
    try {
      const r = await fetch(`/api/products/${editingProductId}/images/${imageId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPrimary: true }),
      })
      if (r.ok) {
        const imgs = await (await fetch(`/api/products/${editingProductId}/images`)).json()
        setProductImages(imgs || [])
      }
    } catch { toast.error('Erro ao definir imagem principal') }
  }

  /* ══════════════════════════════════════════════════════════════
     SUPPLIER (FORNECEDOR) ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const openNewSupplier = () => {
    setEditingSupplierId(null)
    setSupplierForm(emptySupplier())
    setSupplierMaterialLinks([])
    setSupplierDialogOpen(true)
  }

  const openEditSupplier = (s: any) => {
    setEditingSupplierId(s.id)
    setSupplierForm({
      corporateName: s.corporateName || '', tradeName: s.tradeName || '', cpfCnpj: s.cpfCnpj || '', ie: s.ie || '',
      email: s.email || '', phone: s.phone || '', contactName: s.contactName || '', contactPhone: s.contactPhone || '',
      zipCode: s.zipCode || '', address: s.address || '', neighborhood: s.neighborhood || '', city: s.city || '', state: s.state || '',
      paymentTerms: s.paymentTerms || '', leadTimeDays: s.leadTimeDays || 0, notes: s.notes || '', active: s.active,
    })
    setSupplierMaterialLinks([])
    setSupplierDialogOpen(true)
    fetch(`/api/suppliers/${s.id}`).then(r => r.ok ? r.json() : null).then(full => setSupplierMaterialLinks(full?.materials || [])).catch(() => {})
  }

  const saveSupplier = async () => {
    setSupplierSaving(true)
    try {
      const url = editingSupplierId ? `/api/suppliers/${editingSupplierId}` : '/api/suppliers'
      const method = editingSupplierId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(supplierForm) })
      if (r.ok) { toast.success(editingSupplierId ? 'Fornecedor atualizado!' : 'Fornecedor criado!'); setSupplierDialogOpen(false); loadSuppliers() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao salvar fornecedor') }
    } catch { toast.error('Erro ao salvar fornecedor') }
    setSupplierSaving(false)
  }

  const deleteSupplier = async (id: string) => {
    if (!confirm('Deseja realmente excluir este fornecedor?')) return
    try {
      const r = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' })
      if (r.ok) { toast.success('Fornecedor excluido!'); loadSuppliers() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao excluir') }
    } catch { toast.error('Erro ao excluir') }
  }

  const linkSupplierMaterial = async () => {
    if (!editingSupplierId || !newSupplierMaterial.materialId) { toast.error('Selecione a materia-prima'); return }
    try {
      const r = await fetch(`/api/suppliers/${editingSupplierId}/materials`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSupplierMaterial),
      })
      if (r.ok) {
        toast.success('Materia-prima vinculada ao fornecedor!')
        setNewSupplierMaterial({ materialId: '', lastPrice: 0, leadTimeDays: 0, isPreferred: false })
        const full = await (await fetch(`/api/suppliers/${editingSupplierId}`)).json()
        setSupplierMaterialLinks(full?.materials || [])
      } else { const err = await r.json(); toast.error(err.error || 'Erro ao vincular') }
    } catch { toast.error('Erro ao vincular materia-prima') }
  }

  const unlinkSupplierMaterial = async (materialId: string) => {
    if (!editingSupplierId) return
    try {
      const r = await fetch(`/api/suppliers/${editingSupplierId}/materials/${materialId}`, { method: 'DELETE' })
      if (r.ok) { toast.success('Vinculo removido'); setSupplierMaterialLinks(prev => prev.filter((l: any) => l.materialId !== materialId)) }
      else toast.error('Erro ao remover vinculo')
    } catch { toast.error('Erro ao remover vinculo') }
  }

  /* ══════════════════════════════════════════════════════════════
     MATERIA-PRIMA (MODULO DEDICADO) ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const openNewMaterialFull = () => {
    setEditingMaterialFullId(null)
    setMaterialFullForm(emptyMaterialFull())
    setMaterialDetailSuppliers([])
    setMaterialDetailProducts([])
    setMaterialFullDialogOpen(true)
  }

  const openEditMaterialFull = (m: any) => {
    setEditingMaterialFullId(m.id)
    setMaterialFullForm({
      internalCode: m.internalCode || '', name: m.name || '', categoryId: m.categoryId || '',
      density: m.density || 0, description: m.description || '', unit: m.unit || 'KG',
      stockQty: m.stockQty || 0, minStockQty: m.minStockQty || 0, costPrice: m.costPrice || 0,
      notes: m.notes || '', active: m.active,
    })
    setMaterialDetailSuppliers([])
    setMaterialDetailProducts([])
    setMaterialFullDialogOpen(true)
    fetch(`/api/materials/${m.id}`).then(r => r.ok ? r.json() : null).then(full => {
      setMaterialDetailSuppliers(full?.suppliers || [])
      setMaterialDetailProducts(full?.productMaterials || [])
    }).catch(() => {})
  }

  const saveMaterialFull = async () => {
    setMaterialFullSaving(true)
    try {
      const url = editingMaterialFullId ? `/api/materials/${editingMaterialFullId}` : '/api/materials'
      const method = editingMaterialFullId ? 'PUT' : 'POST'
      const payload = { ...materialFullForm, categoryId: materialFullForm.categoryId || null }
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (r.ok) {
        toast.success(editingMaterialFullId ? 'Matéria-prima atualizada!' : 'Matéria-prima criada!')
        setMaterialFullDialogOpen(false)
        loadMaterialsPage()
        loadMaterialsFull()
      } else { const err = await r.json(); toast.error(err.error || 'Erro ao salvar matéria-prima') }
    } catch { toast.error('Erro ao salvar matéria-prima') }
    setMaterialFullSaving(false)
  }

  const deleteMaterialFull = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta matéria-prima?')) return
    try {
      const r = await fetch(`/api/materials/${id}`, { method: 'DELETE' })
      if (r.ok) { toast.success('Matéria-prima excluída!'); loadMaterialsPage(); loadMaterialsFull() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao excluir') }
    } catch { toast.error('Erro ao excluir') }
  }

  /* ══════════════════════════════════════════════════════════════
     REQUISICAO DE MATERIA-PRIMA ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const openNewRequisition = () => { setRequisitionForm(emptyRequisition()); setRequisitionDialogOpen(true) }

  const addRequisitionItem = () => setRequisitionForm(f => ({ ...f, items: [...f.items, emptyRequisitionItem()] }))
  const removeRequisitionItem = (idx: number) => setRequisitionForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const updateRequisitionItem = (idx: number, patch: Partial<RequisitionItemInput>) =>
    setRequisitionForm(f => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }))

  const suggestRequisitionFromProductionOrder = async (poId: string) => {
    if (!poId) return
    try {
      const r = await fetch('/api/requisitions/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productionOrderId: poId }),
      })
      const json = await r.json()
      if (!r.ok) { toast.error(json.error || 'Erro ao calcular sugestao'); return }
      if (!json.items || json.items.length === 0) {
        toast.success(json.message || 'Nenhuma materia-prima faltando para esta OP (estoque suficiente)')
        setRequisitionForm({ productionOrderId: poId, neededBy: '', notes: '', items: [emptyRequisitionItem()] })
        return
      }
      setRequisitionForm({
        productionOrderId: poId,
        neededBy: '',
        notes: `Sugerido automaticamente a partir da OP (produto: ${json.productName || ''})`,
        items: json.items.map((i: any) => ({
          materialId: i.materialId, supplierId: i.suggestedSupplierId || '', quantity: i.missingQty,
          unit: i.unit, estimatedPrice: i.estimatedPrice || 0, notes: '',
        })),
      })
      toast.success('Sugestao calculada a partir da OP!')
    } catch { toast.error('Erro ao calcular sugestao') }
  }

  const saveRequisition = async () => {
    const validItems = requisitionForm.items.filter(i => i.materialId && i.quantity > 0)
    if (validItems.length === 0) { toast.error('Adicione ao menos um item valido (materia-prima + quantidade)'); return }
    setRequisitionSaving(true)
    try {
      const r = await fetch('/api/requisitions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionOrderId: requisitionForm.productionOrderId || undefined,
          originModule: requisitionForm.productionOrderId ? 'production_order' : 'manual',
          neededBy: requisitionForm.neededBy, notes: requisitionForm.notes,
          items: validItems.map(i => ({ ...i, supplierId: i.supplierId || undefined })),
        }),
      })
      if (r.ok) { toast.success('Requisicao criada!'); setRequisitionDialogOpen(false); loadRequisitions() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao criar requisicao') }
    } catch { toast.error('Erro ao criar requisicao') }
    setRequisitionSaving(false)
  }

  const changeRequisitionStatus = async (id: string, status: string) => {
    try {
      const r = await fetch(`/api/requisitions/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (r.ok) {
        const json = await r.json()
        toast.success('Status atualizado!')
        if (json.generatedPurchaseOrders?.length) {
          toast.success(`Pedido(s) de compra gerado(s): ${json.generatedPurchaseOrders.map((o: any) => o.number).join(', ')}`)
        }
        loadRequisitions()
      }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao mudar status') }
    } catch { toast.error('Erro ao mudar status') }
  }

  const deleteRequisition = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta requisicao?')) return
    try {
      const r = await fetch(`/api/requisitions/${id}`, { method: 'DELETE' })
      if (r.ok) { toast.success('Requisicao excluida!'); loadRequisitions() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao excluir') }
    } catch { toast.error('Erro ao excluir') }
  }

  /* ══════════════════════════════════════════════════════════════
     COTACAO ACTIONS (comparar fornecedores por item da requisicao)
     ══════════════════════════════════════════════════════════════ */

  const openCotacao = async (requisitionId: string) => {
    setCotacaoDialogOpen(true)
    setCotacaoLoading(true)
    try {
      const r = await fetch(`/api/requisitions/${requisitionId}`)
      if (r.ok) setCotacaoRequisition(await r.json())
      else toast.error('Erro ao carregar requisição')
    } catch { toast.error('Erro ao carregar requisição') }
    setCotacaoLoading(false)
  }

  const reloadCotacao = async () => {
    if (!cotacaoRequisition) return
    const r = await fetch(`/api/requisitions/${cotacaoRequisition.id}`)
    if (r.ok) setCotacaoRequisition(await r.json())
  }

  const addItemQuote = async (itemId: string) => {
    const draft = cotacaoNewQuote[itemId]
    if (!draft || !draft.supplierId || !draft.price) { toast.error('Preencha fornecedor e preço'); return }
    try {
      const r = await fetch(`/api/requisitions/${cotacaoRequisition.id}/items/${itemId}/quotes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      })
      if (r.ok) {
        toast.success('Cotação registrada!')
        setCotacaoNewQuote(prev => ({ ...prev, [itemId]: { supplierId: '', price: 0, leadTimeDays: 0 } }))
        reloadCotacao()
      } else { const err = await r.json(); toast.error(err.error || 'Erro ao registrar cotação') }
    } catch { toast.error('Erro ao registrar cotação') }
  }

  const selectItemQuote = async (itemId: string, quoteId: string) => {
    try {
      const r = await fetch(`/api/requisitions/${cotacaoRequisition.id}/items/${itemId}/quotes/${quoteId}/select`, { method: 'POST' })
      if (r.ok) { toast.success('Cotação vencedora selecionada!'); reloadCotacao() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao selecionar cotação') }
    } catch { toast.error('Erro ao selecionar cotação') }
  }

  /* ══════════════════════════════════════════════════════════════
     COMPRAS (PEDIDO DE COMPRA) ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const changePurchaseOrderStatus = async (id: string, status: string) => {
    try {
      const r = await fetch(`/api/purchase-orders/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (r.ok) { toast.success('Status atualizado!'); loadPurchaseOrders() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao mudar status') }
    } catch { toast.error('Erro ao mudar status') }
  }

  const openReceiveDialog = (po: any) => {
    setReceivePurchaseOrder(po)
    setReceiveQuantities(Object.fromEntries(po.items.map((i: any) => [i.id, Math.max(0, i.quantity - i.quantityReceived)])))
    setReceiveDialogOpen(true)
  }

  const confirmReceive = async () => {
    const items = Object.entries(receiveQuantities)
      .filter(([, q]) => Number(q) > 0)
      .map(([purchaseOrderItemId, quantityReceived]) => ({ purchaseOrderItemId, quantityReceived: Number(quantityReceived) }))
    if (items.length === 0) { toast.error('Informe ao menos uma quantidade recebida'); return }
    setReceiveSaving(true)
    try {
      const r = await fetch(`/api/purchase-orders/${receivePurchaseOrder.id}/receive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
      })
      if (r.ok) { toast.success('Recebimento registrado!'); setReceiveDialogOpen(false); loadPurchaseOrders() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao registrar recebimento') }
    } catch { toast.error('Erro ao registrar recebimento') }
    setReceiveSaving(false)
  }

  /* ══════════════════════════════════════════════════════════════
     ESTOQUE ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const openAdjustDialog = (item: any) => {
    setAdjustForm({ itemType: item.itemType, itemId: item.id, itemName: item.name, currentQty: item.stockQty, unit: item.unit, newQuantity: item.stockQty, reason: '' })
    setAdjustDialogOpen(true)
  }

  const saveStockAdjustment = async () => {
    if (!adjustForm.reason.trim()) { toast.error('Informe o motivo do ajuste'); return }
    setAdjustSaving(true)
    try {
      const r = await fetch('/api/stock/adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: adjustForm.itemType, itemId: adjustForm.itemId, newQuantity: adjustForm.newQuantity, reason: adjustForm.reason }),
      })
      if (r.ok) { toast.success('Estoque ajustado!'); setAdjustDialogOpen(false); loadStockSummary() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao ajustar estoque') }
    } catch { toast.error('Erro ao ajustar estoque') }
    setAdjustSaving(false)
  }

  const openStockHistoryFor = (item: any) => {
    setStockMovementFilter({ itemType: item.itemType, itemId: item.id, itemName: item.name })
    setStockView('movimentacoes')
  }

  /* ══════════════════════════════════════════════════════════════
     RELATORIOS ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const reportQueryString = () => {
    const params = new URLSearchParams()
    if (reportFrom) params.set('from', reportFrom)
    if (reportTo) params.set('to', reportTo)
    if (reportStatus) params.set('status', reportStatus)
    return params.toString()
  }

  const generateReport = async () => {
    setReportLoading(true)
    setReportResult(null)
    try {
      const r = await fetch(`/api/reports/${reportType}?${reportQueryString()}`)
      const json = await r.json()
      if (!r.ok) { toast.error(json.error || 'Erro ao gerar relatório'); return }
      setReportResult({ summary: json.summary, rows: json.rows })
    } catch { toast.error('Erro ao gerar relatório') }
    setReportLoading(false)
  }

  const downloadReportCsv = () => {
    window.open(`/api/reports/${reportType}?${reportQueryString()}&format=csv`, '_blank')
  }

  const downloadReportPdf = () => {
    window.open(`/api/reports/${reportType}/pdf?${reportQueryString()}`, '_blank')
  }

  /* ══════════════════════════════════════════════════════════════
     USER ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const openNewUser = () => { setEditingUserId(null); setUserForm(emptyUser()); setUserDialogOpen(true) }

  const openEditUser = (u: User) => {
    setEditingUserId(u.id)
    setUserForm({ name: u.name || '', username: u.username || '', password: '', role: u.role || 'user', active: u.active, email: u.email || '' })
    setUserDialogOpen(true)
  }

  const saveUser = async () => {
    setUserSaving(true)
    try {
      const url = editingUserId ? `/api/users/${editingUserId}` : '/api/users'
      const method = editingUserId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userForm) })
      if (r.ok) { toast.success(editingUserId ? 'Usuario atualizado!' : 'Usuario criado!'); setUserDialogOpen(false); loadUsers() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao salvar') }
    } catch { toast.error('Erro ao salvar usuario') }
    setUserSaving(false)
  }

  const deleteUser = async (id: string) => {
    if (!confirm('Deseja realmente excluir este usuario?')) return
    try {
      const r = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      if (r.ok) { toast.success('Usuario excluido!'); loadUsers() }
      else { const err = await r.json(); toast.error(err.error || 'Erro ao excluir') }
    } catch { toast.error('Erro ao excluir') }
  }

  /* ══════════════════════════════════════════════════════════════
     SETTINGS / SEQUENCE ACTIONS
     ══════════════════════════════════════════════════════════════ */

  const saveSettings = async () => {
    setSettingsSaving(true)
    try {
      const body = Object.entries(settings).map(([key, value]) => ({ key, value }))
      const r = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) toast.success('Configuracoes salvas!')
      else toast.error('Erro ao salvar')
    } catch { toast.error('Erro ao salvar') }
    setSettingsSaving(false)
  }

  const saveSequence = async (seq: Sequence) => {
    try {
      const r = await fetch('/api/sequences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(seq) })
      if (r.ok) toast.success('Sequencia atualizada!')
      else toast.error('Erro ao salvar')
    } catch { toast.error('Erro ao salvar') }
  }

  /* ══════════════════════════════════════════════════════════════
     HELPERS
     ══════════════════════════════════════════════════════════════ */

  const canAccess = (mod: ModuleKey): boolean => {
    if (mod === 'dashboard') return true // todo perfil enxerga o dashboard
    if (mod === 'pedidos') return hasPermission(userRole, 'orcamentos' as any, 'read')
    return hasPermission(userRole, mod as any, 'read')
  }

  const breadcrumbMap: Record<string, string> = {
    dashboard: 'Dashboard', orcamentos: 'Orcamentos', pedidos: 'Pedidos de Venda', clientes: 'Clientes',
    produtos: 'Produtos', materiais: 'Materias-Primas', producao: 'Producao', usuarios: 'Usuarios', configuracoes: 'Configuracoes',
    fornecedores: 'Fornecedores', requisicoes: 'Requisicoes', compras: 'Compras', estoque: 'Estoque', relatorios: 'Relatorios',
    empresa: 'Empresa', numeracao: 'Numeracao', pdf: 'PDF', sistema: 'Sistema', atualizacoes: 'Atualizacoes',
  }

  const navGroups: { label: string | null; items: { key: ModuleKey; icon: React.ReactNode; label: string }[] }[] = [
    {
      label: null,
      items: [
        { key: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Dashboard' },
      ],
    },
    {
      label: 'COMERCIAL',
      items: [
        { key: 'orcamentos', icon: <FileText className="w-5 h-5" />, label: 'Orcamentos' },
        { key: 'pedidos', icon: <Copy className="w-5 h-5" />, label: 'Pedidos de Venda' },
        { key: 'clientes', icon: <Users className="w-5 h-5" />, label: 'Clientes' },
      ],
    },
    {
      label: 'PRODUÇÃO',
      items: [
        { key: 'producao', icon: <Truck className="w-5 h-5" />, label: 'Producao' },
        { key: 'produtos', icon: <Package className="w-5 h-5" />, label: 'Produtos' },
      ],
    },
    {
      label: 'SUPRIMENTOS',
      items: [
        { key: 'materiais', icon: <Layers className="w-5 h-5" />, label: 'Materias-Primas' },
        { key: 'fornecedores', icon: <Users className="w-5 h-5" />, label: 'Fornecedores' },
        { key: 'requisicoes', icon: <FileOutput className="w-5 h-5" />, label: 'Requisicoes' },
        { key: 'compras', icon: <ShoppingCart className="w-5 h-5" />, label: 'Compras' },
        { key: 'estoque', icon: <Package className="w-5 h-5" />, label: 'Estoque' },
      ],
    },
    {
      label: 'GESTÃO',
      items: [
        { key: 'relatorios', icon: <FileText className="w-5 h-5" />, label: 'Relatorios' },
      ],
    },
    {
      label: 'ADMINISTRAÇÃO',
      items: [
        { key: 'usuarios', icon: <UserCog className="w-5 h-5" />, label: 'Usuarios' },
        { key: 'configuracoes', icon: <Settings className="w-5 h-5" />, label: 'Configuracoes' },
      ],
    },
  ]

  const configSubItems: { key: ConfigSubModule; icon: React.ReactNode; label: string }[] = [
    { key: 'empresa', icon: <Building2 className="w-4 h-4" />, label: 'Empresa' },
    { key: 'numeracao', icon: <Hash className="w-4 h-4" />, label: 'Numeracao' },
    { key: 'pdf', icon: <FileOutput className="w-4 h-4" />, label: 'PDF' },
    { key: 'sistema', icon: <ShieldCheck className="w-4 h-4" />, label: 'Sistema' },
    { key: 'atualizacoes', icon: <Download className="w-4 h-4" />, label: 'Atualizações' },
  ]

  const handleNavClick = (key: ModuleKey) => {
    setActiveModule(key)
    setMobileMenuOpen(false)
    if (key === 'configuracoes') setConfigSub('empresa')
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER: LOGIN
     ══════════════════════════════════════════════════════════════ */

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="w-16 h-16 rounded-full mx-auto" />
          <Skeleton className="w-48 h-6 mx-auto" />
          <Skeleton className="w-64 h-10 mx-auto" />
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-4">
        <Card className="w-full max-w-sm card-app rounded-2xl border-slate-200 shadow-lg">
          <CardContent className="p-8 space-y-6">
            <div className="flex flex-col items-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">COZISTEEL ERP</h1>
              <p className="text-sm text-muted-foreground">Sistema de Gestao Empresarial</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lu">Usuario</Label>
                <Input id="lu" defaultValue="admin" placeholder="Digite seu usuario" onKeyDown={(e) => e.key === 'Enter' && doLogin()} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lp">Senha</Label>
                <Input id="lp" type="password" placeholder="Digite sua senha" onKeyDown={(e) => e.key === 'Enter' && doLogin()} />
              </div>
              {loginErr && <p className="text-sm text-destructive">{loginErr}</p>}
              <Button className="w-full" onClick={doLogin} disabled={loginLoad}>
                {loginLoad ? 'Entrando...' : 'Entrar'}
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground">v3.0.0</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER: MAIN ERP LAYOUT
     ══════════════════════════════════════════════════════════════ */

  const quoteSubtotal = (quoteForm.items as QuoteItem[] || []).reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const quoteDiscount = (quoteForm.discountType as string) === 'percent'
    ? quoteSubtotal * ((quoteForm.discountValue as number || 0) / 100)
    : (quoteForm.discountValue as number || 0)

  const renderNav = () => (
    <nav className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="font-bold text-lg text-primary">COZISTEEL</h2>
        <p className="text-xs text-muted-foreground">ERP v3.0</p>
      </div>
      <ScrollArea className="flex-1 py-2">
        <div className="space-y-1 px-2">
          {navGroups.map((group, gi) => {
            const visibleItems = group.items.filter(n => canAccess(n.key))
            if (visibleItems.length === 0) return null
            return (
              <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
                {group.label && (
                  <p className="px-3 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/70">{group.label}</p>
                )}
                {visibleItems.map(n => (
                  <button
                    key={n.key}
                    onClick={() => handleNavClick(n.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                      activeModule === n.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {n.icon} {n.label}
                    {n.key === 'configuracoes' && activeModule === 'configuracoes' && <ChevronDown className="w-4 h-4 ml-auto" />}
                  </button>
                ))}
              </div>
            )
          })}
          {activeModule === 'configuracoes' && (
            <div className="ml-7 mt-1 space-y-1 border-l-2 border-primary/20 pl-3">
              {configSubItems.map(sub => (
                <button
                  key={sub.key}
                  onClick={() => setConfigSub(sub.key)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors text-left ${
                    configSub === sub.key ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {sub.icon} {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="p-4 border-t space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name || 'Usuario'}</p>
            <Badge variant="outline" className="text-xs">{roleLabels[userRole] || userRole}</Badge>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive" onClick={() => signOut()}>
          <LogOut className="w-4 h-4" /> Sair
        </Button>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen flex flex-col bg-app text-app">
      {/* ═══ TOP BAR ═══ */}
      <header className="sticky top-0 z-30 bg-white/95 border-b border-slate-200 h-14 flex items-center px-4 gap-4 shadow-sm">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden"><Menu className="w-5 h-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetHeader className="sr-only"><SheetTitle>Menu</SheetTitle></SheetHeader>
            {renderNav()}
          </SheetContent>
        </Sheet>
        <span className="font-bold text-lg text-primary">COZISTEEL</span>
        <div className="hidden md:flex flex-1 max-w-md mx-auto">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-9" />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Popover open={notifOpen} onOpenChange={setNotifOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" onClick={() => { if (!notifOpen) loadNotifications() }}>
                <Bell className="w-5 h-5" />
                {notifCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="p-3 border-b font-semibold text-sm">Notificações</div>
              <div className="max-h-80 overflow-y-auto">
                {notifCount === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">Nenhuma notificação no momento</p>
                ) : (
                  <>
                    {lowStockMaterials.map((m: any) => (
                      <button key={`mat-${m.id}`} onClick={() => goToNotification('produtos')} className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b flex items-start gap-2">
                        <Package className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                        <span><strong>{m.name}</strong> com estoque baixo ({m.stockQty} / mínimo {m.minStockQty} {m.unit})</span>
                      </button>
                    ))}
                    {pendingRequisitionsCount.map((r: any) => (
                      <button key={`req-${r.id}`} onClick={() => goToNotification('requisicoes')} className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b flex items-start gap-2">
                        <FileOutput className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                        <span>Requisição <strong>{r.number}</strong> aguardando aprovação</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <span className="text-sm font-medium hidden lg:inline">{user?.name}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => signOut()} title="Sair">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ═══ SIDEBAR (desktop) ═══ */}
        <aside className="hidden md:flex w-64 border-r border-slate-200 bg-white flex-shrink-0">
          <div className="w-full">{renderNav()}</div>
        </aside>

        {/* ═══ MAIN CONTENT ═══ */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <span>COZISTEEL ERP</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-foreground font-medium">{breadcrumbMap[activeModule]}</span>
            {activeModule === 'configuracoes' && (
              <>
                <ChevronRight className="w-4 h-4" />
                <span className="text-foreground font-medium">{breadcrumbMap[configSub]}</span>
              </>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════
              DASHBOARD MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'dashboard' && (
            <div className="space-y-6">
              {dashLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {[1, 2, 3, 4].map(i => (
                    <Card key={i} className="rounded-xl"><CardContent className="p-5 space-y-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-20" /></CardContent></Card>
                  ))}
                </div>
              ) : dashStats ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    <Card className="rounded-xl border bg-background">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Orcamentos</p>
                          <p className="text-2xl font-bold">{dashStats.totalQuotes}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="rounded-xl border bg-background">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <Users className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Clientes</p>
                          <p className="text-2xl font-bold">{dashStats.totalClients}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="rounded-xl border bg-background">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                          <Package className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Produtos</p>
                          <p className="text-2xl font-bold">{dashStats.totalProducts}</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="rounded-xl border bg-background">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                          <Truck className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Faturamento</p>
                          <p className="text-2xl font-bold">R$ {formatCurrency(dashStats.totalRevenue)}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader><CardTitle className="text-lg">Orcamentos Recentes</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Numero</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(dashStats.recentQuotes || []).length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum orcamento encontrado</TableCell></TableRow>
                          ) : (dashStats.recentQuotes || []).map(q => (
                            <TableRow key={q.id}>
                              <TableCell className="font-mono font-medium text-primary">{q.number}</TableCell>
                              <TableCell>{q.clientName || '-'}</TableCell>
                              <TableCell>{q.date}</TableCell>
                              <TableCell className="text-right font-mono">R$ {formatCurrency(q.total)}</TableCell>
                              <TableCell><Badge className={statusColors[q.status] || ''}>{statusLabels[q.status] || q.status}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <p className="text-muted-foreground text-center py-12">Erro ao carregar estatisticas</p>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              ORCAMENTOS MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'orcamentos' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold">Orcamentos</h2>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Buscar..." className="pl-9 w-48" value={quoteSearch} onChange={e => setQuoteSearch(e.target.value)} />
                  </div>
                  <Button onClick={openNewQuote}><Plus className="w-4 h-4 mr-1" /> Novo</Button>
                </div>
              </div>

              <Tabs value={quoteStatusFilter} onValueChange={setQuoteStatusFilter}>
                <TabsList>
                  <TabsTrigger value="all">Todos</TabsTrigger>
                  <TabsTrigger value="draft">Rascunho</TabsTrigger>
                  <TabsTrigger value="sent">Enviado</TabsTrigger>
                  <TabsTrigger value="approved">Aprovado</TabsTrigger>
                  <TabsTrigger value="rejected">Rejeitado</TabsTrigger>
                </TabsList>
              </Tabs>

              <Card><CardContent className="p-0">
                {quotesLoading ? (
                  <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Numero</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Acoes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotes.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum orcamento encontrado</TableCell></TableRow>
                      ) : quotes.map(q => (
                        <TableRow key={q.id}>
                          <TableCell className="font-mono font-medium text-primary">{q.number}</TableCell>
                          <TableCell>{q.clientName || '-'}</TableCell>
                          <TableCell>{q.date}</TableCell>
                          <TableCell className="text-right font-mono">R$ {formatCurrency(q.total)}</TableCell>
                          <TableCell>
                            <Select value={q.status} onValueChange={v => changeQuoteStatus(q.id, v)}>
                              <SelectTrigger className="w-36 h-8">
                                <SelectValue><Badge className={statusColors[q.status] || ''}>{statusLabels[q.status] || q.status}</Badge></SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              {q.status === 'approved' && !q.salesOrder && (
                                <Button variant="ghost" size="icon" onClick={() => convertQuoteToOrder(q.id)} title="Converter em Pedido de Venda"><ShoppingCart className="w-4 h-4 text-emerald-600" /></Button>
                              )}
                              {q.salesOrder && (
                                <Button variant="ghost" size="icon" onClick={() => { setActiveModule('pedidos') }} title={`Já convertido: ${q.salesOrder.number}`}><ShoppingCart className="w-4 h-4 text-muted-foreground" /></Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => openEditQuote(q.id)} title="Editar"><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => duplicateQuote(q.id)} title="Duplicar"><Copy className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => window.open(`/api/quotes/${q.id}/pdf`, '_blank')} title="Baixar PDF"><Download className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => window.open(`/api/quotes/${q.id}/transport-pdf`, '_blank')} title="Romaneio de Transporte (PDF)"><Truck className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteQuote(q.id)} title="Excluir"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>

              {/* ═══ QUOTE FORM DIALOG ═══ */}
              <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingQuoteId ? 'Editar Orcamento' : 'Novo Orcamento'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6">
                    {/* Buyer Info */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Dados do Cliente</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                          <Label>Cliente cadastrado</Label>
                          <Select value={quoteForm.clientId as string || undefined} onValueChange={selectQuoteClient}>
                            <SelectTrigger><SelectValue placeholder="Selecionar um cliente já cadastrado (preenche os campos abaixo)" /></SelectTrigger>
                            <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{(c.tradeName || c.corporateName) + (c.cpfCnpj ? ` — ${c.cpfCnpj}` : '')}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5"><Label>Nome / Razao Social</Label><Input value={quoteForm.clientName as string || ''} onChange={e => setQuoteForm({ ...quoteForm, clientName: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label>CNPJ / CPF</Label><Input value={quoteForm.clientCnpj as string || ''} onChange={e => setQuoteForm({ ...quoteForm, clientCnpj: maskCpfCnpj(e.target.value) })} onBlur={e => handleCnpjLookup(e.target.value, setQuoteForm, { corporateName: 'clientName', address: 'clientAddress', neighborhood: 'clientNeighborhood', zipCode: 'clientCep', phone: 'clientPhone', email: 'clientEmail' })} /></div>
                        <div className="space-y-1.5"><Label>Contato</Label><Input value={quoteForm.clientContact as string || ''} onChange={e => setQuoteForm({ ...quoteForm, clientContact: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label>Telefone</Label><Input value={quoteForm.clientPhone as string || ''} onChange={e => setQuoteForm({ ...quoteForm, clientPhone: maskPhone(e.target.value) })} /></div>
                        <div className="space-y-1.5"><Label>E-mail</Label><Input value={quoteForm.clientEmail as string || ''} onChange={e => setQuoteForm({ ...quoteForm, clientEmail: e.target.value })} /></div>
                        <div className="space-y-1 sm:col-span-2 lg:col-span-2"><Label>Endereco</Label><Input value={quoteForm.clientAddress as string || ''} onChange={e => setQuoteForm({ ...quoteForm, clientAddress: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label>Bairro</Label><Input value={quoteForm.clientNeighborhood as string || ''} onChange={e => setQuoteForm({ ...quoteForm, clientNeighborhood: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label>CEP</Label><Input value={quoteForm.clientCep as string || ''} onChange={e => setQuoteForm({ ...quoteForm, clientCep: maskCep(e.target.value) })} onBlur={e => handleCepLookup(e.target.value, setQuoteForm, { address: 'clientAddress', neighborhood: 'clientNeighborhood' })} /></div>
                      </div>
                    </div>

                    <Separator />

                    {/* Items */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Itens</h3>
                        <Button variant="outline" size="sm" onClick={addQuoteItem}><Plus className="w-4 h-4 mr-1" /> Item</Button>
                      </div>
                      <div className="border rounded-lg overflow-x-auto">
                        <div className="min-w-[900px]">
                          <div className="grid grid-cols-[28px_200px_110px_1fr_100px_130px_120px_36px] gap-2 px-3 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
                            <span>#</span>
                            <span>Produto</span>
                            <span>Codigo</span>
                            <span>Descricao</span>
                            <span>Qtd</span>
                            <span>Valor Unit.</span>
                            <span className="text-right">Total</span>
                            <span></span>
                          </div>
                          {(quoteForm.items as QuoteItem[] || []).map((item, idx) => (
                            <div key={idx} className="grid grid-cols-[28px_200px_110px_1fr_100px_130px_120px_36px] gap-2 px-3 py-2 items-center border-b last:border-b-0">
                              <span className="text-muted-foreground text-xs">{idx + 1}</span>
                              <Select value={item.productId || undefined} onValueChange={v => selectQuoteItemProduct(idx, v)}>
                                <SelectTrigger><SelectValue placeholder="Avulso" /></SelectTrigger>
                                <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                              </Select>
                              <Input value={item.code} onChange={e => updateQuoteItem(idx, 'code', e.target.value)} />
                              <Input value={item.description} onChange={e => updateQuoteItem(idx, 'description', e.target.value)} />
                              <Input className="text-right" type="number" value={item.quantity} onChange={e => updateQuoteItem(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                              <Input className="text-right" type="number" step="0.01" value={item.unitPrice} onChange={e => updateQuoteItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                              <span className="text-right font-mono text-sm">R$ {formatCurrency(item.quantity * item.unitPrice)}</span>
                              <Button variant="ghost" size="icon" onClick={() => removeQuoteItem(idx)}><X className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Footer fields */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Condicoes</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1.5">
                          <Label>Desconto</Label>
                          <div className="flex gap-2">
                            <Select value={quoteForm.discountType as string || 'value'} onValueChange={v => setQuoteForm({ ...quoteForm, discountType: v })}>
                              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="value">R$</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
                            </Select>
                            <Input type="number" step="0.01" className="flex-1 min-w-0" value={quoteForm.discountValue as number || 0} onChange={e => setQuoteForm({ ...quoteForm, discountValue: parseFloat(e.target.value) || 0 })} />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Frete</Label>
                          <Select value={quoteForm.freightMode as string || 'combined'} onValueChange={v => setQuoteForm({ ...quoteForm, freightMode: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="combined">A combinar</SelectItem><SelectItem value="seller">Emitente</SelectItem><SelectItem value="buyer">Destinatario</SelectItem></SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Valor Frete</Label>
                          <Input type="number" step="0.01" value={quoteForm.freightValue as number || 0} onChange={e => setQuoteForm({ ...quoteForm, freightValue: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Observacoes Frete</Label>
                          <Input value={quoteForm.freightText as string || ''} onChange={e => setQuoteForm({ ...quoteForm, freightText: e.target.value })} />
                        </div>
                        <div className="space-y-1.5"><Label>Condicao Pgto</Label><Input value={quoteForm.paymentTerms as string || ''} onChange={e => setQuoteForm({ ...quoteForm, paymentTerms: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label>Garantia</Label><Input value={quoteForm.warranty as string || ''} onChange={e => setQuoteForm({ ...quoteForm, warranty: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label>Validade</Label><Input value={quoteForm.validity as string || ''} onChange={e => setQuoteForm({ ...quoteForm, validity: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label>Prazo Entrega</Label><Input value={quoteForm.deliveryTime as string || ''} onChange={e => setQuoteForm({ ...quoteForm, deliveryTime: e.target.value })} /></div>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <Label>Observacoes</Label>
                        <Textarea rows={3} value={quoteForm.notes as string || ''} onChange={e => setQuoteForm({ ...quoteForm, notes: e.target.value })} />
                      </div>
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end">
                      <div className="w-64 space-y-2 text-sm border rounded-lg p-4">
                        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">R$ {formatCurrency(quoteSubtotal)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="font-mono text-destructive">- R$ {formatCurrency(quoteDiscount)}</span></div>
                        <Separator />
                        <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="font-mono text-primary">R$ {formatCurrency(quoteSubtotal - quoteDiscount)}</span></div>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setQuoteDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={saveQuote} disabled={quoteSaving}>{quoteSaving ? 'Salvando...' : 'Salvar'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              PEDIDOS DE VENDA MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'pedidos' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold">Pedidos de Venda</h2>
                <Select value={salesOrderStatusFilter} onValueChange={setSalesOrderStatusFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    {Object.entries(salesOrderStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground -mt-2">
                Pedidos nascem da conversão de um orçamento aprovado (botão de carrinho na aba Orçamentos).
              </p>

              <Card><CardContent className="p-0">
                {salesOrdersLoading ? (
                  <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>OPs geradas</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum pedido de venda ainda</TableCell></TableRow>
                      ) : salesOrders.map((so: any) => (
                        <TableRow key={so.id}>
                          <TableCell className="font-mono text-sm">{so.number}</TableCell>
                          <TableCell className="font-medium">{so.clientName || so.client?.corporateName || '-'}</TableCell>
                          <TableCell>{so.date}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">Orç. {so.quote?.number}</TableCell>
                          <TableCell className="text-right font-mono">R$ {formatCurrency(so.total)}</TableCell>
                          <TableCell>
                            <Select value={so.status} onValueChange={v => changeSalesOrderStatus(so.id, v)}>
                              <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(salesOrderStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm">{so.productionOrders?.length || 0}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => window.open(`/api/sales-orders/${so.id}/pdf`, '_blank')} title="PDF"><FileOutput className="w-4 h-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              CLIENTES MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'clientes' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold">Clientes</h2>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Buscar..." className="pl-9 w-48" value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
                  </div>
                  <Button onClick={openNewClient}><Plus className="w-4 h-4 mr-1" /> Novo</Button>
                </div>
              </div>

              <Card><CardContent className="p-0">
                {clientsLoading ? (
                  <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>CNPJ / CPF</TableHead>
                        <TableHead>Cidade / UF</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead className="text-right">Acoes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado</TableCell></TableRow>
                      ) : clients.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.corporateName || c.tradeName || '-'}</TableCell>
                          <TableCell className="font-mono text-sm">{c.cpfCnpj || '-'}</TableCell>
                          <TableCell>{c.city ? `${c.city}/${c.state}` : '-'}</TableCell>
                          <TableCell>{c.phone || '-'}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => openEditClient(c)} title="Editar"><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteClient(c.id)} title="Excluir"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>

              {/* ═══ CLIENT FORM DIALOG ═══ */}
              <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingClientId ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5"><Label>Razao Social</Label><Input value={clientForm.corporateName as string || ''} onChange={e => setClientForm({ ...clientForm, corporateName: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Nome Fantasia</Label><Input value={clientForm.tradeName as string || ''} onChange={e => setClientForm({ ...clientForm, tradeName: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>CNPJ / CPF</Label><Input value={clientForm.cpfCnpj as string || ''} onChange={e => setClientForm({ ...clientForm, cpfCnpj: maskCpfCnpj(e.target.value) })} onBlur={e => handleCnpjLookup(e.target.value, setClientForm, { corporateName: 'corporateName', tradeName: 'tradeName', address: 'address', neighborhood: 'neighborhood', city: 'city', state: 'state', zipCode: 'zipCode', phone: 'phone', email: 'email' })} /></div>
                    <div className="space-y-1.5"><Label>Inscricao Estadual</Label><Input value={clientForm.ie as string || ''} onChange={e => setClientForm({ ...clientForm, ie: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={clientForm.email as string || ''} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Telefone</Label><Input value={clientForm.phone as string || ''} onChange={e => setClientForm({ ...clientForm, phone: maskPhone(e.target.value) })} /></div>
                    <div className="space-y-1.5"><Label>Contato</Label><Input value={clientForm.contactName as string || ''} onChange={e => setClientForm({ ...clientForm, contactName: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Telefone Contato</Label><Input value={clientForm.contactPhone as string || ''} onChange={e => setClientForm({ ...clientForm, contactPhone: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>CEP</Label><Input value={clientForm.zipCode as string || ''} onChange={e => setClientForm({ ...clientForm, zipCode: maskCep(e.target.value) })} onBlur={e => handleCepLookup(e.target.value, setClientForm)} /></div>
                    <div className="space-y-1 sm:col-span-2"><Label>Endereco</Label><Input value={clientForm.address as string || ''} onChange={e => setClientForm({ ...clientForm, address: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Bairro</Label><Input value={clientForm.neighborhood as string || ''} onChange={e => setClientForm({ ...clientForm, neighborhood: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Cidade</Label><Input value={clientForm.city as string || ''} onChange={e => setClientForm({ ...clientForm, city: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Estado</Label><Input value={clientForm.state as string || ''} onChange={e => setClientForm({ ...clientForm, state: e.target.value })} /></div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setClientDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={saveClient} disabled={clientSaving}>{clientSaving ? 'Salvando...' : 'Salvar'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              PRODUTOS MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'produtos' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold">Produtos</h2>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Buscar..." className="pl-9 w-48" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                  </div>
                  <Button onClick={openNewProduct}><Plus className="w-4 h-4 mr-1" /> Novo</Button>
                </div>
              </div>

              <Card><CardContent className="p-0">
                {productsLoading ? (
                  <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14"></TableHead>
                        <TableHead>Codigo</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Preco Venda</TableHead>
                        <TableHead className="text-right">Peso</TableHead>
                        <TableHead className="text-right">Acoes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado</TableCell></TableRow>
                      ) : products.map(p => (
                        <TableRow key={p.id}>
                          <TableCell>
                            {(p as any).images?.[0] ? (
                              <img src={`/api/uploads/${(p as any).images[0].url}`} alt="" className="w-10 h-10 object-cover rounded border" />
                            ) : (
                              <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{p.internalCode || '-'}</TableCell>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.category?.name || '-'}</TableCell>
                          <TableCell className="text-right font-mono">R$ {formatCurrency(p.salePrice)}</TableCell>
                          <TableCell className="text-right font-mono">{p.weight ? `${p.weight} kg` : '-'}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => openEditProduct(p)} title="Editar"><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteProduct(p.id)} title="Desativar"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>

              {/* ═══ PRODUCT FORM DIALOG ═══ */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card>
                  <CardHeader><CardTitle className="text-base">Cadastros auxiliares</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nova categoria</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2">
                        <Input placeholder="Nome" value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} />
                        <Input placeholder="slug" value={categoryForm.slug} onChange={e => setCategoryForm({ ...categoryForm, slug: e.target.value })} />
                      </div>
                      <Button size="sm" onClick={saveCategory} disabled={categorySaving}>{categorySaving ? 'Salvando...' : 'Salvar categoria'}</Button>
                    </div>
                    <div className="space-y-2">
                      <Label>Matérias-primas</Label>
                      <p className="text-sm text-muted-foreground">O cadastro completo de matéria-prima (estoque, custo, fornecedores) agora tem uma aba própria.</p>
                      <Button size="sm" variant="outline" onClick={() => setActiveModule('materiais')}><Package className="w-4 h-4 mr-1" /> Ir para Matérias-primas</Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingProductId ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5"><Label>Codigo Interno</Label><Input value={productForm.internalCode as string || ''} onChange={e => setProductForm({ ...productForm, internalCode: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Nome</Label><Input value={productForm.name as string || ''} onChange={e => setProductForm({ ...productForm, name: e.target.value })} /></div>
                    <div className="space-y-1 sm:col-span-2"><Label>Descricao</Label><Textarea rows={2} value={productForm.description as string || ''} onChange={e => setProductForm({ ...productForm, description: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Categoria</Label><Select value={productForm.categoryId as string || ''} onValueChange={v => setProductForm({ ...productForm, categoryId: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1.5"><Label>Material</Label><Select value={productForm.materialId as string || ''} onValueChange={v => setProductForm({ ...productForm, materialId: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{materials.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1.5"><Label>Unidade</Label><Input value={productForm.unit as string || 'UN'} onChange={e => setProductForm({ ...productForm, unit: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Preco Custo</Label><Input type="number" step="0.01" value={productForm.costPrice as number || 0} onChange={e => setProductForm({ ...productForm, costPrice: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>Preco Venda</Label><Input type="number" step="0.01" value={productForm.salePrice as number || 0} onChange={e => setProductForm({ ...productForm, salePrice: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>Peso (kg)</Label><Input type="number" step="0.01" value={productForm.weight as number || 0} onChange={e => setProductForm({ ...productForm, weight: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>Largura (cm)</Label><Input type="number" step="0.01" value={productForm.width as number || 0} onChange={e => setProductForm({ ...productForm, width: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>Altura (cm)</Label><Input type="number" step="0.01" value={productForm.height as number || 0} onChange={e => setProductForm({ ...productForm, height: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>Comprimento (cm)</Label><Input type="number" step="0.01" value={productForm.length as number || 0} onChange={e => setProductForm({ ...productForm, length: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>Espessura (mm)</Label><Input type="number" step="0.01" value={productForm.thickness as number || 0} onChange={e => setProductForm({ ...productForm, thickness: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>NCM</Label><Input value={productForm.ncm as string || ''} onChange={e => setProductForm({ ...productForm, ncm: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>IPI (%)</Label><Input type="number" step="0.01" value={productForm.ipi as number || 0} onChange={e => setProductForm({ ...productForm, ipi: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>ICMS (%)</Label><Input type="number" step="0.01" value={productForm.icms as number || 0} onChange={e => setProductForm({ ...productForm, icms: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>Acabamento</Label><Input value={productForm.finish as string || ''} onChange={e => setProductForm({ ...productForm, finish: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Familia</Label><Input value={productForm.family as string || ''} onChange={e => setProductForm({ ...productForm, family: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Linha</Label><Input value={productForm.line as string || ''} onChange={e => setProductForm({ ...productForm, line: e.target.value })} /></div>
                    <div className="space-y-1 sm:col-span-2"><Label>Observações</Label><Textarea rows={3} value={productForm.notes as string || ''} onChange={e => setProductForm({ ...productForm, notes: e.target.value })} /></div>
                  </div>

                  {editingProductId && (
                    <div className="border-t pt-4 mt-2 space-y-3">
                      <Label className="text-sm font-semibold">Imagens do produto</Label>
                      {productImages.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhuma imagem enviada ainda.</p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                          {productImages.map((img: any) => (
                            <div key={img.id} className="relative group border rounded-lg overflow-hidden">
                              <img src={`/api/uploads/${img.url}`} alt="" className="w-full h-24 object-cover" />
                              {img.isPrimary && <Badge className="absolute top-1 left-1 text-[10px] bg-emerald-600">Principal</Badge>}
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                {!img.isPrimary && (
                                  <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => setPrimaryProductImage(img.id)} title="Definir como principal"><ShieldCheck className="w-3.5 h-3.5" /></Button>
                                )}
                                <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => deleteProductImage(img.id)} title="Remover"><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div>
                        <input
                          type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                          id="product-image-upload" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadProductImage(f); e.target.value = '' }}
                        />
                        <Button size="sm" variant="outline" disabled={productImageUploading} onClick={() => document.getElementById('product-image-upload')?.click()}>
                          {productImageUploading ? 'Enviando...' : 'Enviar imagem'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {editingProductId && (
                    <div className="border-t pt-4 mt-2 space-y-3">
                      <Label className="text-sm font-semibold">Matérias-primas consumidas (receita)</Label>
                      {productMaterialLinks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhuma matéria-prima vinculada ainda.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {productMaterialLinks.map((l: any) => (
                            <div key={l.materialId} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                              <span>{l.material?.name} — {l.quantity} {l.unit} {l.scrapPct > 0 ? `(+${l.scrapPct}% perda)` : ''}</span>
                              <Button variant="ghost" size="icon" onClick={() => unlinkProductMaterial(l.materialId)} title="Remover"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                        <div className="sm:col-span-2 space-y-1.5">
                          <Label className="text-xs">Matéria-prima</Label>
                          <Select value={newProductMaterial.materialId} onValueChange={v => setNewProductMaterial({ ...newProductMaterial, materialId: v })}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>{materialsFull.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5"><Label className="text-xs">Qtd</Label><Input type="number" step="0.01" value={newProductMaterial.quantity} onChange={e => setNewProductMaterial({ ...newProductMaterial, quantity: parseFloat(e.target.value) || 0 })} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">Unidade</Label><Input value={newProductMaterial.unit} onChange={e => setNewProductMaterial({ ...newProductMaterial, unit: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">% Perda</Label><Input type="number" step="0.01" value={newProductMaterial.scrapPct} onChange={e => setNewProductMaterial({ ...newProductMaterial, scrapPct: parseFloat(e.target.value) || 0 })} /></div>
                      </div>
                      <Button size="sm" variant="outline" onClick={linkProductMaterial}>Vincular matéria-prima</Button>
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setProductDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={saveProduct} disabled={productSaving}>{productSaving ? 'Salvando...' : 'Salvar'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              MATERIA-PRIMA MODULE (dedicado)
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'materiais' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold">Matérias-Primas</h2>
                <Button onClick={openNewMaterialFull}><Plus className="w-4 h-4 mr-1" /> Nova</Button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar por nome ou código..." className="pl-9" value={materialSearchFull} onChange={e => setMaterialSearchFull(e.target.value)} />
                </div>
                <Select value={materialCategoryFilter || 'all'} onValueChange={v => setMaterialCategoryFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 px-3 border rounded-md">
                  <input type="checkbox" id="matLowOnly" checked={materialLowOnlyFull} onChange={e => setMaterialLowOnlyFull(e.target.checked)} />
                  <Label htmlFor="matLowOnly" className="text-sm whitespace-nowrap">Só estoque baixo</Label>
                </div>
              </div>

              <Card><CardContent className="p-0">
                {materialsPageLoading ? (
                  <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Estoque</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead className="text-right">Fornecedores</TableHead>
                        <TableHead className="text-right">Produtos</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materialsPage.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma matéria-prima cadastrada</TableCell></TableRow>
                      ) : materialsPage.map((m: any) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-mono text-sm">{m.internalCode || '-'}</TableCell>
                          <TableCell className="font-medium">{m.name}</TableCell>
                          <TableCell className="text-sm">{m.category?.name || '-'}</TableCell>
                          <TableCell className={`text-right font-mono ${m.stockQty <= m.minStockQty ? 'text-destructive font-bold' : ''}`}>{m.stockQty} {m.unit}</TableCell>
                          <TableCell className="text-right font-mono text-sm">R$ {formatCurrency(m.costPrice)}</TableCell>
                          <TableCell className="text-right">{m._count?.suppliers ?? 0}</TableCell>
                          <TableCell className="text-right">{m._count?.products ?? 0}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => openEditMaterialFull(m)} title="Editar"><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteMaterialFull(m.id)} title="Excluir"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>

              <Dialog open={materialFullDialogOpen} onOpenChange={setMaterialFullDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{editingMaterialFullId ? 'Editar Matéria-Prima' : 'Nova Matéria-Prima'}</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5"><Label>Código interno</Label><Input value={materialFullForm.internalCode as string || ''} onChange={e => setMaterialFullForm({ ...materialFullForm, internalCode: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Nome</Label><Input value={materialFullForm.name as string || ''} onChange={e => setMaterialFullForm({ ...materialFullForm, name: e.target.value })} /></div>
                    <div className="space-y-1.5">
                      <Label>Categoria</Label>
                      <Select value={materialFullForm.categoryId as string || undefined} onValueChange={v => setMaterialFullForm({ ...materialFullForm, categoryId: v })}>
                        <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                        <SelectContent>{categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label>Unidade</Label><Input placeholder="KG, UN, M, M2, L..." value={materialFullForm.unit as string || ''} onChange={e => setMaterialFullForm({ ...materialFullForm, unit: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Densidade (g/cm³)</Label><Input type="number" step="0.01" value={materialFullForm.density as number || 0} onChange={e => setMaterialFullForm({ ...materialFullForm, density: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>Custo unitário (R$)</Label><Input type="number" step="0.01" value={materialFullForm.costPrice as number || 0} onChange={e => setMaterialFullForm({ ...materialFullForm, costPrice: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>Estoque atual</Label><Input type="number" step="0.01" value={materialFullForm.stockQty as number || 0} onChange={e => setMaterialFullForm({ ...materialFullForm, stockQty: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5"><Label>Estoque mínimo</Label><Input type="number" step="0.01" value={materialFullForm.minStockQty as number || 0} onChange={e => setMaterialFullForm({ ...materialFullForm, minStockQty: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="space-y-1.5 sm:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={materialFullForm.description as string || ''} onChange={e => setMaterialFullForm({ ...materialFullForm, description: e.target.value })} /></div>
                    <div className="space-y-1.5 sm:col-span-2"><Label>Observações</Label><Textarea rows={2} value={materialFullForm.notes as string || ''} onChange={e => setMaterialFullForm({ ...materialFullForm, notes: e.target.value })} /></div>
                  </div>

                  {editingMaterialFullId && (
                    <div className="border-t pt-4 mt-2 space-y-4">
                      <div>
                        <Label className="text-sm font-semibold">Fornecedores desta matéria-prima</Label>
                        {materialDetailSuppliers.length === 0 ? (
                          <p className="text-xs text-muted-foreground mt-1">Nenhum fornecedor vinculado ainda — vincule pela tela de Fornecedores.</p>
                        ) : (
                          <div className="space-y-1 mt-2">
                            {materialDetailSuppliers.map((l: any) => (
                              <div key={l.supplierId} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                                <span>{l.supplier?.corporateName || l.supplier?.tradeName} — R$ {formatCurrency(l.lastPrice)} {l.isPreferred ? '★ preferencial' : ''}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <Label className="text-sm font-semibold">Produtos que consomem esta matéria-prima</Label>
                        {materialDetailProducts.length === 0 ? (
                          <p className="text-xs text-muted-foreground mt-1">Nenhum produto vinculado ainda — vincule pela tela de Produtos.</p>
                        ) : (
                          <div className="space-y-1 mt-2">
                            {materialDetailProducts.map((l: any) => (
                              <div key={l.productId} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                                <span>{l.product?.name} — {l.quantity} {l.unit}/un {l.scrapPct > 0 ? `(+${l.scrapPct}% perda)` : ''}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setMaterialFullDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={saveMaterialFull} disabled={materialFullSaving}>{materialFullSaving ? 'Salvando...' : 'Salvar'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              FORNECEDORES MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'fornecedores' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold">Fornecedores</h2>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Buscar..." className="pl-9 w-48" value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadSuppliers()} />
                  </div>
                  <Button onClick={openNewSupplier}><Plus className="w-4 h-4 mr-1" /> Novo</Button>
                </div>
              </div>

              <Card><CardContent className="p-0">
                {suppliersLoading ? (
                  <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Razão Social</TableHead>
                        <TableHead>CNPJ/CPF</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead className="text-right">Matérias-primas</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suppliers.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum fornecedor cadastrado</TableCell></TableRow>
                      ) : suppliers.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.corporateName || s.tradeName}</TableCell>
                          <TableCell className="font-mono text-sm">{s.cpfCnpj || '-'}</TableCell>
                          <TableCell>{s.contactName || '-'}</TableCell>
                          <TableCell>{s.phone || '-'}</TableCell>
                          <TableCell className="text-right">{s._count?.materials ?? 0}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => openEditSupplier(s)} title="Editar"><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteSupplier(s.id)} title="Excluir"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>

              <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{editingSupplierId ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5"><Label>Razão Social</Label><Input value={supplierForm.corporateName as string || ''} onChange={e => setSupplierForm({ ...supplierForm, corporateName: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Nome Fantasia</Label><Input value={supplierForm.tradeName as string || ''} onChange={e => setSupplierForm({ ...supplierForm, tradeName: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>CNPJ/CPF</Label><Input value={supplierForm.cpfCnpj as string || ''} onChange={e => setSupplierForm({ ...supplierForm, cpfCnpj: maskCpfCnpj(e.target.value) })} onBlur={e => handleCnpjLookup(e.target.value, setSupplierForm, { corporateName: 'corporateName', tradeName: 'tradeName', address: 'address', neighborhood: 'neighborhood', city: 'city', state: 'state', zipCode: 'zipCode', phone: 'phone', email: 'email' })} /></div>
                    <div className="space-y-1.5"><Label>Inscrição Estadual</Label><Input value={supplierForm.ie as string || ''} onChange={e => setSupplierForm({ ...supplierForm, ie: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={supplierForm.email as string || ''} onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Telefone</Label><Input value={supplierForm.phone as string || ''} onChange={e => setSupplierForm({ ...supplierForm, phone: maskPhone(e.target.value) })} /></div>
                    <div className="space-y-1.5"><Label>Contato</Label><Input value={supplierForm.contactName as string || ''} onChange={e => setSupplierForm({ ...supplierForm, contactName: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Telefone do contato</Label><Input value={supplierForm.contactPhone as string || ''} onChange={e => setSupplierForm({ ...supplierForm, contactPhone: maskPhone(e.target.value) })} /></div>
                    <div className="space-y-1.5"><Label>CEP</Label><Input value={supplierForm.zipCode as string || ''} onChange={e => setSupplierForm({ ...supplierForm, zipCode: maskCep(e.target.value) })} onBlur={e => handleCepLookup(e.target.value, setSupplierForm)} /></div>
                    <div className="space-y-1.5"><Label>Endereço</Label><Input value={supplierForm.address as string || ''} onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Bairro</Label><Input value={supplierForm.neighborhood as string || ''} onChange={e => setSupplierForm({ ...supplierForm, neighborhood: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Cidade</Label><Input value={supplierForm.city as string || ''} onChange={e => setSupplierForm({ ...supplierForm, city: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>UF</Label><Input value={supplierForm.state as string || ''} onChange={e => setSupplierForm({ ...supplierForm, state: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Condições de pagamento</Label><Input value={supplierForm.paymentTerms as string || ''} onChange={e => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Prazo médio de entrega (dias)</Label><Input type="number" value={supplierForm.leadTimeDays as number || 0} onChange={e => setSupplierForm({ ...supplierForm, leadTimeDays: parseInt(e.target.value) || 0 })} /></div>
                    <div className="space-y-1 sm:col-span-2"><Label>Observações</Label><Textarea rows={2} value={supplierForm.notes as string || ''} onChange={e => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></div>
                  </div>

                  {editingSupplierId && (
                    <div className="border-t pt-4 mt-2 space-y-3">
                      <Label className="text-sm font-semibold">Matérias-primas fornecidas</Label>
                      {supplierMaterialLinks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhuma matéria-prima vinculada ainda.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {supplierMaterialLinks.map((l: any) => (
                            <div key={l.materialId} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                              <span>{l.material?.name} — R$ {formatCurrency(l.lastPrice)} {l.isPreferred ? '★ preferencial' : ''}</span>
                              <Button variant="ghost" size="icon" onClick={() => unlinkSupplierMaterial(l.materialId)} title="Remover"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                        <div className="sm:col-span-2 space-y-1.5">
                          <Label className="text-xs">Matéria-prima</Label>
                          <Select value={newSupplierMaterial.materialId} onValueChange={v => setNewSupplierMaterial({ ...newSupplierMaterial, materialId: v })}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>{materialsFull.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5"><Label className="text-xs">Preço (R$)</Label><Input type="number" step="0.01" value={newSupplierMaterial.lastPrice} onChange={e => setNewSupplierMaterial({ ...newSupplierMaterial, lastPrice: parseFloat(e.target.value) || 0 })} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">Prazo (dias)</Label><Input type="number" value={newSupplierMaterial.leadTimeDays} onChange={e => setNewSupplierMaterial({ ...newSupplierMaterial, leadTimeDays: parseInt(e.target.value) || 0 })} /></div>
                        <div className="flex items-center gap-2 pb-2">
                          <input type="checkbox" id="pref" checked={newSupplierMaterial.isPreferred} onChange={e => setNewSupplierMaterial({ ...newSupplierMaterial, isPreferred: e.target.checked })} />
                          <Label htmlFor="pref" className="text-xs">Preferencial</Label>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={linkSupplierMaterial}>Vincular matéria-prima</Button>
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={saveSupplier} disabled={supplierSaving}>{supplierSaving ? 'Salvando...' : 'Salvar'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              REQUISICOES MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'requisicoes' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold">Requisições de Matéria-Prima</h2>
                <div className="flex gap-2">
                  <Select value={requisitionStatusFilter} onValueChange={v => setRequisitionStatusFilter(v)}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      {Object.entries(requisitionStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={openNewRequisition}><Plus className="w-4 h-4 mr-1" /> Nova</Button>
                </div>
              </div>

              <Card><CardContent className="p-0">
                {requisitionsLoading ? (
                  <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Itens</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requisitions.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma requisição encontrada</TableCell></TableRow>
                      ) : requisitions.map((req: any) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-mono text-sm">{req.number}</TableCell>
                          <TableCell>{req.date}</TableCell>
                          <TableCell className="text-sm">{req.productionOrder ? `OP ${req.productionOrder.number}` : 'Manual'}</TableCell>
                          <TableCell>{req.items?.length || 0}</TableCell>
                          <TableCell>
                            <Select value={req.status} onValueChange={v => changeRequisitionStatus(req.id, v)}>
                              <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(requisitionStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => openCotacao(req.id)} title="Cotar fornecedores"><Users className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => window.open(`/api/requisitions/${req.id}/pdf`, '_blank')} title="PDF"><FileOutput className="w-4 h-4" /></Button>
                              {req.status === 'draft' && <Button variant="ghost" size="icon" onClick={() => deleteRequisition(req.id)} title="Excluir"><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>

              <Dialog open={requisitionDialogOpen} onOpenChange={setRequisitionDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Nova Requisição de Matéria-Prima</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <Label>Gerar a partir de uma OP (opcional)</Label>
                      <Select value={requisitionForm.productionOrderId} onValueChange={v => suggestRequisitionFromProductionOrder(v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione uma Ordem de Produção" /></SelectTrigger>
                        <SelectContent>{productionOrders.map((po: any) => <SelectItem key={po.id} value={po.id}>{po.number} — {po.productName}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label>Necessário até</Label><Input placeholder="dd/mm/aaaa" value={requisitionForm.neededBy} onChange={e => setRequisitionForm({ ...requisitionForm, neededBy: e.target.value })} /></div>
                    <div className="space-y-1 sm:col-span-2"><Label>Observações</Label><Textarea rows={2} value={requisitionForm.notes} onChange={e => setRequisitionForm({ ...requisitionForm, notes: e.target.value })} /></div>
                  </div>

                  <div className="border-t pt-4 mt-2 space-y-3">
                    <Label className="text-sm font-semibold">Itens</Label>
                    {requisitionForm.items.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end border rounded p-2">
                        <div className="sm:col-span-2 space-y-1.5">
                          <Label className="text-xs">Matéria-prima</Label>
                          <Select value={item.materialId} onValueChange={v => updateRequisitionItem(idx, { materialId: v })}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>{materialsFull.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5"><Label className="text-xs">Qtd</Label><Input type="number" step="0.01" value={item.quantity} onChange={e => updateRequisitionItem(idx, { quantity: parseFloat(e.target.value) || 0 })} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">Unid.</Label><Input value={item.unit} onChange={e => updateRequisitionItem(idx, { unit: e.target.value })} /></div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Fornecedor</Label>
                          <Select value={item.supplierId || undefined} onValueChange={v => updateRequisitionItem(idx, { supplierId: v })}>
                            <SelectTrigger><SelectValue placeholder="A definir" /></SelectTrigger>
                            <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.corporateName || s.tradeName}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-1">
                          <div className="space-y-1 flex-1"><Label className="text-xs">Preço est.</Label><Input type="number" step="0.01" value={item.estimatedPrice} onChange={e => updateRequisitionItem(idx, { estimatedPrice: parseFloat(e.target.value) || 0 })} /></div>
                          <Button variant="ghost" size="icon" className="mb-0.5" onClick={() => removeRequisitionItem(idx)} title="Remover item"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={addRequisitionItem}><Plus className="w-4 h-4 mr-1" /> Adicionar item</Button>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setRequisitionDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={saveRequisition} disabled={requisitionSaving}>{requisitionSaving ? 'Salvando...' : 'Salvar Requisição'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={cotacaoDialogOpen} onOpenChange={setCotacaoDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Cotação — {cotacaoRequisition?.number || ''}</DialogTitle>
                  </DialogHeader>
                  {cotacaoLoading ? (
                    <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                  ) : !cotacaoRequisition ? (
                    <p className="text-sm text-muted-foreground">Requisição não encontrada.</p>
                  ) : (
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground">
                        Registre o preço cotado com cada fornecedor para cada matéria-prima e selecione a cotação vencedora.
                        Ao selecionar, o fornecedor e o preço são gravados no item — isso vira o Pedido de Compra ao avançar o status da requisição.
                      </p>
                      {(cotacaoRequisition.items || []).map((item: any) => (
                        <div key={item.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex justify-between items-baseline">
                            <h4 className="font-semibold">{item.material?.name}</h4>
                            <span className="text-sm text-muted-foreground">Necessário: {item.quantity} {item.unit}</span>
                          </div>

                          {(item.quotes || []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nenhuma cotação registrada ainda.</p>
                          ) : (
                            <div className="space-y-1">
                              {item.quotes.map((q: any) => (
                                <div key={q.id} className={`flex items-center justify-between text-sm rounded px-3 py-2 ${q.isSelected ? 'bg-emerald-50 border border-emerald-300' : 'bg-muted/50'}`}>
                                  <span>
                                    {q.supplier?.corporateName || q.supplier?.tradeName} — R$ {formatCurrency(q.price)}
                                    {q.leadTimeDays > 0 ? ` · ${q.leadTimeDays} dias` : ''}
                                    {q.isSelected ? ' — ★ Vencedora' : ''}
                                  </span>
                                  {!q.isSelected && (
                                    <Button size="sm" variant="outline" onClick={() => selectItemQuote(item.id, q.id)}>Selecionar</Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end pt-2 border-t">
                            <div className="sm:col-span-2 space-y-1">
                              <Label className="text-xs">Fornecedor</Label>
                              <Select
                                value={cotacaoNewQuote[item.id]?.supplierId || undefined}
                                onValueChange={v => setCotacaoNewQuote(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || { price: 0, leadTimeDays: 0 }), supplierId: v } }))}
                              >
                                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.corporateName || s.tradeName}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Preço (R$)</Label>
                              <Input
                                type="number" step="0.01"
                                value={cotacaoNewQuote[item.id]?.price || ''}
                                onChange={e => setCotacaoNewQuote(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || { supplierId: '', leadTimeDays: 0 }), price: parseFloat(e.target.value) || 0 } }))}
                              />
                            </div>
                            <div className="flex gap-1">
                              <div className="space-y-1 flex-1">
                                <Label className="text-xs">Prazo (dias)</Label>
                                <Input
                                  type="number"
                                  value={cotacaoNewQuote[item.id]?.leadTimeDays || ''}
                                  onChange={e => setCotacaoNewQuote(prev => ({ ...prev, [item.id]: { ...(prev[item.id] || { supplierId: '', price: 0 }), leadTimeDays: parseInt(e.target.value) || 0 } }))}
                                />
                              </div>
                              <Button size="sm" variant="outline" className="mb-0.5" onClick={() => addItemQuote(item.id)}>Adicionar</Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCotacaoDialogOpen(false)}>Fechar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              COMPRAS (PEDIDO DE COMPRA) MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'compras' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold">Pedidos de Compra</h2>
                <div className="flex gap-2">
                  <Select value={purchaseOrderStatusFilter} onValueChange={v => setPurchaseOrderStatusFilter(v)}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      {Object.entries(purchaseOrderStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card><CardContent className="p-0">
                {purchaseOrdersLoading ? (
                  <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead>Requisição de origem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum pedido de compra encontrado</TableCell></TableRow>
                      ) : purchaseOrders.map((po: any) => (
                        <TableRow key={po.id}>
                          <TableCell className="font-mono text-sm">{po.number}</TableCell>
                          <TableCell>{po.supplier?.corporateName || po.supplier?.tradeName}</TableCell>
                          <TableCell className="text-sm">{po.requisition?.number || '-'}</TableCell>
                          <TableCell>
                            {['draft', 'sent', 'confirmed'].includes(po.status) ? (
                              <Select value={po.status} onValueChange={v => changePurchaseOrderStatus(po.id, v)}>
                                <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {['draft', 'sent', 'confirmed', 'cancelled'].map(k => <SelectItem key={k} value={k}>{purchaseOrderStatusLabels[k]}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline">{purchaseOrderStatusLabels[po.status] || po.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(po.total)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => window.open(`/api/purchase-orders/${po.id}/pdf`, '_blank')} title="PDF"><FileOutput className="w-4 h-4" /></Button>
                              {['confirmed', 'partially_received'].includes(po.status) && (
                                <Button variant="ghost" size="icon" onClick={() => openReceiveDialog(po)} title="Receber mercadoria"><Package className="w-4 h-4" /></Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>

              <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Receber Pedido de Compra — {receivePurchaseOrder?.number || ''}</DialogTitle></DialogHeader>
                  {receivePurchaseOrder && (
                    <div className="space-y-3">
                      {(receivePurchaseOrder.items || []).map((item: any) => {
                        const outstanding = Math.max(0, item.quantity - item.quantityReceived)
                        return (
                          <div key={item.id} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end border rounded p-2">
                            <div className="sm:col-span-2">
                              <Label className="text-xs">Matéria-prima</Label>
                              <p className="text-sm font-medium">{item.material?.name}</p>
                            </div>
                            <div><Label className="text-xs">Qtd Pedida</Label><p className="text-sm">{item.quantity} {item.unit}</p></div>
                            <div><Label className="text-xs">Já Recebida</Label><p className="text-sm">{item.quantityReceived} {item.unit}</p></div>
                            <div className="space-y-1">
                              <Label className="text-xs">Qtd a Receber</Label>
                              <Input
                                type="number" step="0.01" max={outstanding}
                                value={receiveQuantities[item.id] ?? outstanding}
                                onChange={e => setReceiveQuantities(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={confirmReceive} disabled={receiveSaving}>{receiveSaving ? 'Salvando...' : 'Confirmar Recebimento'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              ESTOQUE MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'estoque' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold">Estoque</h2>
                <Tabs value={stockView} onValueChange={v => setStockView(v as 'saldo' | 'movimentacoes')}>
                  <TabsList>
                    <TabsTrigger value="saldo">Saldo Atual</TabsTrigger>
                    <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {stockView === 'saldo' && (
                <>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={stockTypeFilter} onValueChange={v => setStockTypeFilter(v as any)}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os itens</SelectItem>
                        <SelectItem value="material">Somente Matéria-prima</SelectItem>
                        <SelectItem value="product">Somente Produto acabado</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Buscar item..." className="pl-9" value={stockSearch} onChange={e => setStockSearch(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 px-3 border rounded-md">
                      <input type="checkbox" id="lowOnly" checked={stockLowOnly} onChange={e => setStockLowOnly(e.target.checked)} />
                      <Label htmlFor="lowOnly" className="text-sm whitespace-nowrap">Só estoque baixo</Label>
                    </div>
                  </div>

                  <Card><CardContent className="p-0">
                    {stockSummaryLoading ? (
                      <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Saldo Atual</TableHead>
                            <TableHead className="text-right">Estoque Mínimo</TableHead>
                            <TableHead>Unid.</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stockSummary.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum item encontrado</TableCell></TableRow>
                          ) : stockSummary.map((item: any) => (
                            <TableRow key={`${item.itemType}-${item.id}`}>
                              <TableCell><Badge variant="outline">{item.itemType === 'material' ? 'Matéria-prima' : 'Produto'}</Badge></TableCell>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell className={`text-right font-mono ${item.isLow ? 'text-destructive font-bold' : ''}`}>{item.stockQty}</TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">{item.minStockQty}</TableCell>
                              <TableCell>{item.unit}</TableCell>
                              <TableCell>
                                <div className="flex gap-1 justify-end">
                                  <Button variant="ghost" size="icon" onClick={() => openStockHistoryFor(item)} title="Ver histórico"><FileText className="w-4 h-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => openAdjustDialog(item)} title="Ajustar estoque"><Edit className="w-4 h-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent></Card>
                </>
              )}

              {stockView === 'movimentacoes' && (
                <>
                  <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {stockMovementFilter.itemId ? (
                        <span>Filtrando por: <strong>{stockMovementFilter.itemName}</strong>{' '}
                          <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setStockMovementFilter({ itemType: '', itemId: '', itemName: '' })}>(limpar filtro)</Button>
                        </span>
                      ) : 'Mostrando todas as movimentações recentes'}
                    </div>
                  </div>
                  <Card><CardContent className="p-0">
                    {stockMovementsLoading ? (
                      <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Quantidade</TableHead>
                            <TableHead className="text-right">Saldo Após</TableHead>
                            <TableHead>Motivo</TableHead>
                            <TableHead>Usuário</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stockMovements.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma movimentação encontrada</TableCell></TableRow>
                          ) : stockMovements.map((mv: any) => (
                            <TableRow key={mv.id}>
                              <TableCell className="text-sm whitespace-nowrap">{new Date(mv.createdAt).toLocaleString('pt-BR')}</TableCell>
                              <TableCell>{mv.material?.name || mv.product?.name || '-'}</TableCell>
                              <TableCell>
                                <Badge className={mv.type === 'IN' ? 'bg-emerald-100 text-emerald-800' : mv.type === 'OUT' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>
                                  {mv.type === 'IN' ? 'Entrada' : mv.type === 'OUT' ? 'Saída' : mv.type === 'ADJUST' ? 'Ajuste' : mv.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">{mv.quantity}</TableCell>
                              <TableCell className="text-right font-mono">{mv.balanceAfter}</TableCell>
                              <TableCell className="text-sm">{mv.reason}</TableCell>
                              <TableCell className="text-sm">{mv.user?.name || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent></Card>
                </>
              )}

              <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
                <DialogContent>
                  <DialogHeader><DialogTitle>Ajustar Estoque — {adjustForm.itemName}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm bg-muted/50 rounded p-3">
                      <span>Saldo atual do sistema</span>
                      <span className="font-mono font-semibold">{adjustForm.currentQty} {adjustForm.unit}</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Novo saldo (contagem física)</Label>
                      <Input type="number" step="0.01" value={adjustForm.newQuantity} onChange={e => setAdjustForm({ ...adjustForm, newQuantity: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Motivo do ajuste</Label>
                      <Textarea rows={3} placeholder="Ex: Contagem de inventário mensal, divergência encontrada..." value={adjustForm.reason} onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })} />
                    </div>
                    {adjustForm.newQuantity !== adjustForm.currentQty && (
                      <p className="text-sm text-muted-foreground">
                        Diferença: <span className={adjustForm.newQuantity > adjustForm.currentQty ? 'text-emerald-600 font-semibold' : 'text-destructive font-semibold'}>
                          {adjustForm.newQuantity > adjustForm.currentQty ? '+' : ''}{(adjustForm.newQuantity - adjustForm.currentQty).toFixed(2)} {adjustForm.unit}
                        </span>
                      </p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={saveStockAdjustment} disabled={adjustSaving}>{adjustSaving ? 'Salvando...' : 'Confirmar Ajuste'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              RELATORIOS MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'relatorios' && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Relatorios</h2>

              <Card><CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo de relatório</Label>
                    <Select value={reportType} onValueChange={v => { setReportType(v as any); setReportStatus(''); setReportResult(null) }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sales">Vendas (Orçamentos)</SelectItem>
                        <SelectItem value="production">Produção</SelectItem>
                        <SelectItem value="purchases">Compras (Requisições)</SelectItem>
                        <SelectItem value="stock">Estoque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label className="text-xs">De</Label><Input placeholder="dd/mm/aaaa" value={reportFrom} onChange={e => setReportFrom(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Até</Label><Input placeholder="dd/mm/aaaa" value={reportTo} onChange={e => setReportTo(e.target.value)} /></div>
                  {reportType !== 'stock' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Status</Label>
                      <Select value={reportStatus || 'all'} onValueChange={v => setReportStatus(v === 'all' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {Object.entries(
                            reportType === 'sales' ? statusLabels : reportType === 'production' ? productionStatusLabels : requisitionStatusLabels
                          ).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button onClick={generateReport} disabled={reportLoading}>{reportLoading ? 'Gerando...' : 'Gerar Relatório'}</Button>
                </div>
              </CardContent></Card>

              {reportResult && (
                <>
                  <div className="flex flex-wrap gap-4">
                    {Object.entries(reportResult.summary || {}).map(([k, v]) => (
                      <Card key={k} className="flex-1 min-w-[160px]"><CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">{k}</p>
                        <p className="text-xl font-bold">{typeof v === 'number' ? (k.toLowerCase().includes('valor') || k.toLowerCase().includes('value') || k.toLowerCase().includes('estimated') ? `R$ ${formatCurrency(v)}` : v) : String(v)}</p>
                      </CardContent></Card>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={downloadReportCsv}><Download className="w-4 h-4 mr-1" /> Exportar Excel/CSV</Button>
                    <Button variant="outline" onClick={downloadReportPdf}><FileOutput className="w-4 h-4 mr-1" /> Exportar PDF</Button>
                  </div>

                  <Card><CardContent className="p-0 overflow-x-auto">
                    {reportResult.rows.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">Nenhum registro encontrado para os filtros selecionados</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            {Object.keys(reportResult.rows[0]).map((h) => (
                              <th key={h} className="text-left px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {reportResult.rows.map((row, idx) => (
                            <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/30">
                              {Object.values(row).map((v, i) => (
                                <td key={i} className="px-3 py-2 whitespace-nowrap">{String(v)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent></Card>
                </>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              PRODUCAO MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'producao' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold">Ordens de Produção</h2>
                <Button onClick={openNewProductionOrder}><Plus className="w-4 h-4 mr-1" /> Nova OP</Button>
              </div>

              <Card><CardContent className="p-0">
                {productionOrdersLoading ? (
                  <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Quantidade</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Prazo</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productionOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma ordem de produção encontrada</TableCell></TableRow>
                      ) : productionOrders.map(order => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono font-medium text-primary">{order.number}</TableCell>
                          <TableCell>{order.product?.name || order.productName || '-'}</TableCell>
                          <TableCell>{order.quantity} {order.unit}</TableCell>
                          <TableCell><Badge variant="outline">{order.status}</Badge></TableCell>
                          <TableCell>{order.dueDate || '-'}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => window.open(`/api/production-orders/${order.id}/pdf`, '_blank')} title="PDF"><FileOutput className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => { setActiveModule('requisicoes'); suggestRequisitionFromProductionOrder(order.id); setRequisitionDialogOpen(true) }} title="Gerar requisição de matéria-prima"><Package className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => openEditProductionOrder(order)} title="Editar"><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteProductionOrder(order.id)} title="Excluir"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>

              <Dialog open={productionOrderDialogOpen} onOpenChange={setProductionOrderDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingProductionOrderId ? 'Editar Ordem de Produção' : 'Nova Ordem de Produção'}</DialogTitle>
                  </DialogHeader>
                  {!editingProductionOrderId && (
                    <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                      <Label className="text-xs font-semibold">Gerar a partir do Pedido de Venda (opcional)</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Select value={selectedSalesOrderForOP || undefined} onValueChange={setSelectedSalesOrderForOP}>
                          <SelectTrigger><SelectValue placeholder="Selecione um Pedido de Venda" /></SelectTrigger>
                          <SelectContent>{salesOrders.map((so: any) => <SelectItem key={so.id} value={so.id}>{so.number} — {so.clientName}</SelectItem>)}</SelectContent>
                        </Select>
                        {selectedSalesOrderForOP && (
                          <Select onValueChange={v => pickSalesOrderItem(selectedSalesOrderForOP, v)}>
                            <SelectTrigger><SelectValue placeholder="Selecione o item/produto" /></SelectTrigger>
                            <SelectContent>
                              {(salesOrders.find((s: any) => s.id === selectedSalesOrderForOP)?.items || []).map((item: any) => (
                                <SelectItem key={item.id} value={item.id}>{item.description} (qtd {item.quantity})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5"><Label>Produto</Label><Select value={productionOrderForm.productId as string || ''} onValueChange={v => setProductionOrderForm({ ...productionOrderForm, productId: v, productName: products.find(p => p.id === v)?.name || '' })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1.5"><Label>Quantidade</Label><Input type="number" step="0.01" value={productionOrderForm.quantity as number || 1} onChange={e => setProductionOrderForm({ ...productionOrderForm, quantity: parseFloat(e.target.value) || 1 })} /></div>
                    <div className="space-y-1.5"><Label>Unidade</Label><Input value={productionOrderForm.unit as string || 'UN'} onChange={e => setProductionOrderForm({ ...productionOrderForm, unit: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Status</Label><Select value={productionOrderForm.status as string || 'planned'} onValueChange={v => setProductionOrderForm({ ...productionOrderForm, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="planned">Planejada</SelectItem><SelectItem value="in_progress">Em execução</SelectItem><SelectItem value="paused">Pausada</SelectItem><SelectItem value="completed">Concluída</SelectItem><SelectItem value="cancelled">Cancelada</SelectItem></SelectContent></Select></div>
                    <div className="space-y-1.5"><Label>Prioridade</Label><Select value={productionOrderForm.priority as string || 'normal'} onValueChange={v => setProductionOrderForm({ ...productionOrderForm, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Baixa</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="urgent">Urgente</SelectItem></SelectContent></Select></div>
                    <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={productionOrderForm.date as string || ''} onChange={e => setProductionOrderForm({ ...productionOrderForm, date: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Prazo</Label><Input type="date" value={productionOrderForm.dueDate as string || ''} onChange={e => setProductionOrderForm({ ...productionOrderForm, dueDate: e.target.value })} /></div>
                    <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={productionOrderForm.description as string || ''} onChange={e => setProductionOrderForm({ ...productionOrderForm, description: e.target.value })} /></div>
                    <div className="space-y-1 sm:col-span-2"><Label>Observações</Label><Textarea rows={3} value={productionOrderForm.notes as string || ''} onChange={e => setProductionOrderForm({ ...productionOrderForm, notes: e.target.value })} /></div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setProductionOrderDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={saveProductionOrder} disabled={productionOrderSaving}>{productionOrderSaving ? 'Salvando...' : 'Salvar'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              USUARIOS MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'usuarios' && canAccess('usuarios') && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold">Usuarios</h2>
                <Button onClick={openNewUser}><Plus className="w-4 h-4 mr-1" /> Novo</Button>
              </div>

              <Card><CardContent className="p-0">
                {usersLoading ? (
                  <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Usuario</TableHead>
                        <TableHead>Perfil</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Acoes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersList.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum usuario encontrado</TableCell></TableRow>
                      ) : usersList.map(u => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell className="font-mono text-sm">{u.username}</TableCell>
                          <TableCell><Badge variant="outline">{roleLabels[u.role] || u.role}</Badge></TableCell>
                          <TableCell><Badge className={u.active ? 'bg-green-600/20 text-green-400 border-green-600/30' : 'bg-red-600/20 text-red-400 border-red-600/30'}>{u.active ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => openEditUser(u)} title="Editar"><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteUser(u.id)} title="Excluir"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>

              {/* ═══ USER FORM DIALOG ═══ */}
              <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingUserId ? 'Editar Usuario' : 'Novo Usuario'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5"><Label>Nome</Label><Input value={userForm.name as string || ''} onChange={e => setUserForm({ ...userForm, name: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Usuario</Label><Input value={userForm.username as string || ''} onChange={e => setUserForm({ ...userForm, username: e.target.value })} /></div>
                    <div className="space-y-1.5">
                      <Label>Senha{editingUserId ? ' (deixe vazio para manter)' : ''}</Label>
                      <Input type="password" value={userForm.password as string || ''} onChange={e => setUserForm({ ...userForm, password: e.target.value })} />
                    </div>
                    <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={userForm.email as string || ''} onChange={e => setUserForm({ ...userForm, email: e.target.value })} /></div>
                    <div className="space-y-1.5">
                      <Label>Perfil</Label>
                      <Select value={userForm.role as string || 'user'} onValueChange={v => setUserForm({ ...userForm, role: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="manager">Gerente</SelectItem>
                          <SelectItem value="user">Usuario</SelectItem>
                          <SelectItem value="viewer">Visualizador</SelectItem>
                          <SelectItem value="comercial">Comercial</SelectItem>
                          <SelectItem value="producao">Produção</SelectItem>
                          <SelectItem value="compras">Compras</SelectItem>
                          <SelectItem value="estoque">Estoque</SelectItem>
                          <SelectItem value="financeiro">Financeiro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={userForm.active as boolean || false} onCheckedChange={v => setUserForm({ ...userForm, active: v })} />
                      <Label>Ativo</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={saveUser} disabled={userSaving}>{userSaving ? 'Salvando...' : 'Salvar'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              CONFIGURACOES MODULES
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'configuracoes' && canAccess('configuracoes') && (
            <div className="space-y-6">
              {/* ═══ CONFIG: EMPRESA ═══ */}
              {configSub === 'empresa' && (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold">Dados da Empresa</h2>
                  {settingsLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : (
                    <>
                      <Card><CardContent className="p-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div className="space-y-1.5"><Label>Titulo do Cabecalho</Label><Input value={settings.headerTitle || ''} onChange={e => setSettings({ ...settings, headerTitle: e.target.value })} /></div>
                          <div className="space-y-1.5"><Label>Razao Social</Label><Input value={settings.supplierName || ''} onChange={e => setSettings({ ...settings, supplierName: e.target.value })} /></div>
                          <div className="space-y-1.5"><Label>CNPJ</Label><Input value={settings.supplierCnpj || ''} onChange={e => setSettings({ ...settings, supplierCnpj: e.target.value })} /></div>
                          <div className="space-y-1.5"><Label>Inscricao Estadual</Label><Input value={settings.supplierIe || ''} onChange={e => setSettings({ ...settings, supplierIe: e.target.value })} /></div>
                          <div className="space-y-1 sm:col-span-2"><Label>Endereco</Label><Input value={settings.supplierAddress || ''} onChange={e => setSettings({ ...settings, supplierAddress: e.target.value })} /></div>
                          <div className="space-y-1.5"><Label>Bairro</Label><Input value={settings.supplierNeighborhood || ''} onChange={e => setSettings({ ...settings, supplierNeighborhood: e.target.value })} /></div>
                          <div className="space-y-1.5"><Label>CEP</Label><Input value={settings.supplierCep || ''} onChange={e => setSettings({ ...settings, supplierCep: e.target.value })} /></div>
                          <div className="space-y-1.5"><Label>Cidade / UF</Label><Input value={settings.supplierCityState || ''} onChange={e => setSettings({ ...settings, supplierCityState: e.target.value })} /></div>
                          <div className="space-y-1.5"><Label>Telefone</Label><Input value={settings.supplierPhone || ''} onChange={e => setSettings({ ...settings, supplierPhone: e.target.value })} /></div>
                          <div className="space-y-1.5"><Label>E-mail</Label><Input value={settings.supplierEmail || ''} onChange={e => setSettings({ ...settings, supplierEmail: e.target.value })} /></div>
                          <div className="space-y-1.5"><Label>Contato</Label><Input value={settings.supplierContact || ''} onChange={e => setSettings({ ...settings, supplierContact: e.target.value })} /></div>
                          <div className="space-y-1 sm:col-span-2"><Label>Dados Bancarios</Label><Textarea rows={3} value={settings.supplierBankData || ''} onChange={e => setSettings({ ...settings, supplierBankData: e.target.value })} /></div>
                        </div>
                      </CardContent></Card>
                      <div className="flex justify-end">
                        <Button onClick={saveSettings} disabled={settingsSaving}>{settingsSaving ? 'Salvando...' : 'Salvar Configuracoes'}</Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ═══ CONFIG: NUMERACAO ═══ */}
              {configSub === 'numeracao' && (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold">Numeracao de Documentos</h2>
                  {sequencesLoading ? (
                    <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
                  ) : (
                    <div className="space-y-4">
                      {sequences.length === 0 ? (
                        <p className="text-muted-foreground text-center py-12">Nenhuma sequencia configurada</p>
                      ) : sequences.map(seq => (
                        <Card key={seq.id}>
                          <CardContent className="p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                              <div className="space-y-1.5">
                                <Label>Tipo</Label>
                                <Input value={seq.documentType} disabled />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Prefixo</Label>
                                <Input value={seq.prefix || ''} onChange={e => setSequences(sequences.map(s => s.id === seq.id ? { ...s, prefix: e.target.value } : s))} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Sufixo</Label>
                                <Input value={seq.suffix || ''} onChange={e => setSequences(sequences.map(s => s.id === seq.id ? { ...s, suffix: e.target.value } : s))} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Proximo Numero</Label>
                                <Input type="number" value={seq.nextNumber} onChange={e => setSequences(sequences.map(s => s.id === seq.id ? { ...s, nextNumber: parseInt(e.target.value) || 1 } : s))} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Digitos</Label>
                                <Input type="number" value={seq.digits} onChange={e => setSequences(sequences.map(s => s.id === seq.id ? { ...s, digits: parseInt(e.target.value) || 4 } : s))} />
                              </div>
                              <div className="flex items-center gap-2 pt-6">
                                <Switch checked={seq.resetAnnual} onCheckedChange={v => setSequences(sequences.map(s => s.id === seq.id ? { ...s, resetAnnual: v } : s))} />
                                <Label>Reset Anual</Label>
                              </div>
                              <div className="flex items-center gap-2 pt-6">
                                <Switch checked={seq.resetMonthly} onCheckedChange={v => setSequences(sequences.map(s => s.id === seq.id ? { ...s, resetMonthly: v } : s))} />
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
              )}

              {/* ═══ CONFIG: PDF ═══ */}
              {configSub === 'pdf' && (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold">Configuracao de PDF</h2>
                  <Card>
                    <CardContent className="p-6 space-y-4">
                      <div className="space-y-1.5">
                        <Label>Titulo do Documento</Label>
                        <Input value={settings.pdfTitle || ''} onChange={e => setSettings({ ...settings, pdfTitle: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Rodape</Label>
                        <Textarea rows={3} value={settings.pdfFooter || ''} onChange={e => setSettings({ ...settings, pdfFooter: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Termos e Condicoes Gerais</Label>
                        <Textarea rows={4} value={settings.pdfTerms || ''} onChange={e => setSettings({ ...settings, pdfTerms: e.target.value })} />
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={saveSettings} disabled={settingsSaving}>{settingsSaving ? 'Salvando...' : 'Salvar'}</Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ═══ CONFIG: SISTEMA ═══ */}
              {configSub === 'sistema' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold">Informacoes do Sistema</h2>
                  {systemLoading ? (
                    <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>
                  ) : (
                    <>
                      <Card>
                        <CardHeader><CardTitle className="text-base">Dados do Sistema</CardTitle></CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-sm">
                            <div><span className="text-muted-foreground">Versao:</span> <span className="font-medium">{(systemInfo?.version as string) || '3.0.0'}</span></div>
                            <div><span className="text-muted-foreground">Instalado em:</span> <span className="font-medium">{systemInfo?.installedAt ? new Date(systemInfo.installedAt as string).toLocaleDateString('pt-BR') : '-'}</span></div>
                            <div><span className="text-muted-foreground">Atualizado em:</span> <span className="font-medium">{systemInfo?.updatedAt ? new Date(systemInfo.updatedAt as string).toLocaleDateString('pt-BR') : '-'}</span></div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader><CardTitle className="text-base">Logs de Auditoria</CardTitle></CardHeader>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Usuario</TableHead>
                                <TableHead>Modulo</TableHead>
                                <TableHead>Acao</TableHead>
                                <TableHead>Detalhes</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {auditLogs.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum log encontrado</TableCell></TableRow>
                              ) : auditLogs.map(log => (
                                <TableRow key={log.id}>
                                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : '-'}</TableCell>
                                  <TableCell className="text-sm font-medium">{log.userName || '-'}</TableCell>
                                  <TableCell><Badge variant="outline" className="text-xs">{log.module}</Badge></TableCell>
                                  <TableCell><Badge variant="secondary" className="text-xs">{log.action}</Badge></TableCell>
                                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{log.details || '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>
              )}

              {configSub === 'atualizacoes' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold">Atualizações do Sistema</h2>

                  <Card>
                    <CardHeader><CardTitle className="text-base">Versão Atual</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-primary">{currentVersion || '-'}</p>
                    </CardContent>
                  </Card>

                  {userRole === 'admin' && (
                    <Card>
                      <CardHeader><CardTitle className="text-base">Aplicar Nova Atualização</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Envie o arquivo de patch (.zip) recebido. O sistema faz backup automático
                          do código e do banco antes de aplicar — se algo der errado no meio do processo,
                          reverte sozinho para a versão anterior. Durante a atualização (1–3 minutos),
                          o sistema pode ficar temporariamente indisponível enquanto reinicia.
                        </p>
                        <div>
                          <input
                            type="file" accept=".zip" id="patch-upload" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadPatch(f); e.target.value = '' }}
                          />
                          <Button disabled={patchUploading || patchPolling} onClick={() => document.getElementById('patch-upload')?.click()}>
                            {patchUploading ? 'Enviando...' : 'Selecionar arquivo de patch (.zip)'}
                          </Button>
                        </div>
                        {patchStatus && patchPolling && (
                          <div className="flex items-center gap-3 bg-muted/50 rounded p-3">
                            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                            <span className="text-sm">{patchStatus.message}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader><CardTitle className="text-base">Histórico de Atualizações</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Versão</TableHead>
                            <TableHead>Título</TableHead>
                            <TableHead>Via</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Usuário</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {patchHistory.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma atualização registrada ainda</TableCell></TableRow>
                          ) : patchHistory.map((p: any) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-sm whitespace-nowrap">{new Date(p.createdAt).toLocaleString('pt-BR')}</TableCell>
                              <TableCell className="font-mono text-sm">{p.fromVersion} → {p.toVersion}</TableCell>
                              <TableCell className="text-sm">{p.title || '-'}</TableCell>
                              <TableCell className="text-sm">{p.appliedVia === 'upload' ? 'Upload' : 'Terminal'}</TableCell>
                              <TableCell>
                                <Badge className={p.status === 'success' ? 'bg-emerald-100 text-emerald-800' : p.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>
                                  {p.status === 'success' ? 'Sucesso' : p.status === 'failed' ? 'Falhou' : p.status === 'rolled_back' ? 'Revertido' : p.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{p.user?.name || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
