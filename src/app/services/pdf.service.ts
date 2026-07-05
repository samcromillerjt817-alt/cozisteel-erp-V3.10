import { db } from '@/lib/db'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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

    // Header
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('COZISTEEL', 14, 20)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Soluções em Aço Carbono', 14, 26)

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('ORÇAMENTO', pageWidth - 14, 20, { align: 'right' })
    doc.setFontSize(10)
    doc.text(`Nº ${quote.number}`, pageWidth - 14, 27, { align: 'right' })

    // Line separator
    doc.setDrawColor(200, 200, 200)
    doc.line(14, 32, pageWidth - 14, 32)

    // Quote info
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    let y = 40
    doc.text(`Data: ${quote.date}`, 14, y)
    doc.text(`Validade: ${quote.validity || quote.validUntil || '-'}`, 14, y + 5)
    if (quote.approvedAt) {
      doc.text(`Aprovado em: ${quote.approvedAt.toLocaleDateString('pt-BR')}`, 14, y + 10)
    }

    // Client info
    doc.setFont('helvetica', 'bold')
    doc.text('CLIENTE', 14, y + 18)
    doc.setFont('helvetica', 'normal')
    const clientName = quote.clientName || quote.client?.corporateName || '-'
    const clientCnpj = quote.clientCnpj || quote.client?.cpfCnpj || '-'
    const clientAddr = quote.clientAddress || quote.client?.address || '-'
    const clientNeigh = quote.clientNeighborhood || quote.client?.neighborhood || ''
    const clientCep = quote.clientCep || quote.client?.zipCode || ''
    const clientCity = quote.client?.city || ''
    const clientState = quote.client?.state || ''
    doc.text(clientName, 14, y + 24)
    doc.text(`CNPJ/CPF: ${clientCnpj}`, 14, y + 29)
    doc.text(`${clientAddr}${clientNeigh ? ` - ${clientNeigh}` : ''}${clientCep ? ` - ${clientCep}` : ''}`, 14, y + 34)
    if (clientCity || clientState) {
      doc.text(`${clientCity}${clientState ? `/${clientState}` : ''}`, 14, y + 39)
    }
    if (quote.clientContact) doc.text(`Contato: ${quote.clientContact}`, 14, y + 44)
    if (quote.clientPhone) doc.text(`Tel: ${quote.clientPhone}`, 14, y + 49)

    // Items table
    const tableStart = y + 58
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
      startY: tableStart,
      head: [['#', 'Código', 'Descrição', 'Qtd', 'Unid', 'Preço Unit.', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'center', cellWidth: 12 },
        5: { halign: 'right', cellWidth: 25 },
        6: { halign: 'right', cellWidth: 25 },
      },
    })

    // Totals
    const finalY = (doc as any).lastAutoTable?.finalY ?? tableStart + 40
    const totalsX = pageWidth - 80

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Subtotal:', totalsX, finalY + 8)
    doc.text(`R$ ${quote.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 14, finalY + 8, { align: 'right' })

    if (quote.discountTotal > 0) {
      doc.text(`Desconto (${quote.discountType === 'percent' ? `${quote.discountValue}%` : ''}):`, totalsX, finalY + 14)
      doc.text(`- R$ ${quote.discountTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 14, finalY + 14, { align: 'right' })
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('TOTAL:', totalsX, finalY + 22)
    doc.text(`R$ ${quote.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 14, finalY + 22, { align: 'right' })

    // Footer conditions
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    let footY = finalY + 32
    if (quote.paymentTerms) {
      doc.setFont('helvetica', 'bold')
      doc.text('Condições de Pagamento:', 14, footY)
      doc.setFont('helvetica', 'normal')
      footY += 5
      doc.text(quote.paymentTerms, 14, footY)
      footY += 5
    }
    if (quote.deliveryTime) {
      doc.setFont('helvetica', 'bold')
      doc.text('Prazo de Entrega:', 14, footY)
      doc.setFont('helvetica', 'normal')
      footY += 5
      doc.text(quote.deliveryTime, 14, footY)
      footY += 5
    }
    if (quote.warranty) {
      doc.setFont('helvetica', 'bold')
      doc.text('Garantia:', 14, footY)
      doc.setFont('helvetica', 'normal')
      footY += 5
      doc.text(quote.warranty, 14, footY)
      footY += 5
    }
    if (quote.generalConditions) {
      doc.setFont('helvetica', 'bold')
      doc.text('Condições Gerais:', 14, footY)
      doc.setFont('helvetica', 'normal')
      footY += 5
      const lines = doc.splitTextToSize(quote.generalConditions, pageWidth - 28)
      doc.text(lines, 14, footY)
      footY += lines.length * 4
    }

    // Freight
    if (quote.freightText && quote.freightText !== 'A COMBINAR') {
      footY += 5
      doc.setFont('helvetica', 'bold')
      doc.text('Frete:', 14, footY)
      doc.setFont('helvetica', 'normal')
      footY += 5
      doc.text(quote.freightText, 14, footY)
    }

    // Footer page number
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.text(`Cozisteel ERP v3.0 - Página ${i} de ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })
    }

    return Buffer.from(doc.output('arraybuffer'))
  }

  async generateTransportPdf(quoteId: string): Promise<Buffer> {
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: { orderBy: { order: 'asc' } },
        client: true,
      },
    })

    if (!quote) throw new Error('Orçamento não encontrado')

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('COZISTEEL - ROMANEIO DE TRANSPORTE', 14, 20)

    doc.setDrawColor(200, 200, 200)
    doc.line(14, 25, pageWidth - 14, 25)

    let y = 32
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Orçamento: ${quote.number}`, 14, y)
    doc.text(`Data: ${quote.date}`, 14, y + 5)

    const clientName = quote.clientName || quote.client?.corporateName || '-'
    const clientCnpj = quote.clientCnpj || quote.client?.cpfCnpj || '-'
    const clientAddr = quote.clientAddress || quote.client?.address || '-'

    doc.setFont('helvetica', 'bold')
    doc.text('DESTINATÁRIO:', 14, y + 14)
    doc.setFont('helvetica', 'normal')
    doc.text(clientName, 14, y + 19)
    doc.text(`CNPJ/CPF: ${clientCnpj}`, 14, y + 24)
    doc.text(`Endereço: ${clientAddr}`, 14, y + 29)
    if (quote.clientPhone) doc.text(`Tel: ${quote.clientPhone}`, 14, y + 34)

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
      startY: y + 42,
      head: [['#', 'Código', 'Descrição', 'Qtd', 'Unid', 'Dimensões (cm)', 'Peso']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
    })

    const finalY = (doc as any).lastAutoTable?.finalY ?? y + 80
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Observações:', 14, finalY + 10)
    doc.setFont('helvetica', 'normal')
    doc.text(quote.notes || quote.internalNotes || 'Nenhuma observação.', 14, finalY + 15)

    doc.setFontSize(7)
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} - Cozisteel ERP v3.0`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })

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

    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('COZISTEEL', 14, 20)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Soluções em Aço Carbono', 14, 26)

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('REQUISIÇÃO DE COMPRA', pageWidth - 14, 20, { align: 'right' })
    doc.setFontSize(10)
    doc.text(`Nº ${requisition.number}`, pageWidth - 14, 27, { align: 'right' })

    doc.setDrawColor(200, 200, 200)
    doc.line(14, 32, pageWidth - 14, 32)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    let y = 40
    doc.text(`Data: ${requisition.date}`, 14, y)
    doc.text(`Necessário até: ${requisition.neededBy || '-'}`, 14, y + 5)
    doc.text(`Status: ${requisition.status}`, 14, y + 10)
    doc.text(`Solicitante: ${requisition.user.name}`, 14, y + 15)
    if (requisition.productionOrder) {
      doc.text(`Origem: OP ${requisition.productionOrder.number} (${requisition.productionOrder.productName || ''})`, 14, y + 20)
    }
    if (requisition.approvedAt) {
      doc.text(`Aprovado em: ${requisition.approvedAt.toLocaleDateString('pt-BR')}`, 14, y + 25)
    }

    const tableStart = y + 32
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
      startY: tableStart,
      head: [['#', 'Matéria-Prima', 'Qtd', 'Unid', 'Fornecedor', 'Preço Est.', 'Total Est.']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 30, 30], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10 },
        2: { halign: 'right', cellWidth: 18 },
        3: { halign: 'center', cellWidth: 14 },
        5: { halign: 'right', cellWidth: 25 },
        6: { halign: 'right', cellWidth: 25 },
      },
    })

    const finalY = (doc as any).lastAutoTable?.finalY ?? tableStart + 40
    const totalEstimated = requisition.items.reduce((sum, i) => sum + i.estimatedPrice * i.quantity, 0)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('TOTAL ESTIMADO:', pageWidth - 80, finalY + 10)
    doc.text(`R$ ${totalEstimated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 14, finalY + 10, { align: 'right' })

    if (requisition.notes) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('Observações:', 14, finalY + 20)
      doc.setFont('helvetica', 'normal')
      const lines = doc.splitTextToSize(requisition.notes, pageWidth - 28)
      doc.text(lines, 14, finalY + 25)
    }

    doc.setFontSize(7)
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} - Cozisteel ERP v3.0`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })

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

    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('COZISTEEL', 14, 20)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Soluções em Aço Carbono', 14, 26)

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('ORDEM DE PRODUÇÃO / FABRICAÇÃO', pageWidth - 14, 20, { align: 'right' })
    doc.setFontSize(10)
    doc.text(`Nº ${order.number}`, pageWidth - 14, 27, { align: 'right' })

    doc.setDrawColor(200, 200, 200)
    doc.line(14, 32, pageWidth - 14, 32)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    let y = 40
    doc.text(`Data: ${order.date}`, 14, y)
    doc.text(`Prazo: ${order.dueDate || '-'}`, 14, y + 5)
    doc.text(`Status: ${order.status}    Prioridade: ${order.priority}`, 14, y + 10)
    doc.text(`Responsável: ${order.user.name}`, 14, y + 15)

    doc.setFont('helvetica', 'bold')
    doc.text('PRODUTO', 14, y + 23)
    doc.setFont('helvetica', 'normal')
    doc.text(`${order.productName || order.product?.name || '-'}`, 14, y + 29)
    doc.text(`Quantidade: ${order.quantity} ${order.unit}`, 14, y + 34)

    let tableStart = y + 42
    if (order.description) {
      doc.setFont('helvetica', 'bold')
      doc.text('Descrição:', 14, tableStart)
      doc.setFont('helvetica', 'normal')
      const lines = doc.splitTextToSize(order.description, pageWidth - 28)
      doc.text(lines, 14, tableStart + 5)
      tableStart += 5 + lines.length * 4 + 4
    }

    const materials = order.product?.materials || []
    if (materials.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('MATÉRIA-PRIMA NECESSÁRIA', 14, tableStart)

      const tableData = materials.map((pm, idx) => {
        const grossNeeded = pm.quantity * order.quantity * (1 + pm.scrapPct / 100)
        return [
          String(idx + 1),
          pm.material.name,
          String(pm.quantity),
          pm.unit,
          `${pm.scrapPct}%`,
          grossNeeded.toFixed(2),
          pm.material.stockQty.toFixed(2),
        ]
      })

      autoTable(doc, {
        startY: tableStart + 4,
        head: [['#', 'Matéria-Prima', 'Qtd/Un', 'Unid', 'Perda', 'Total Necess.', 'Estoque Atual']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [30, 30, 30], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
      })
    }

    if (order.notes) {
      const finalY = (doc as any).lastAutoTable?.finalY ?? tableStart + 20
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('Observações:', 14, finalY + 10)
      doc.setFont('helvetica', 'normal')
      const lines = doc.splitTextToSize(order.notes, pageWidth - 28)
      doc.text(lines, 14, finalY + 15)
    }

    doc.setFontSize(7)
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} - Cozisteel ERP v3.0`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })

    return Buffer.from(doc.output('arraybuffer'))
  }
}

export const pdfService = new PdfService()