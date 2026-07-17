'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { hasPermission, type Role } from '@/app/middleware/rbac'
import { getAccessibleProfiles } from '@/app/services/dashboard-access.service'
import { DashboardTabs } from '@/components/dashboard/dashboard-tabs'
import { ClientesPage } from '@/components/modules/clientes/clientes-page'
import { UsuariosPage } from '@/components/modules/usuarios/usuarios-page'
import { FornecedoresPage } from '@/components/modules/fornecedores/fornecedores-page'
import { MateriaisPage } from '@/components/modules/materiais/materiais-page'
import { ProdutosPage } from '@/components/modules/produtos/produtos-page'
import { ComprasPage } from '@/components/modules/compras/compras-page'
import { RequisicoesPage } from '@/components/modules/requisicoes/requisicoes-page'
import { ProducaoPage } from '@/components/modules/producao/producao-page'
import { RelatoriosPage } from '@/components/modules/relatorios/relatorios-page'
import { ConfiguracoesPage, type ConfigSubModule } from '@/components/modules/configuracoes/configuracoes-page'
import { PedidosPage } from '@/components/modules/pedidos/pedidos-page'
import { EstoquePage } from '@/components/modules/estoque/estoque-page'
import { OrcamentosPage } from '@/components/modules/orcamentos/orcamentos-page'
import { FinanceiroPage } from '@/components/modules/financeiro/financeiro-page'
import { NotificationCenter } from '@/components/layout/notification-center'
import { ROLE_LABELS as roleLabels } from '@/lib/role-labels'
import { SearchInput } from '@/components/domain/search-input'
import {
  LayoutDashboard, FileText, Package, Users, Settings, LogOut, Plus, Search,
  Edit, Copy, Trash2, X, Save, ChevronDown, ChevronRight, Menu,
  UserCog, Building2, Hash, FileOutput, ShieldCheck, Eye, Layers, ShoppingCart,
  SlidersHorizontal, Ban, RefreshCw, Warehouse, ClipboardList, ShoppingBag, Factory,
  PanelLeftClose, PanelLeftOpen, Wallet, Calculator, Activity, Terminal, Wrench
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { PaginationBar } from '@/components/domain/pagination-bar'
import { DatePicker } from '@/components/form/date-picker'
import { PAYMENT_TERMS_OPTIONS } from '@/lib/payment-terms'
import { CurrencyInput } from '@/components/form/currency-input'
import { QuantityInput } from '@/components/form/quantity-input'
import { PercentInput } from '@/components/form/percent-input'
import { CepInput } from '@/components/form/cep-input'
import { CnpjInput } from '@/components/form/cnpj-input'
import { PhoneInput } from '@/components/form/phone-input'
import { EmailInput } from '@/components/form/email-input'
import { UnitSelect } from '@/components/form/unit-select'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { AsyncButton } from '@/components/domain/async-button'
import { FormDialog } from '@/components/domain/form-dialog'

/* ══════════════════════════════════════════════════════════════
   TYPE DECLARATIONS
   ══════════════════════════════════════════════════════════════ */

interface SessionUser { id: string; name: string; role: string; email?: string }
interface Quote { id: string; number: string; status: string; date: string; clientName: string; total: number; clientId: string; version: number; createdAt: string; items?: QuoteItem[]; salesOrder?: { id: string; number: string } | null }
interface QuoteItem { id?: string; productId?: string; code: string; description: string; quantity: number; unit: string; unitPrice: number; total: number; weight: number; width: number; height: number; length: number; order: number }
interface Client { id: string; corporateName: string; tradeName: string; cpfCnpj: string | null; email: string; phone: string; contactName?: string; contactPhone?: string; address?: string; number?: string; neighborhood?: string; zipCode?: string; city: string; state: string; active: boolean; createdAt: string; situacaoCadastral?: string; cnaeCode?: string; cnaeDescription?: string }
interface Product { id: string; internalCode: string; name: string; description: string; categoryName: string; materialName: string; costPrice: number; salePrice: number; weight: number; unit?: string; active: boolean; createdAt: string; images?: { id: string; url: string; isPrimary: boolean }[] }
type ModuleKey = 'dashboard' | 'orcamentos' | 'pedidos' | 'clientes' | 'produtos' | 'materiais' | 'producao' | 'fornecedores' | 'requisicoes' | 'compras' | 'estoque' | 'relatorios' | 'financeiro' | 'usuarios' | 'configuracoes'


/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function ERPPage() {
  const { data: session, status } = useSession()
  const user = session?.user as SessionUser | undefined
  const userRole = (user?.role || 'viewer') as Role
  const confirmAction = useConfirm()

  /* ── Global UI State ── */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Sidebar recolhível (Fase 11.5, Subetapa 11.5.10) — só afeta a versão desktop; o Sheet mobile
  // sempre abre expandido (é um overlay de tela cheia, colapsar não faz sentido ali).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard')
  const [configSub, setConfigSub] = useState<ConfigSubModule>('empresa')

  // Notificações migradas para `NotificationCenter` (Fase 11.5, Subetapa 11.5.10), autocontido —
  // busca seus próprios alertas via `GET /api/dashboard/alerts`, já com severidade.

  /* ── Login State ── */
  const [loginErr, setLoginErr] = useState('')
  const [loginLoad, setLoginLoad] = useState(false)

  /* ── Orcamentos ── */
  // Tabela paginada + formulário + duplicar/converter migrados para `OrcamentosPage` (Fase 11.5,
  // Subetapa 11.5.12), autocontido. `clients`/`products` continuam abaixo — catálogos compartilhados
  // com Produção, injetados via props.

  /* ── Pedidos de Venda ── */
  // Tabela paginada + status + detalhe migrados para `PedidosPage` (Fase 11.5, Subetapa 11.5.12),
  // autocontido. `salesOrders`/`loadSalesOrders` permanecem — catálogo compartilhado com o seletor
  // "gerar OP a partir de um Pedido de Venda" em Produção.
  const [salesOrders, setSalesOrders] = useState<any[]>([])

  /* ── Clientes ── */
  // A tabela paginada + formulário do módulo Clientes foram migrados para o componente
  // `ClientesPage` (Fase 11.5, Subetapa 11.5.6 — piloto/template oficial da plataforma), autocontido,
  // sem estado próprio aqui. `clients`/`loadClients` continuam aqui porque alimentam também o select
  // de cliente do Orçamento (catálogo completo, sem paginação) — estado compartilhado fora do módulo.
  const [clients, setClients] = useState<Client[]>([])

  /* ── Produtos ── */
  // Tabela paginada + formulário migrados para `ProdutosPage` (Fase 11.5, Subetapa 11.5.7),
  // autocontido. `products`/`loadProducts` permanecem — catálogo completo usado pelos selects de
  // Orçamento/Ordem de Produção, estado compartilhado fora do módulo.
  const [products, setProducts] = useState<(Product & { category?: { name: string } | null; material?: { name: string } | null })[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [materials, setMaterials] = useState<{ id: string; name: string }[]>([])
  // `categoryForm`/`saveCategory`/`categorySaving` (cadastro rápido de categoria, usado só dentro do
  // card "Cadastros auxiliares" de Produtos) migraram para `ProdutosPage` (Subetapa 11.5.7).
  // `materialForm`/`saveMaterial`/`materialSaving` nunca foram renderizados em nenhuma tela (achado,
  // não é escopo desta subetapa corrigir) — deixados intocados.
  const [materialForm, setMaterialForm] = useState({ name: '', density: 0, description: '' })
  const [materialSaving, setMaterialSaving] = useState(false)

  /* ── Producao ── */
  // Tabela paginada + formulário + status/produção parcial migrados para `ProducaoPage` (Fase 11.5,
  // Subetapa 11.5.8), autocontido. `productionOrders`/`loadProductionOrders` permanecem — catálogo
  // completo compartilhado com o seletor "gerar a partir de uma OP" de Requisições.
  const [productionOrders, setProductionOrders] = useState<any[]>([])

  /* ── Materiais (lista completa, com estoque/custo) ── */
  const [materialsFull, setMaterialsFull] = useState<any[]>([])

  // Materiais (módulo dedicado) migrado para `MateriaisPage` (Fase 11.5, Subetapa 11.5.7),
  // autocontido. `materialsFull`/`loadMaterialsFull` (acima) permanecem — catálogo compartilhado.

  /* ── Fornecedores ── */
  // Tabela paginada + formulário migrados para `FornecedoresPage` (Fase 11.5, Subetapa 11.5.7),
  // autocontido. `suppliers`/`loadSuppliers` permanecem — usados pelos selects de fornecedor em
  // Requisição/Cotação, estado compartilhado fora do módulo.
  const [suppliers, setSuppliers] = useState<any[]>([])

  /* ── Produto x Materia-prima (dentro do dialog de Produto) ── */

  /* ── Requisicoes + Cotacao ── */
  // Tabela paginada + formulário + cotação migrados para `RequisicoesPage` (Fase 11.5, Subetapa
  // 11.5.8), autocontido. Só o disparo cross-module de Produção ("Gerar requisição de matéria-prima"
  // a partir de uma OP) permanece aqui — ver `RequisicoesPageProps.pendingSuggestionFromOP`.
  const [requisitionOPSuggestion, setRequisitionOPSuggestion] = useState<string | null>(null)

  /* ── Fluxos pós-ação (Hardening pós-11.5, Prioridade 1) ── */
  // Deep-link cross-module: quando uma ação gera exatamente 1 registro novo em outro módulo (Orçamento
  // convertido em Pedido, Orçamento aprovado gerando 1 OP, Requisição gerando 1 Pedido de Compra), a
  // página de destino abre o `DetailDrawer` daquele registro direto ao chegar — mesmo padrão de
  // `requisitionOPSuggestion` acima, replicado para as 3 direções novas.
  const [pendingPedidoDetailId, setPendingPedidoDetailId] = useState<string | undefined>(undefined)
  const [pendingProductionOrderDetailId, setPendingProductionOrderDetailId] = useState<string | undefined>(undefined)
  const [pendingPurchaseOrderDetailId, setPendingPurchaseOrderDetailId] = useState<string | undefined>(undefined)

  /* ── Estoque ── */
  // Tabela de saldo + movimentações + ajuste manual migrados para `EstoquePage` (Fase 11.5, Subetapa
  // 11.5.12), autocontido — sem estado compartilhado com nenhum outro módulo.

  // Usuários migrado para `UsuariosPage` (Fase 11.5, Subetapa 11.5.7) — autocontido, sem estado aqui.
  // Configurações (Empresa/Numeração/PDF/Sistema/Atualizações) migrado para `ConfiguracoesPage` (Fase
  // 11.5, Subetapa 11.5.9) — cada sub-aba autocontida, sem estado aqui além de `configSub` (usado
  // também pelo sub-menu da barra lateral, por isso continua em `page.tsx`).

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

  // Catálogo completo (sem paginação/filtro — mesmo comportamento de antes desta migração) para o
  // seletor "gerar OP a partir de um Pedido de Venda" em Produção.
  const loadSalesOrders = useCallback(async () => {
    try {
      const r = await fetch('/api/sales-orders?limit=100')
      if (r.ok) { const json = await r.json(); setSalesOrders(json.data || []) }
    } catch { toast.error('Erro ao carregar pedidos de venda') }
  }, [])

  // `loadClients`/`clients` alimenta o select de cliente do Orçamento (catálogo completo, sem
  // paginação — nota: `parsePagination` do backend usa limit padrão 20 quando nenhum `limit` é
  // enviado, então esse catálogo já era limitado a 20 registros antes desta migração; achado
  // pré-existente, não introduzido aqui, fora do escopo da Subetapa 11.5.6, catalogado no relatório).
  // A tabela paginada + formulário do módulo Clientes agora vivem inteiramente em `ClientesPage`.
  const loadClients = useCallback(async () => {
    try {
      const r = await fetch('/api/clients')
      if (r.ok) {
        const json = await r.json()
        setClients(json.data || [])
      }
    } catch { toast.error('Erro ao carregar clientes') }
  }, [])

  // `loadProducts`/`products` alimentam também os selects de produto de Orçamento e Ordem de
  // Produção (catálogo completo, sem paginação) — por isso NÃO leva page/limit. A tabela paginada
  // do módulo Produtos usa `loadProductsPage`/`productsPage`, estado separado, mesmo padrão já usado
  // por Materiais (`loadMaterialsFull` vs `loadMaterialsPage`).
  // Catálogo completo (sem paginação) para os selects de Orçamento/Ordem de Produção — não depende
  // mais de nenhum estado de busca do módulo Produtos (removido na Subetapa 11.5.7, mesmo achado/
  // correção já aplicado a `loadClients`/`loadSuppliers`).
  const loadProducts = useCallback(async () => {
    try {
      const r = await fetch('/api/products')
      if (r.ok) {
        const json = await r.json()
        setProducts(json.data || [])
      }
    } catch { toast.error('Erro ao carregar produtos') }
  }, [])

  const loadCategoriesAndMaterials = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([fetch('/api/categories'), fetch('/api/materials')])
      if (c.ok) setCategories(((await c.json()) || []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
      if (m.ok) setMaterials(((await m.json()) || []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
    } catch { /* silent */ }
  }, [])


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

  const loadProductionOrders = useCallback(async () => {
    try {
      const r = await fetch('/api/production-orders?limit=20')
      if (r.ok) { const json = await r.json(); setProductionOrders(json.data || []) }
    } catch { toast.error('Erro ao carregar ordens de produção') }
  }, [])

  const loadMaterialsFull = useCallback(async () => {
    try {
      const r = await fetch('/api/materials')
      if (r.ok) setMaterialsFull((await r.json()) || [])
    } catch { /* silent */ }
  }, [])

  // Catálogo completo (limit=100, sem paginação) para os selects de fornecedor em Requisição/
  // Cotação — não depende mais de nenhum estado de busca do módulo Fornecedores (removido na
  // Subetapa 11.5.7, mesmo achado/correção já aplicado a `loadClients` na Subetapa 11.5.6).
  const loadSuppliers = useCallback(async () => {
    try {
      const r = await fetch('/api/suppliers?limit=100')
      if (r.ok) { const json = await r.json(); setSuppliers(json.data || []) }
    } catch { toast.error('Erro ao carregar fornecedores') }
  }, [])

  // Produtos: achado da mesma classe de Clientes/Fornecedores/Materiais/Usuários — resolvido de vez
  // na Fase 11.5, Subetapa 11.5.7: `ProdutosPage` busca seus próprios dados, autocontido.

  /* ── Module change effect ── */
  const moduleRef = activeModule
  const sessionRef = session
  useEffect(() => {
    if (!sessionRef) return
    const loads: Record<string, () => Promise<void>> = {
      categoriesMaterials: loadCategoriesAndMaterials,
    }
    const fn = loads[moduleRef]
    if (fn) fn()
    if (moduleRef === 'produtos') { loads.categoriesMaterials(); loadMaterialsFull() }
    if (moduleRef === 'materiais') { loads.categoriesMaterials() }
    if (moduleRef === 'producao') {
      loadProducts()
      loadSalesOrders()
    }
    if (moduleRef === 'orcamentos') {
      loadClients()
      loadProducts()
    }
    if (moduleRef === 'fornecedores') { loadMaterialsFull() }
    if (moduleRef === 'requisicoes') { loadMaterialsFull(); loadSuppliers(); loadProductionOrders() }
  }, [session, activeModule])

  /* ══════════════════════════════════════════════════════════════
     HELPERS
     ══════════════════════════════════════════════════════════════ */

  const canAccess = (mod: ModuleKey): boolean => {
    // Fase 11 (ADR-017/ADR-019, Subetapa 8) — dashboard legado descontinuado; o item só aparece se o
    // perfil tiver pelo menos 1 aba acessível (Hardening pós-11.5, Prioridade 2 — `user`/`viewer` nunca
    // estiveram em `PROFILE_ACCESS`, decisão explícita do usuário: sem Dashboard para esses papéis).
    if (mod === 'dashboard') return getAccessibleProfiles(userRole).length > 0
    if (mod === 'pedidos') return hasPermission(userRole, 'orcamentos' as any, 'read')
    return hasPermission(userRole, mod as any, 'read')
  }

  const breadcrumbMap: Record<string, string> = {
    dashboard: 'Dashboard', orcamentos: 'Orcamentos', pedidos: 'Pedidos de Venda', clientes: 'Clientes',
    produtos: 'Produtos', materiais: 'Materias-Primas', producao: 'Producao', usuarios: 'Usuarios', configuracoes: 'Configuracoes',
    fornecedores: 'Fornecedores', requisicoes: 'Requisicoes', compras: 'Compras', estoque: 'Estoque', relatorios: 'Relatorios', financeiro: 'Financeiro',
    empresa: 'Empresa', numeracao: 'Numeracao', pdf: 'PDF', custeio: 'Custeio', sistema: 'Sistema', atualizacoes: 'Atualizacoes',
    diagnostico: 'Diagnostico', console: 'Console SQL', correcoes: 'Correcoes',
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
        { key: 'pedidos', icon: <ShoppingBag className="w-5 h-5" />, label: 'Pedidos de Venda' },
        { key: 'clientes', icon: <Users className="w-5 h-5" />, label: 'Clientes' },
      ],
    },
    {
      label: 'PRODUÇÃO',
      items: [
        { key: 'producao', icon: <Factory className="w-5 h-5" />, label: 'Producao' },
        { key: 'produtos', icon: <Package className="w-5 h-5" />, label: 'Produtos' },
      ],
    },
    {
      label: 'SUPRIMENTOS',
      items: [
        { key: 'materiais', icon: <Layers className="w-5 h-5" />, label: 'Materias-Primas' },
        { key: 'fornecedores', icon: <Users className="w-5 h-5" />, label: 'Fornecedores' },
        { key: 'requisicoes', icon: <ClipboardList className="w-5 h-5" />, label: 'Requisicoes' },
        { key: 'compras', icon: <ShoppingCart className="w-5 h-5" />, label: 'Compras' },
        { key: 'estoque', icon: <Warehouse className="w-5 h-5" />, label: 'Estoque' },
      ],
    },
    {
      label: 'GESTÃO',
      items: [
        { key: 'financeiro', icon: <Wallet className="w-5 h-5" />, label: 'Financeiro' },
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
    { key: 'custeio', icon: <Calculator className="w-4 h-4" />, label: 'Custeio' },
    { key: 'sistema', icon: <ShieldCheck className="w-4 h-4" />, label: 'Sistema' },
    { key: 'atualizacoes', icon: <RefreshCw className="w-4 h-4" />, label: 'Atualizações' },
    { key: 'diagnostico', icon: <Activity className="w-4 h-4" />, label: 'Diagnóstico' },
    { key: 'console', icon: <Terminal className="w-4 h-4" />, label: 'Console SQL' },
    { key: 'correcoes', icon: <Wrench className="w-4 h-4" />, label: 'Correções' },
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
            <p className="text-xs text-center text-muted-foreground">v4.0.0</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER: MAIN ERP LAYOUT
     ══════════════════════════════════════════════════════════════ */

  // `collapsed` só se aplica à versão desktop (o Sheet mobile chama renderNav() sem argumento,
  // sempre expandido — é um overlay de tela cheia, colapsar não se aplica ali). Recolhido: só ícones,
  // com `title` nativo como tooltip; sub-menu de Configurações e rodapé de usuário viram compactos.
  const renderNav = (collapsed = false) => (
    <nav className="flex flex-col h-full">
      <div className={`p-4 border-b flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div>
            <h2 className="font-bold text-lg text-primary">COZISTEEL</h2>
            <p className="text-xs text-muted-foreground">ERP v4.0</p>
          </div>
        )}
        <Button
          variant="ghost" size="icon" className="hidden md:inline-flex shrink-0"
          onClick={() => setSidebarCollapsed((v) => !v)}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </Button>
      </div>
      <ScrollArea className="flex-1 py-2">
        <div className="space-y-1 px-2">
          {navGroups.map((group, gi) => {
            const visibleItems = group.items.filter(n => canAccess(n.key))
            if (visibleItems.length === 0) return null
            return (
              <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
                {group.label && !collapsed && (
                  <p className="px-3 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/70">{group.label}</p>
                )}
                {visibleItems.map(n => (
                  <button
                    key={n.key}
                    onClick={() => handleNavClick(n.key)}
                    title={collapsed ? n.label : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${collapsed ? 'justify-center' : ''} ${
                      activeModule === n.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {n.icon} {!collapsed && n.label}
                    {!collapsed && n.key === 'configuracoes' && activeModule === 'configuracoes' && <ChevronDown className="w-4 h-4 ml-auto" />}
                  </button>
                ))}
              </div>
            )
          })}
          {!collapsed && activeModule === 'configuracoes' && (
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
      <div className={`p-4 border-t space-y-3 ${collapsed ? 'flex flex-col items-center' : ''}`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'flex-col gap-1' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0" title={collapsed ? user?.name : undefined}>
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || 'Usuario'}</p>
              <Badge variant="outline" className="text-xs">{roleLabels[userRole] || userRole}</Badge>
            </div>
          )}
        </div>
        <Button
          variant="ghost" size="sm"
          className={collapsed ? 'w-full justify-center text-muted-foreground hover:text-destructive' : 'w-full justify-start gap-2 text-muted-foreground hover:text-destructive'}
          onClick={() => signOut()}
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut className="w-4 h-4" /> {!collapsed && 'Sair'}
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
          <NotificationCenter onNavigate={(m) => setActiveModule(m as ModuleKey)} />
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
        {/* ═══ SIDEBAR (desktop) — recolhível, Subetapa 11.5.10 ═══ */}
        <aside className={`hidden md:flex border-r border-slate-200 bg-white flex-shrink-0 transition-[width] duration-200 ${sidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <div className="w-full">{renderNav(sidebarCollapsed)}</div>
        </aside>

        {/* ═══ MAIN CONTENT ═══ */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {/* Breadcrumb — clicável (Fase 11.5, Subetapa 11.5.10): todo segmento que não é a página
              atual navega; o último segmento (a tela em que você já está) fica como texto simples,
              convenção padrão de breadcrumb. */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <button type="button" onClick={() => setActiveModule('dashboard')} className="hover:text-foreground hover:underline">COZISTEEL ERP</button>
            <ChevronRight className="w-4 h-4" />
            {activeModule === 'configuracoes' ? (
              <button type="button" onClick={() => setConfigSub('empresa')} className="hover:text-foreground hover:underline font-medium">{breadcrumbMap[activeModule]}</button>
            ) : (
              <span className="text-foreground font-medium">{breadcrumbMap[activeModule]}</span>
            )}
            {activeModule === 'configuracoes' && (
              <>
                <ChevronRight className="w-4 h-4" />
                <span className="text-foreground font-medium">{breadcrumbMap[configSub]}</span>
              </>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════
              DASHBOARD — Fase 11, ADR-017/ADR-019, Subetapa 8: dashboard legado (baseado só em
              Quote, sem RBAC por perfil) descontinuado — este é o único dashboard agora.
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'dashboard' && (
            // Container com max-width em telas ultrawide (ADR-019 §5: "não esticar cards finos até a
            // borda da tela").
            <div className="space-y-4 max-w-[1600px] mx-auto">
              <h2 className="text-2xl font-bold">Dashboard</h2>
              <DashboardTabs role={userRole} onNavigate={(moduleKey) => setActiveModule(moduleKey as ModuleKey)} />
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              ORCAMENTOS MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'orcamentos' && (
            <OrcamentosPage
              clients={clients}
              products={products}
              onDataChanged={() => { loadSalesOrders(); loadProductionOrders() }}
              onNavigateToPedidos={(pedidoId) => { setActiveModule('pedidos'); setPendingPedidoDetailId(pedidoId) }}
              onNavigateToProducao={(productionOrderId) => { setActiveModule('producao'); setPendingProductionOrderDetailId(productionOrderId) }}
            />
          )}

          {/* ═══════════════════════════════════════════════════════
              PEDIDOS DE VENDA MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'pedidos' && (
            <PedidosPage
              initialDetailId={pendingPedidoDetailId}
              onConsumeInitialDetail={() => setPendingPedidoDetailId(undefined)}
            />
          )}

          {/* ═══════════════════════════════════════════════════════
              CLIENTES MODULE
              ═══════════════════════════════════════════════════════ */}
          {/* ═══════════════════════════════════════════════════════
              CLIENTES MODULE — Fase 11.5, Subetapa 11.5.6 (piloto/template oficial da plataforma)
              Migrado para `ClientesPage` (PageHeader→FilterBar→DataTable→FormDialog, autocontido) —
              nenhuma lógica de apresentação ou estado do módulo permanece aqui, só orquestração.
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'clientes' && <ClientesPage onCatalogChanged={loadClients} />}

          {/* ═══════════════════════════════════════════════════════
              PRODUTOS MODULE
              ═══════════════════════════════════════════════════════ */}
          {/* ═══════════════════════════════════════════════════════
              PRODUTOS MODULE — Fase 11.5, Subetapa 11.5.7 (propagação do template, última das 4)
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'produtos' && (
            <ProdutosPage
              categories={categories}
              materials={materials}
              materialsFull={materialsFull}
              onCatalogChanged={loadProducts}
              onAuxiliaryCatalogChanged={loadCategoriesAndMaterials}
              onNavigateToMateriais={() => setActiveModule('materiais')}
            />
          )}

          {/* ═══════════════════════════════════════════════════════
              MATERIA-PRIMA MODULE (dedicado)
              ═══════════════════════════════════════════════════════ */}
          {/* ═══════════════════════════════════════════════════════
              MATERIAIS MODULE — Fase 11.5, Subetapa 11.5.7 (propagação do template)
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'materiais' && <MateriaisPage categories={categories} onCatalogChanged={loadMaterialsFull} />}

          {/* ═══════════════════════════════════════════════════════
              FORNECEDORES MODULE
              ═══════════════════════════════════════════════════════ */}
          {/* ═══════════════════════════════════════════════════════
              FORNECEDORES MODULE — Fase 11.5, Subetapa 11.5.7 (propagação do template)
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'fornecedores' && <FornecedoresPage materialsFull={materialsFull} onCatalogChanged={loadSuppliers} />}

          {/* ═══════════════════════════════════════════════════════
              REQUISICOES MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'requisicoes' && (
            <RequisicoesPage
              materialsFull={materialsFull}
              suppliers={suppliers}
              productionOrders={productionOrders}
              pendingSuggestionFromOP={requisitionOPSuggestion}
              onConsumePendingSuggestion={() => setRequisitionOPSuggestion(null)}
              onNavigateToCompras={(purchaseOrderId) => { setActiveModule('compras'); setPendingPurchaseOrderDetailId(purchaseOrderId) }}
            />
          )}

          {/* ═══════════════════════════════════════════════════════
              COMPRAS (PEDIDO DE COMPRA) MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'compras' && (
            <ComprasPage
              initialDetailId={pendingPurchaseOrderDetailId}
              onConsumeInitialDetail={() => setPendingPurchaseOrderDetailId(undefined)}
            />
          )}

          {/* ═══════════════════════════════════════════════════════
              ESTOQUE MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'estoque' && <EstoquePage />}

          {/* ═══════════════════════════════════════════════════════
              FINANCEIRO MODULE (Fase 12, Subetapa 7-UI)
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'financeiro' && <FinanceiroPage />}

          {/* ═══════════════════════════════════════════════════════
              RELATORIOS MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'relatorios' && <RelatoriosPage />}

          {/* ═══════════════════════════════════════════════════════
              PRODUCAO MODULE
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'producao' && (
            <ProducaoPage
              products={products}
              salesOrders={salesOrders}
              onGenerateRequisitionFromOP={(id) => { setActiveModule('requisicoes'); setRequisitionOPSuggestion(id) }}
              initialDetailId={pendingProductionOrderDetailId}
              onConsumeInitialDetail={() => setPendingProductionOrderDetailId(undefined)}
            />
          )}

          {/* ═══════════════════════════════════════════════════════
              USUARIOS MODULE
              ═══════════════════════════════════════════════════════ */}
          {/* ═══════════════════════════════════════════════════════
              USUARIOS MODULE — Fase 11.5, Subetapa 11.5.7 (propagação do template)
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'usuarios' && canAccess('usuarios') && <UsuariosPage />}

          {/* ═══════════════════════════════════════════════════════
              CONFIGURACOES MODULES
              ═══════════════════════════════════════════════════════ */}
          {activeModule === 'configuracoes' && canAccess('configuracoes') && (
            <ConfiguracoesPage configSub={configSub} isAdmin={userRole === 'admin'} />
          )}
        </main>
      </div>
    </div>
  )
}
