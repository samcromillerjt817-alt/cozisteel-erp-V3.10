import { db } from '@/lib/db'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import fs from 'fs'
import path from 'path'

// ── Identidade visual Cozisteel ──────────────────────────────────────────
const BRAND_RED: [number, number, number] = [178, 17, 25]      // #B21119 — cor exata extraída da logo oficial
const BRAND_RED_DARK: [number, number, number] = [122, 12, 17] // tom mais escuro, para gradientes/hover
const BRAND_GRAY: [number, number, number] = [90, 90, 90]
const BRAND_LIGHT: [number, number, number] = [246, 238, 238]  // fundo suave para faixas/realces

let cachedLogo: string | null = null
function getLogoBase64(): string | null {
  if (cachedLogo !== null) return cachedLogo
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.png')
    const buffer = fs.readFileSync(logoPath)
    cachedLogo = `data:image/png;base64,${buffer.toString('base64')}`
  } catch {
    cachedLogo = ''
  }
  return cachedLogo || null
}

/**
 * Desenha o cabeçalho padrão Cozisteel: logo real + título do documento + número,
 * com uma faixa de destaque na cor institucional. Retorna o Y onde o conteúdo pode começar.
 */
function drawHeader(doc: jsPDF, docTitle: string, docNumber?: string): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const logo = getLogoBase64()

  if (logo) {
    // logo cortada (sem margem branca) 308x215 (~1.432:1) — 32mm de largura fica proporcional e legível
    const logoWidth = 32
    const logoHeight = logoWidth / (308 / 215)
    doc.addImage(logo, 'PNG', 14, 10, logoWidth, logoHeight)
  } else {
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BRAND_RED)
    doc.text('COZISTEEL', 14, 22)
    doc.setTextColor(0, 0, 0)
  }

  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND_RED)
  doc.text(docTitle, pageWidth - 14, 18, { align: 'right' })

  if (docNumber) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BRAND_GRAY)
    doc.text(docNumber, pageWidth - 14, 25, { align: 'right' })
  }

  doc.setTextColor(0, 0, 0)

  // Faixa de destaque na cor institucional
  doc.setFillColor(...BRAND_RED)
  doc.rect(0, 34, pageWidth, 1.2, 'F')

  return 44
}

/** Desenha o rodapé padrão Cozisteel em todas as páginas do documento. */
function drawFooter(doc: jsPDF, extraLine?: string) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageCount = doc.getNumberOfPages()

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(...BRAND_RED)
    doc.setLineWidth(0.6)
    doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16)

    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BRAND_GRAY)
    doc.text('COZISTEEL — Instalações Comerciais', 14, pageHeight - 11)
    if (extraLine) doc.text(extraLine, 14, pageHeight - 7)
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 11, { align: 'right' })
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - 14, pageHeight - 7, { align: 'right' })
    doc.setTextColor(0, 0, 0)
  }
}

/** Estilo padrão de tabela na identidade Cozisteel (cabeçalho vermelho institucional). */
const brandTableStyles = {
  theme: 'grid' as const,
  headStyles: { fillColor: BRAND_RED, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const, fontSize: 8 },
  bodyStyles: { fontSize: 8 },
  alternateRowStyles: { fillColor: [250, 245, 245] as [number, number, number] },
}

/** Título de seção no padrão Cozisteel (barra fininha vermelha à esquerda do texto). */
function sectionTitle(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFillColor(...BRAND_RED)
  doc.rect(x, y - 3.2, 1.2, 4.2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BRAND_RED)
  doc.text(text, x + 3, y)
  doc.setTextColor(0, 0, 0)
}

