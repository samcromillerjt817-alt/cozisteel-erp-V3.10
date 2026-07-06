import { db } from '@/lib/db'
import { settingService } from '@/app/services/setting.service'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import fs from 'fs'
import path from 'path'

// ── Identidade visual Cozisteel ──────────────────────────────────────────
const BRAND_RED: [number, number, number] = [178, 17, 25]      // #B21119 — cor exata extraída da logo oficial
const BRAND_DARK: [number, number, number] = [26, 26, 26]      // "card" escuro (dados da empresa)
const BRAND_GRAY: [number, number, number] = [100, 100, 100]
const BRAND_LIGHT: [number, number, number] = [247, 247, 247]  // fundo do card claro (dados do cliente)
const BRAND_BORDER: [number, number, number] = [225, 225, 225]

const PAGE_SAFE_Y = 252 // abaixo disso, reserva nova página pro fechamento do documento

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

interface CompanyInfo {
  name: string; tradeName: string; cnpj: string; ie: string
  address: string; neighborhood: string; cityState: string; cep: string
  phone: string; email: string; contact: string
}

async function getCompanyInfo(): Promise<CompanyInfo> {
  const rows = await settingService.getGroup('company')
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return {
    name: map['company.name'] || 'COZISTEEL',
    tradeName: map['company.tradeName'] || 'COZISTEEL',
    cnpj: map['company.cnpj'] || '',
    ie: map['company.ie'] || '',
    address: map['company.address'] || '',
    neighborhood: map['company.neighborhood'] || '',
    cityState: map['city.state'] || '',
    cep: map['company.cep'] || '',
    phone: map['company.phone'] || '',
    email: map['company.email'] || '',
    contact: map['company.contact'] || '',
  }
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

/**
 * Barra de rodapé "institucional" (marca + selos de qualidade) — usada só no
 * modelo comercial (documentos voltados ao cliente, como o Orçamento).
 */
function drawBrandFooterBar(doc: jsPDF, y: number) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const badges: [string, string][] = [['✓', 'QUALIDADE'], ['★', 'EXCELÊNCIA'], ['✓', 'COMPROMISSO'], ['♦', 'CONFIANÇA']]
  const zoneWidth = (pageWidth - 28) / badges.length

  badges.forEach(([symbol, label], i) => {
    const cx = 14 + zoneWidth * i + zoneWidth / 2
    doc.setDrawColor(...BRAND_RED)
    doc.setLineWidth(0.5)
    doc.circle(cx - 12, y, 3.2, 'S')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...BRAND_RED)
    doc.text(symbol, cx - 12, y + 1.2, { align: 'center' })
    doc.setFontSize(7.5)
    doc.setTextColor(60, 60, 60)
    doc.text(label, cx - 6, y + 1.2)
  })

  doc.setFillColor(...BRAND_RED)
  doc.rect(0, y + 8, pageWidth, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('COZISTEEL — SOLUÇÕES EM AÇO INOXIDÁVEL', pageWidth / 2, y + 12.7, { align: 'center' })
  doc.setTextColor(0, 0, 0)
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

/**
 * Desenha os dois cartões lado a lado: DADOS DO CLIENTE (claro) e DADOS DA EMPRESA (escuro).
 * Retorna o Y logo abaixo dos cartões.
 */
function drawInfoCards(doc: jsPDF, y: number, clientLines: string[], company: CompanyInfo): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const cardWidth = (pageWidth - 28 - 6) / 2
  const cardHeight = 5 + Math.max(clientLines.length, 5) * 4.6 + 4

  // Card claro — Cliente
  doc.setFillColor(...BRAND_LIGHT)
  doc.setDrawColor(...BRAND_BORDER)
  doc.roundedRect(14, y, cardWidth, cardHeight, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...BRAND_RED)
  doc.text('DADOS DO CLIENTE', 18, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(40, 40, 40)
  clientLines.forEach((line, i) => doc.text(line, 18, y + 12 + i * 4.6, { maxWidth: cardWidth - 8 }))

  // Card escuro — Empresa
  const rightX = 14 + cardWidth + 6
  doc.setFillColor(...BRAND_DARK)
  doc.roundedRect(rightX, y, cardWidth, cardHeight, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('DADOS DA EMPRESA', rightX + 4, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(225, 225, 225)
  const companyLines = [
    company.tradeName,
    `CNPJ: ${company.cnpj}${company.ie ? `  IE: ${company.ie}` : ''}`,
    `${company.address}${company.neighborhood ? ` - ${company.neighborhood}` : ''}`,
    `${company.cityState}${company.cep ? ` - ${company.cep}` : ''}`,
    `Tel: ${company.phone}`,
    `${company.email}`,
  ]
  companyLines.forEach((line, i) => doc.text(line, rightX + 4, y + 12 + i * 4.6, { maxWidth: cardWidth - 8 }))
  doc.setTextColor(0, 0, 0)

  return y + cardHeight + 8
}

/** Caixa de totais (subtotal / desconto / frete / total em destaque). */
function drawSummaryBox(doc: jsPDF, y: number, subtotal: number, discountTotal: number, discountLabel: string, freightValue: number, freightText: string, total: number): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const boxWidth = 82
  const boxX = pageWidth - 14 - boxWidth
  let rows = [[`Subtotal:`, `R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]]
  if (discountTotal > 0) rows.push([discountLabel, `- R$ ${discountTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`])
  if (freightValue > 0) rows.push(['Frete:', `R$ ${freightValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`])
  else if (freightText) rows.push(['Frete:', freightText])

  const rowHeight = 6.5
  const boxHeight = rows.length * rowHeight + 12

  doc.setDrawColor(...BRAND_BORDER)
  doc.setFillColor(252, 252, 252)
  doc.roundedRect(boxX, y, boxWidth, boxHeight, 2, 2, 'FD')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  rows.forEach((row, i) => {
    doc.text(row[0], boxX + 5, y + 7 + i * rowHeight)
    doc.text(row[1], boxX + boxWidth - 5, y + 7 + i * rowHeight, { align: 'right' })
  })

  const totalY = y + rows.length * rowHeight + 6
  doc.setFillColor(...BRAND_RED)
  doc.rect(boxX, totalY, boxWidth, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL:', boxX + 5, totalY + 6)
  doc.text(`R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, boxX + boxWidth - 5, totalY + 6, { align: 'right' })
  doc.setTextColor(0, 0, 0)

  return y + boxHeight + 10
}

/** Duas caixas lado a lado: Condições Comerciais | Observações. */
function drawTwoColumnBoxes(doc: jsPDF, y: number, leftTitle: string, leftLines: string[], rightTitle: string, rightLines: string[]): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const colWidth = (pageWidth - 28 - 6) / 2
  const lineCount = Math.max(leftLines.length, rightLines.length, 2)
  const boxHeight = 8 + lineCount * 4.4

  doc.setDrawColor(...BRAND_BORDER)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(14, y, colWidth, boxHeight, 2, 2, 'FD')
  doc.roundedRect(14 + colWidth + 6, y, colWidth, boxHeight, 2, 2, 'FD')

  sectionTitle(doc, leftTitle, 18, y + 6)
  sectionTitle(doc, rightTitle, 18 + colWidth + 6, y + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(50, 50, 50)
  leftLines.forEach((line, i) => doc.text(line, 18, y + 13 + i * 4.4, { maxWidth: colWidth - 8 }))
  rightLines.forEach((line, i) => doc.text(line, 18 + colWidth + 6, y + 13 + i * 4.4, { maxWidth: colWidth - 8 }))
  doc.setTextColor(0, 0, 0)

  return y + boxHeight + 10
}

/** Bloco de assinatura / aprovação do cliente. */
function drawSignatureBlock(doc: jsPDF, y: number, approvedBy?: string, approvedAt?: Date | null): number {
  const pageWidth = doc.internal.pageSize.getWidth()

  if (approvedAt) {
    doc.setFillColor(230, 247, 237)
    doc.setDrawColor(16, 150, 90)
    doc.roundedRect(14, y, pageWidth - 28, 14, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(16, 120, 75)
    doc.text(`✓ APROVADO em ${approvedAt.toLocaleDateString('pt-BR')}`, 20, y + 9)
    doc.setTextColor(0, 0, 0)
    return y + 20
  }

  const lineY = y + 18
  doc.setDrawColor(150, 150, 150)
  doc.line(14, lineY, 90, lineY)
  doc.line(pageWidth - 90, lineY, pageWidth - 14, lineY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...BRAND_GRAY)
  doc.text('Assinatura do Cliente', 14, lineY + 5)
  doc.text('Data', pageWidth - 90, lineY + 5)
  doc.setTextColor(0, 0, 0)
  return lineY + 12
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_SAFE_Y) {
    doc.addPage()
    return 20
  }
  return y
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
    const company = await getCompanyInfo()

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'ORÇAMENTO', `Nº ${quote.number}`)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BRAND_GRAY)
    doc.text(`Data: ${quote.date}`, 14, y)
    doc.text(`Validade: ${quote.validity || quote.validUntil || '-'}`, pageWidth - 14, y, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    y += 8

    const clientName = quote.clientName || quote.client?.corporateName || '-'
    const clientCnpj = quote.clientCnpj || quote.client?.cpfCnpj || '-'
    const clientAddr = quote.clientAddress || quote.client?.address || '-'
    const clientNeigh = quote.clientNeighborhood || quote.client?.neighborhood || ''
    const clientCep = quote.clientCep || quote.client?.zipCode || ''
    const clientCityState = quote.client ? `${quote.client.city || ''}${quote.client.state ? `/${quote.client.state}` : ''}` : ''

    const clientLines = [
      clientName,
      `CNPJ/CPF: ${clientCnpj}`,
      `${clientAddr}${clientNeigh ? ` - ${clientNeigh}` : ''}`,
      `${clientCityState}${clientCep ? ` - ${clientCep}` : ''}`,
      quote.clientContact ? `Contato: ${quote.clientContact}` : '',
      quote.clientPhone ? `Tel: ${quote.clientPhone}` : '',
    ].filter(Boolean)

    y = drawInfoCards(doc, y, clientLines, company)

    sectionTitle(doc, 'ITENS DO ORÇAMENTO', 14, y)
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
      margin: { bottom: 30 },
    })

    y = ((doc as any).lastAutoTable?.finalY ?? y + 40) + 8
    y = ensureSpace(doc, y, 45)

    const discountLabel = `Desconto${quote.discountType === 'percent' ? ` (${quote.discountValue}%)` : ''}:`
    y = drawSummaryBox(doc, y, quote.subtotal, quote.discountTotal, discountLabel, quote.freightValue, quote.freightText, quote.total)

    y = ensureSpace(doc, y, 45)
    const conditionLines = [
      quote.paymentTerms ? `Pagamento: ${quote.paymentTerms}` : '',
      quote.deliveryTime ? `Prazo de entrega: ${quote.deliveryTime}` : '',
      quote.warranty ? `Garantia: ${quote.warranty}` : '',
      quote.validity ? `Validade da proposta: ${quote.validity}` : '',
    ].filter(Boolean)
    const noteLines = doc.splitTextToSize(quote.notes || quote.generalConditions || 'Nenhuma observação adicional.', 78)
    y = drawTwoColumnBoxes(doc, y, 'CONDIÇÕES COMERCIAIS', conditionLines.length ? conditionLines : ['A combinar'], 'OBSERVAÇÕES', noteLines)

    y = ensureSpace(doc, y, 35)
    y = drawSignatureBlock(doc, y, quote.approvedBy || undefined, quote.approvedAt)

    y = ensureSpace(doc, y, 20)
    drawBrandFooterBar(doc, y + 4)

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

  /** Modelo técnico (interno): mesma identidade visual, layout mais direto e sem apelo comercial. */
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
    const company = await getCompanyInfo()

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'REQUISIÇÃO DE COMPRA', `Nº ${requisition.number}`)

    const infoLines = [
      `Solicitante: ${requisition.user.name}`,
      `Status: ${requisition.status}`,
      `Necessário até: ${requisition.neededBy || '-'}`,
      requisition.productionOrder ? `Origem: OP ${requisition.productionOrder.number} (${requisition.productionOrder.productName || ''})` : 'Origem: manual',
      requisition.approvedAt ? `Aprovado em: ${requisition.approvedAt.toLocaleDateString('pt-BR')}` : '',
    ].filter(Boolean)

    y = drawInfoCards(doc, y, infoLines, company)

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
    const company = await getCompanyInfo()

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'ORDEM DE PRODUÇÃO', `Nº ${order.number}`)

    const infoLines = [
      `Produto: ${order.productName || order.product?.name || '-'}`,
      `Quantidade: ${order.quantity} ${order.unit}`,
      `Status: ${order.status}    Prioridade: ${order.priority}`,
      `Prazo: ${order.dueDate || '-'}`,
      `Responsável: ${order.user.name}`,
    ]

    y = drawInfoCards(doc, y, infoLines, company)

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