class PdfService {
  async generateQuotePdf(quoteId: string): Promise<Buffer> {
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: { orderBy: { order: 'asc' } },
        client: true,
        user: { select: { name: true } },
      },
    })

    if (!quote) throw new Error('Orçamento não encontrado')

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'ORÇAMENTO', `Nº ${quote.number}`)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Data: ${quote.date}`, 14, y)
    doc.text(`Validade: ${quote.validity || quote.validUntil || '-'}`, 90, y)
    if (quote.approvedAt) doc.text(`Aprovado em: ${quote.approvedAt.toLocaleDateString('pt-BR')}`, 150, y)
    y += 10

    sectionTitle(doc, 'DADOS DO CLIENTE', 14, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const clientName = quote.clientName || quote.client?.corporateName || '-'
    const clientCnpj = quote.clientCnpj || quote.client?.cpfCnpj || '-'
    const clientAddr = quote.clientAddress || quote.client?.address || '-'
    const clientNeigh = quote.clientNeighborhood || quote.client?.neighborhood || ''
    const clientCep = quote.clientCep || quote.client?.zipCode || ''
    const clientCity = quote.client?.city || ''
    const clientState = quote.client?.state || ''

    doc.setFont('helvetica', 'bold')
    doc.text(clientName, 14, y)
    doc.setFont('helvetica', 'normal')
    y += 5
    doc.text(`CNPJ/CPF: ${clientCnpj}`, 14, y)
    y += 5
    doc.text(`${clientAddr}${clientNeigh ? ` - ${clientNeigh}` : ''}${clientCep ? ` - ${clientCep}` : ''}`, 14, y)
    y += 5
    if (clientCity || clientState) { doc.text(`${clientCity}${clientState ? `/${clientState}` : ''}`, 14, y); y += 5 }
    if (quote.clientContact) { doc.text(`Contato: ${quote.clientContact}`, 14, y); y += 5 }
    if (quote.clientPhone) { doc.text(`Tel: ${quote.clientPhone}`, 14, y); y += 5 }

    y += 4
    sectionTitle(doc, 'ITENS', 14, y)
    y += 4

    const tableData = quote.items.map((item, idx) => [
      String(idx + 1),
      item.code || '',
      item.description || '',
      String(item.quantity),
      item.unit,
      item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    ])

    autoTable(doc, {
      startY: y,
      head: [['#', 'Código', 'Descrição', 'Qtd', 'Unid', 'Preço Unit.', 'Total']],
      body: tableData,
      ...brandTableStyles,
      columnStyles: {
        0: { cellWidth: 10 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'center', cellWidth: 12 },
        5: { halign: 'right', cellWidth: 25 },
        6: { halign: 'right', cellWidth: 25 },
      },
    })

    const finalY = (doc as any).lastAutoTable?.finalY ?? y + 40
    const totalsX = pageWidth - 80

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Subtotal:', totalsX, finalY + 8)
    doc.text(`R$ ${quote.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 14, finalY + 8, { align: 'right' })

    let totalsY = finalY + 8
    if (quote.discountTotal > 0) {
      totalsY += 6
      doc.text(`Desconto${quote.discountType === 'percent' ? ` (${quote.discountValue}%)` : ''}:`, totalsX, totalsY)
      doc.text(`- R$ ${quote.discountTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 14, totalsY, { align: 'right' })
    }

    totalsY += 10
    doc.setFillColor(...BRAND_RED)
    doc.rect(totalsX - 4, totalsY - 6, pageWidth - 14 - (totalsX - 4), 9, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(255, 255, 255)
    doc.text('TOTAL:', totalsX, totalsY)
    doc.text(`R$ ${quote.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 14, totalsY, { align: 'right' })
    doc.setTextColor(0, 0, 0)

    let footY = totalsY + 14
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    if (quote.paymentTerms) {
      doc.setFont('helvetica', 'bold'); doc.text('Condições de Pagamento:', 14, footY); doc.setFont('helvetica', 'normal')
      footY += 5; doc.text(quote.paymentTerms, 14, footY); footY += 5
    }
    if (quote.deliveryTime) {
      doc.setFont('helvetica', 'bold'); doc.text('Prazo de Entrega:', 14, footY); doc.setFont('helvetica', 'normal')
      footY += 5; doc.text(quote.deliveryTime, 14, footY); footY += 5
    }
    if (quote.warranty) {
      doc.setFont('helvetica', 'bold'); doc.text('Garantia:', 14, footY); doc.setFont('helvetica', 'normal')
      footY += 5; doc.text(quote.warranty, 14, footY); footY += 5
    }
    if (quote.generalConditions) {
      doc.setFont('helvetica', 'bold'); doc.text('Condições Gerais:', 14, footY); doc.setFont('helvetica', 'normal')
      footY += 5
      const lines = doc.splitTextToSize(quote.generalConditions, pageWidth - 28)
      doc.text(lines, 14, footY)
      footY += lines.length * 4
    }
    if (quote.freightText && quote.freightText !== 'A COMBINAR') {
      footY += 5
      doc.setFont('helvetica', 'bold'); doc.text('Frete:', 14, footY); doc.setFont('helvetica', 'normal')
      footY += 5; doc.text(quote.freightText, 14, footY)
    }

    drawFooter(doc)
    return Buffer.from(doc.output('arraybuffer'))
  }

  async generateTransportPdf(quoteId: string): Promise<Buffer> {
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      include: { items: { orderBy: { order: 'asc' } }, client: true },
    })

    if (!quote) throw new Error('Orçamento não encontrado')

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'ROMANEIO DE TRANSPORTE', `Orçamento ${quote.number}`)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Data: ${quote.date}`, 14, y)
    y += 10

    const clientName = quote.clientName || quote.client?.corporateName || '-'
    const clientCnpj = quote.clientCnpj || quote.client?.cpfCnpj || '-'
    const clientAddr = quote.clientAddress || quote.client?.address || '-'

    sectionTitle(doc, 'DESTINATÁRIO', 14, y)
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.text(clientName, 14, y)
    doc.setFont('helvetica', 'normal')
    y += 5
    doc.text(`CNPJ/CPF: ${clientCnpj}`, 14, y); y += 5
    doc.text(`Endereço: ${clientAddr}`, 14, y); y += 5
    if (quote.clientPhone) { doc.text(`Tel: ${quote.clientPhone}`, 14, y); y += 5 }
    y += 4

    const tableData = quote.items.map((item, idx) => [
      String(idx + 1),
      item.code || '',
      item.description || '',
      String(item.quantity),
      item.unit,
      `${item.width || '-'} x ${item.height || '-'} x ${item.length || '-'} cm`,
      item.weight ? `${item.weight} kg` : '-',
    ])

    autoTable(doc, {
      startY: y,
      head: [['#', 'Código', 'Descrição', 'Qtd', 'Unid', 'Dimensões (cm)', 'Peso']],
      body: tableData,
      ...brandTableStyles,
    })

    const finalY = (doc as any).lastAutoTable?.finalY ?? y + 80
    sectionTitle(doc, 'OBSERVAÇÕES', 14, finalY + 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(quote.notes || quote.internalNotes || 'Nenhuma observação.', 14, finalY + 17)

    drawFooter(doc)
    return Buffer.from(doc.output('arraybuffer'))
  }

  async generateRequisitionPdf(requisitionId: string): Promise<Buffer> {
    const requisition = await db.requisition.findUnique({
      where: { id: requisitionId },
      include: {
        items: { include: { material: true, supplier: true } },
        productionOrder: { select: { number: true, productName: true } },
        user: { select: { name: true } },
      },
    })

    if (!requisition) throw new Error('Requisição não encontrada')

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'REQUISIÇÃO DE COMPRA', `Nº ${requisition.number}`)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Data: ${requisition.date}`, 14, y)
    doc.text(`Necessário até: ${requisition.neededBy || '-'}`, 90, y)
    doc.text(`Status: ${requisition.status}`, 150, y)
    y += 6
    doc.text(`Solicitante: ${requisition.user.name}`, 14, y)
    if (requisition.productionOrder) {
      doc.text(`Origem: OP ${requisition.productionOrder.number} (${requisition.productionOrder.productName || ''})`, 90, y)
    }
    y += 6
    if (requisition.approvedAt) { doc.text(`Aprovado em: ${requisition.approvedAt.toLocaleDateString('pt-BR')}`, 14, y); y += 6 }

    y += 4
    sectionTitle(doc, 'ITENS DA REQUISIÇÃO', 14, y)
    y += 4

    const tableData = requisition.items.map((item, idx) => [
      String(idx + 1),
      item.material.name,
      String(item.quantity),
      item.unit,
      item.supplier ? (item.supplier.corporateName || item.supplier.tradeName) : 'A definir',
      item.estimatedPrice > 0 ? item.estimatedPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
      item.estimatedPrice > 0 ? (item.estimatedPrice * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
    ])

    autoTable(doc, {
      startY: y,
      head: [['#', 'Matéria-Prima', 'Qtd', 'Unid', 'Fornecedor', 'Preço Est.', 'Total Est.']],
      body: tableData,
      ...brandTableStyles,
      columnStyles: {
        0: { cellWidth: 10 },
        2: { halign: 'right', cellWidth: 18 },
        3: { halign: 'center', cellWidth: 14 },
        5: { halign: 'right', cellWidth: 25 },
        6: { halign: 'right', cellWidth: 25 },
      },
    })

    const finalY = (doc as any).lastAutoTable?.finalY ?? y + 40
    const totalEstimated = requisition.items.reduce((sum, i) => sum + i.estimatedPrice * i.quantity, 0)

    doc.setFillColor(...BRAND_RED)
    doc.rect(pageWidth - 84, finalY + 4, 70, 9, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text('TOTAL ESTIMADO:', pageWidth - 80, finalY + 10)
    doc.text(`R$ ${totalEstimated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 14, finalY + 10, { align: 'right' })
    doc.setTextColor(0, 0, 0)

    if (requisition.notes) {
      sectionTitle(doc, 'OBSERVAÇÕES', 14, finalY + 22)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const lines = doc.splitTextToSize(requisition.notes, pageWidth - 28)
      doc.text(lines, 14, finalY + 29)
    }

    drawFooter(doc)
    return Buffer.from(doc.output('arraybuffer'))
  }

  async generateProductionOrderPdf(productionOrderId: string): Promise<Buffer> {
    const order = await db.productionOrder.findUnique({
      where: { id: productionOrderId },
      include: {
        product: { include: { materials: { include: { material: true } } } },
        user: { select: { name: true } },
      },
    })

    if (!order) throw new Error('Ordem de produção não encontrada')

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'ORDEM DE PRODUÇÃO', `Nº ${order.number}`)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Data: ${order.date}`, 14, y)
    doc.text(`Prazo: ${order.dueDate || '-'}`, 90, y)
    doc.text(`Prioridade: ${order.priority}`, 150, y)
    y += 6
    doc.text(`Status: ${order.status}`, 14, y)
    doc.text(`Responsável: ${order.user.name}`, 90, y)
    y += 10

    sectionTitle(doc, 'PRODUTO', 14, y)
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.text(`${order.productName || order.product?.name || '-'}`, 14, y)
    doc.setFont('helvetica', 'normal')
    y += 5
    doc.text(`Quantidade: ${order.quantity} ${order.unit}`, 14, y)
    y += 8

    if (order.description) {
      sectionTitle(doc, 'DESCRIÇÃO', 14, y)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const lines = doc.splitTextToSize(order.description, pageWidth - 28)
      doc.text(lines, 14, y)
      y += lines.length * 4 + 6
    }

    const materials = order.product?.materials || []
    if (materials.length > 0) {
      sectionTitle(doc, 'MATÉRIA-PRIMA NECESSÁRIA', 14, y)
      y += 4

      const tableData = materials.map((pm, idx) => {
        const grossNeeded = pm.quantity * order.quantity * (1 + pm.scrapPct / 100)
        return [
          String(idx + 1), pm.material.name, String(pm.quantity), pm.unit,
          `${pm.scrapPct}%`, grossNeeded.toFixed(2), pm.material.stockQty.toFixed(2),
        ]
      })

      autoTable(doc, {
        startY: y,
        head: [['#', 'Matéria-Prima', 'Qtd/Un', 'Unid', 'Perda', 'Total Necess.', 'Estoque Atual']],
        body: tableData,
        ...brandTableStyles,
      })
    }

    if (order.notes) {
      const finalY = (doc as any).lastAutoTable?.finalY ?? y + 20
      sectionTitle(doc, 'OBSERVAÇÕES', 14, finalY + 10)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const lines = doc.splitTextToSize(order.notes, pageWidth - 28)
      doc.text(lines, 14, finalY + 17)
    }

    drawFooter(doc)
    return Buffer.from(doc.output('arraybuffer'))
  }

  async generateReportPdf(title: string, rows: Record<string, unknown>[], summaryLines: string[] = []): Promise<Buffer> {
    const doc = new jsPDF('l', 'mm', 'a4') // paisagem — relatórios costumam ter muitas colunas
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, title.toUpperCase())

    if (summaryLines.length > 0) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      for (const line of summaryLines) { doc.text(line, 14, y); y += 5 }
      y += 4
    }

    if (rows.length > 0) {
      const headers = Object.keys(rows[0])
      const body = rows.map((r) => headers.map((h) => String(r[h] ?? '')))

      autoTable(doc, {
        startY: y,
        head: [headers],
        body,
        ...brandTableStyles,
        bodyStyles: { fontSize: 7 },
        margin: { left: 14, right: 14 },
      })
    } else {
      doc.setFontSize(10)
      doc.text('Nenhum registro encontrado para os filtros selecionados.', 14, y)
    }

    drawFooter(doc)
    return Buffer.from(doc.output('arraybuffer'))
  }
}

export const pdfService = new PdfService()
