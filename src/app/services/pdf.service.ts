import { db } from '@/lib/db'
import { settingService } from '@/app/services/setting.service'
import { getStorageDir } from '@/lib/storage'
import jsPDF from 'jspdf'
import autoTable, { type CellHookData } from 'jspdf-autotable'
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

// ── Foto de produto (Orçamento, variante técnica) ──────────────────────────
const IMAGE_FORMAT_BY_EXT: Record<string, string> = { jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', webp: 'WEBP', gif: 'GIF89a' }

/** Lê uma foto de produto já enviada (mesmo storage usado pelo upload, `getStorageDir()`) e devolve
 * pronta pra `doc.addImage()`. Nunca lança — item sem foto (ou arquivo ilegível/corrompido) só cai no
 * placeholder desenhado por `drawImagePlaceholder`, nunca quebra a geração do PDF inteiro. */
function getProductImageEmbed(relativeUrl: string): { data: string; format: string } | null {
  try {
    const ext = path.extname(relativeUrl).toLowerCase().replace('.', '')
    const format = IMAGE_FORMAT_BY_EXT[ext]
    if (!format) return null
    const fullPath = path.join(getStorageDir(), relativeUrl)
    const buffer = fs.readFileSync(fullPath)
    return { data: `data:image/${ext};base64,${buffer.toString('base64')}`, format }
  } catch {
    return null
  }
}

/** Placeholder discreto (quadrado cinza) para item sem produto vinculado ou sem foto cadastrada —
 * nunca deixa a célula da tabela vazia/quebrada na variante técnica do Orçamento. */
function drawImagePlaceholder(doc: jsPDF, cell: { x: number; y: number; width: number; height: number }) {
  const size = Math.min(cell.width, cell.height) - 4
  const cx = cell.x + (cell.width - size) / 2
  const cy = cell.y + (cell.height - size) / 2
  doc.setFillColor(240, 240, 240)
  doc.setDrawColor(...BRAND_BORDER)
  doc.roundedRect(cx, cy, size, size, 1, 1, 'FD')
}

// ── Tipografia de marca ──────────────────────────────────────────────────
// Geist Regular (Vercel, licença livre) — única fonte disponível sem acesso a internet para baixar
// outra; extraída uma única vez de `node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf`
// (onde o próprio Next.js já a empacota para sua função de geração de imagens OG) e copiada para
// `src/assets/fonts/` — commitada no projeto, não lida do node_modules em runtime, já que é um
// artefato interno de outra dependência que pode desaparecer numa atualização futura do Next.js.
// Só o peso Regular está disponível: hierarquia visual (título vs. corpo) vem de tamanho/cor, nunca
// de negrito sintético — jsPDF lança erro ao pedir uma variante ('bold') não registrada.
const BRAND_FONT = 'Geist'
let cachedFontBase64: string | null = null
function getBrandFontBase64(): string | null {
  if (cachedFontBase64 !== null) return cachedFontBase64
  try {
    const fontPath = path.join(process.cwd(), 'src', 'assets', 'fonts', 'Geist-Regular.ttf')
    const buffer = fs.readFileSync(fontPath)
    cachedFontBase64 = buffer.toString('base64')
  } catch {
    cachedFontBase64 = ''
  }
  return cachedFontBase64 || null
}

/** Registra e ativa a fonte de marca no documento — chamada uma vez, logo após `new jsPDF(...)`, em
 * cada método `generate*Pdf`. Se o arquivo não puder ser lido por algum motivo, o documento
 * simplesmente continua na fonte padrão do jsPDF (helvetica) — nunca lança erro por causa disso. */
function registerBrandFont(doc: jsPDF) {
  const base64 = getBrandFontBase64()
  if (!base64) return
  doc.addFileToVFS('Geist-Regular.ttf', base64)
  doc.addFont('Geist-Regular.ttf', BRAND_FONT, 'normal')
  doc.setFont(BRAND_FONT, 'normal')
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
    doc.setFont(BRAND_FONT, 'normal')
    doc.setTextColor(...BRAND_RED)
    doc.text('COZISTEEL', 14, 22)
    doc.setTextColor(0, 0, 0)
  }

  doc.setFontSize(17)
  doc.setFont(BRAND_FONT, 'normal')
  doc.setTextColor(...BRAND_RED)
  doc.setCharSpace(0.3) // leve tracking no título uppercase — mais presença sem depender de negrito
  doc.text(docTitle, pageWidth - 14, 18, { align: 'right' })
  doc.setCharSpace(0)

  if (docNumber) {
    doc.setFontSize(10)
    doc.setFont(BRAND_FONT, 'normal')
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
    doc.setFont(BRAND_FONT, 'normal')
    doc.setTextColor(...BRAND_GRAY)
    doc.text('COZISTEEL — Instalações Comerciais', 14, pageHeight - 11)
    if (extraLine) doc.text(extraLine, 14, pageHeight - 7)
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 11, { align: 'right' })
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - 14, pageHeight - 7, { align: 'right' })
    doc.setTextColor(0, 0, 0)
  }
}

function drawCheckIcon(doc: jsPDF, cx: number, cy: number) {
  doc.setDrawColor(...BRAND_RED)
  doc.setLineWidth(0.85)
  doc.setLineCap(1) // round — traço mais macio que a extremidade quadrada padrão, típico de ícones de linha
  doc.setLineJoin(1)
  doc.line(cx - 1.6, cy, cx - 0.3, cy + 1.4)
  doc.line(cx - 0.3, cy + 1.4, cx + 1.8, cy - 1.6)
  doc.setLineCap(0)
  doc.setLineJoin(0)
}

function drawStarIcon(doc: jsPDF, cx: number, cy: number, r = 1.9) {
  const points: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.42
    const angle = (Math.PI / 5) * i - Math.PI / 2
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
  }
  doc.setFillColor(...BRAND_RED)
  const lines = points.slice(1).map((p, i) => [p[0] - points[i][0], p[1] - points[i][1]])
  ;(doc as any).lines(lines, points[0][0], points[0][1], [1, 1], 'F', true)
}

function drawDiamondIcon(doc: jsPDF, cx: number, cy: number, r = 1.8) {
  doc.setFillColor(...BRAND_RED)
  const points: [number, number][] = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]]
  const lines = points.slice(1).map((p, i) => [p[0] - points[i][0], p[1] - points[i][1]])
  ;(doc as any).lines(lines, points[0][0], points[0][1], [1, 1], 'F', true)
}

/**
 * Barra de rodapé "institucional" (marca + selos de qualidade) — usada só no
 * modelo comercial (documentos voltados ao cliente, como o Orçamento).
 */
function drawBrandFooterBar(doc: jsPDF, y: number) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  // Ancora perto da margem inferior em documentos curtos (ex.: orçamento de 1 item) — sem isso a barra
  // ficava largada no meio de uma página quase vazia, com um vão enorme até o rodapé. Nunca sobrepõe
  // conteúdo que já chegue perto do rodapé: o fluxo normal (y vindo do conteúdo) prevalece nesse caso.
  y = Math.max(y, pageHeight - 41)
  const badges: [string, 'check' | 'star' | 'diamond'][] = [
    ['QUALIDADE', 'check'], ['EXCELÊNCIA', 'star'], ['COMPROMISSO', 'check'], ['CONFIANÇA', 'diamond'],
  ]
  const zoneWidth = (pageWidth - 28) / badges.length

  badges.forEach(([label, icon], i) => {
    const cx = 14 + zoneWidth * i + zoneWidth / 2 - 12
    // Selo preenchido (tom clarissimo da cor de marca) em vez de só contorno — leitura de "selo/
    // certificação" mais forte do que um círculo vazio, mesma paleta institucional.
    doc.setFillColor(252, 238, 239)
    doc.setDrawColor(...BRAND_RED)
    doc.setLineWidth(0.55)
    doc.circle(cx, y, 3.4, 'FD')
    if (icon === 'check') drawCheckIcon(doc, cx, y)
    else if (icon === 'star') drawStarIcon(doc, cx, y)
    else drawDiamondIcon(doc, cx, y)

    doc.setFont(BRAND_FONT, 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(60, 60, 60)
    doc.setCharSpace(0.15)
    doc.text(label, cx + 6, y + 1.2)
    doc.setCharSpace(0)
  })

  // Barra em grafite, não vermelha — a mesma lógica do cabeçalho de tabela: vermelho é o acento
  // (selos, logo, total), não a cor de fundo de uma faixa sólida que se repete em todo documento.
  doc.setFillColor(...BRAND_DARK)
  doc.rect(0, y + 8, pageWidth, 7, 'F')
  doc.setFont(BRAND_FONT, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.setCharSpace(0.4)
  doc.text('COZISTEEL — SOLUÇÕES EM AÇO INOXIDÁVEL', pageWidth / 2, y + 12.7, { align: 'center' })
  doc.setCharSpace(0)
  doc.setTextColor(0, 0, 0)
}

/**
 * Estilo padrão de tabela na identidade Cozisteel (cabeçalho em grafite, não vermelho — vermelho fica
 * reservado a destaques pontuais: logo, títulos de seção, total. Um bloco sólido vermelho cobrindo a
 * tabela inteira lê como alerta, não como "documento profissional", pelas mesmas convenções que um
 * cabeçalho vermelho de erro/urgência usaria). `fontStyle: 'normal'` no cabeçalho é deliberado:
 * jspdf-autotable herda a fonte ativa do documento (`getFont().fontName`, hoje `BRAND_FONT`) e só tem
 * o peso Regular registrado — pedir 'bold' aqui lançaria erro ao tentar montar qualquer tabela.
 * Contraste branco-sobre-grafite já garante destaque suficiente ao cabeçalho sem depender de negrito.
 */
const brandTableStyles = {
  theme: 'grid' as const,
  headStyles: { fillColor: BRAND_DARK, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'normal' as const, fontSize: 8 },
  bodyStyles: { fontSize: 8 },
  alternateRowStyles: { fillColor: [250, 245, 245] as [number, number, number] },
}

/** Título de seção no padrão Cozisteel (barra fininha vermelha à esquerda do texto). */
function sectionTitle(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFillColor(...BRAND_RED)
  doc.rect(x, y - 3.2, 1.2, 4.2, 'F')
  doc.setFont(BRAND_FONT, 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...BRAND_RED)
  doc.setCharSpace(0.25)
  doc.text(text, x + 3, y)
  doc.setCharSpace(0)
  doc.setTextColor(0, 0, 0)
}

/**
 * Desenha os dois cartões lado a lado: DADOS DO CLIENTE (claro) e DADOS DA EMPRESA (escuro).
 * Retorna o Y logo abaixo dos cartões.
 */
function drawInfoCards(doc: jsPDF, y: number, clientLines: string[], company: CompanyInfo): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const cardWidth = (pageWidth - 28 - 6) / 2
  const lineHeight = 4.6
  const textWidth = cardWidth - 8

  const companyLines = [
    company.tradeName,
    `CNPJ: ${company.cnpj}${company.ie ? `  IE: ${company.ie}` : ''}`,
    `${company.address}${company.neighborhood ? ` - ${company.neighborhood}` : ''}`,
    `${company.cityState}${company.cep ? ` - ${company.cep}` : ''}`,
    `Tel: ${company.phone}`,
    `${company.email}`,
  ]

  // Mede quantas linhas REAIS cada texto vai ocupar (jsPDF quebra internamente quando excede
  // textWidth) — necessário para avançar Y corretamente entre itens e para dimensionar o card,
  // em vez de assumir 1 linha renderizada por item do array (bug antigo: e-mail/endereço longo
  // sobrepunha a linha seguinte e podia vazar da borda do card).
  const clientWrapped = clientLines.map((line) => doc.splitTextToSize(line, textWidth) as string[])
  const companyWrapped = companyLines.map((line) => doc.splitTextToSize(line, textWidth) as string[])
  const clientLineCount = clientWrapped.reduce((sum, w) => sum + w.length, 0)
  const companyLineCount = companyWrapped.reduce((sum, w) => sum + w.length, 0)
  const cardHeight = 5 + Math.max(clientLineCount, companyLineCount, 5) * lineHeight + 4

  // Card claro — Cliente
  doc.setFillColor(...BRAND_LIGHT)
  doc.setDrawColor(...BRAND_BORDER)
  doc.roundedRect(14, y, cardWidth, cardHeight, 2, 2, 'FD')
  doc.setFont(BRAND_FONT, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...BRAND_RED)
  doc.setCharSpace(0.25)
  doc.text('DADOS DO CLIENTE', 18, y + 6)
  doc.setCharSpace(0)
  doc.setFont(BRAND_FONT, 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(40, 40, 40)
  let clientY = y + 12
  for (const wrapped of clientWrapped) {
    for (const subLine of wrapped) { doc.text(subLine, 18, clientY); clientY += lineHeight }
  }

  // Card escuro — Empresa
  const rightX = 14 + cardWidth + 6
  doc.setFillColor(...BRAND_DARK)
  doc.roundedRect(rightX, y, cardWidth, cardHeight, 2, 2, 'F')
  doc.setFont(BRAND_FONT, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.setCharSpace(0.25)
  doc.text('DADOS DA EMPRESA', rightX + 4, y + 6)
  doc.setCharSpace(0)
  doc.setFont(BRAND_FONT, 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(225, 225, 225)
  let companyY = y + 12
  for (const wrapped of companyWrapped) {
    for (const subLine of wrapped) { doc.text(subLine, rightX + 4, companyY); companyY += lineHeight }
  }
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

  doc.setFont(BRAND_FONT, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  rows.forEach((row, i) => {
    doc.text(row[0], boxX + 5, y + 7 + i * rowHeight)
    doc.text(row[1], boxX + boxWidth - 5, y + 7 + i * rowHeight, { align: 'right' })
  })

  const totalY = y + rows.length * rowHeight + 6
  doc.setFillColor(...BRAND_RED)
  doc.rect(boxX, totalY, boxWidth, 9, 'F')
  doc.setFont(BRAND_FONT, 'normal')
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
  const lineHeight = 4.4
  const textWidth = colWidth - 8

  // Mesma correção de drawInfoCards: mede as linhas reais ANTES de desenhar, em vez de assumir
  // 1 linha por item — evita sobreposição/vazamento quando um texto (ex.: "Pagamento: ...") é
  // longo o suficiente para quebrar.
  const leftWrapped = leftLines.map((line) => doc.splitTextToSize(line, textWidth) as string[])
  const rightWrapped = rightLines.map((line) => doc.splitTextToSize(line, textWidth) as string[])
  const leftLineCount = leftWrapped.reduce((sum, w) => sum + w.length, 0)
  const rightLineCount = rightWrapped.reduce((sum, w) => sum + w.length, 0)
  const lineCount = Math.max(leftLineCount, rightLineCount, 2)
  // O corpo do texto começa em y+13 (título + respiro), não em y+8 — com "8" aqui a última linha
  // (baseline em 13+(lineCount-1)*lineHeight) ficava abaixo da borda inferior da caixa. "12" garante
  // ~3mm de folga depois da última linha (cobre descendentes de g/p/y) em vez de vazar pra fora.
  const boxHeight = 12 + lineCount * lineHeight

  doc.setDrawColor(...BRAND_BORDER)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(14, y, colWidth, boxHeight, 2, 2, 'FD')
  doc.roundedRect(14 + colWidth + 6, y, colWidth, boxHeight, 2, 2, 'FD')

  sectionTitle(doc, leftTitle, 18, y + 6)
  sectionTitle(doc, rightTitle, 18 + colWidth + 6, y + 6)

  doc.setFont(BRAND_FONT, 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(50, 50, 50)
  let leftY = y + 13
  for (const wrapped of leftWrapped) {
    for (const subLine of wrapped) { doc.text(subLine, 18, leftY); leftY += lineHeight }
  }
  let rightY = y + 13
  for (const wrapped of rightWrapped) {
    for (const subLine of wrapped) { doc.text(subLine, 18 + colWidth + 6, rightY); rightY += lineHeight }
  }
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
    doc.setFont(BRAND_FONT, 'normal')
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
  doc.setFont(BRAND_FONT, 'normal')
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
  /**
   * `variant` (Orçamento Técnico × Comercial, achado do usuário): a única diferença de verdade é a
   * coluna de foto na tabela de itens — o resto do documento (cards, totais, condições, assinatura) é
   * idêntico nas duas. Técnico é para quem já quer ver o produto físico (mais informativo); Comercial
   * é o layout enxuto de sempre, indicado para cliente novo (foco em preço/condições, sem "prova
   * visual" que pode não ser necessária nessa fase da relação).
   */
  async generateQuotePdf(quoteId: string, variant: 'tecnico' | 'comercial' = 'comercial'): Promise<Buffer> {
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: { product: { select: { images: { where: { isPrimary: true }, take: 1, select: { url: true } } } } },
        },
        client: true,
        user: { select: { name: true } },
      },
    })

    if (!quote) throw new Error('Orçamento não encontrado')
    const company = await getCompanyInfo()

    const doc = new jsPDF('p', 'mm', 'a4')
    registerBrandFont(doc)
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'ORÇAMENTO', `Nº ${quote.number}`)

    doc.setFontSize(9)
    doc.setFont(BRAND_FONT, 'normal')
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

    const isTecnico = variant === 'tecnico'
    const tableData = isTecnico
      ? quote.items.map((item, idx) => [
          String(idx + 1), '', item.code || '', item.description || '', String(item.quantity), item.unit,
          item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        ])
      : quote.items.map((item, idx) => [
          String(idx + 1), item.code || '', item.description || '', String(item.quantity), item.unit,
          item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        ])

    autoTable(doc, {
      startY: y,
      head: isTecnico
        ? [['#', 'Foto', 'Código', 'Descrição', 'Qtd', 'Unid', 'Preço Unit.', 'Total']]
        : [['#', 'Código', 'Descrição', 'Qtd', 'Unid', 'Preço Unit.', 'Total']],
      body: tableData,
      ...brandTableStyles,
      columnStyles: isTecnico
        ? {
            0: { cellWidth: 8 },
            1: { cellWidth: 16, minCellHeight: 14 },
            4: { halign: 'right', cellWidth: 16 },
            5: { halign: 'center', cellWidth: 12 },
            6: { halign: 'right', cellWidth: 23 },
            7: { halign: 'right', cellWidth: 23 },
          }
        : {
            0: { cellWidth: 10 },
            3: { halign: 'right', cellWidth: 18 },
            4: { halign: 'center', cellWidth: 12 },
            5: { halign: 'right', cellWidth: 25 },
            6: { halign: 'right', cellWidth: 25 },
          },
      // Desenha a foto (ou um placeholder discreto) por cima da célula "Foto" já renderizada — só
      // ativo na variante técnica. Item avulso sem produto vinculado, produto sem foto cadastrada, ou
      // arquivo de imagem ilegível caem todos no mesmo placeholder, nunca numa célula quebrada.
      didDrawCell: isTecnico
        ? (data: CellHookData) => {
            if (data.section !== 'body' || data.column.index !== 1) return
            const item = quote.items[data.row.index]
            const imageUrl = item.product?.images?.[0]?.url
            const embedded = imageUrl ? getProductImageEmbed(imageUrl) : null
            if (embedded) {
              const size = Math.min(data.cell.width, data.cell.height) - 2
              const cx = data.cell.x + (data.cell.width - size) / 2
              const cy = data.cell.y + (data.cell.height - size) / 2
              try {
                doc.addImage(embedded.data, embedded.format, cx, cy, size, size)
                return
              } catch {
                // arquivo corrompido/formato inesperado — cai no placeholder abaixo
              }
            }
            drawImagePlaceholder(doc, data.cell)
          }
        : undefined,
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
    const noteLines = [quote.notes || quote.generalConditions || 'Nenhuma observação adicional.']
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
    const company = await getCompanyInfo()

    const doc = new jsPDF('p', 'mm', 'a4')
    registerBrandFont(doc)
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'ROMANEIO DE TRANSPORTE', `Orçamento ${quote.number}`)

    doc.setFontSize(9)
    doc.setFont(BRAND_FONT, 'normal')
    doc.setTextColor(...BRAND_GRAY)
    doc.text(`Data: ${quote.date}`, 14, y)
    doc.setTextColor(0, 0, 0)
    y += 8

    const clientName = quote.clientName || quote.client?.corporateName || '-'
    const clientCnpj = quote.clientCnpj || quote.client?.cpfCnpj || '-'
    const clientAddr = quote.clientAddress || quote.client?.address || '-'
    const clientNeigh = quote.clientNeighborhood || quote.client?.neighborhood || ''
    const clientCityState = quote.client ? `${quote.client.city || ''}${quote.client.state ? `/${quote.client.state}` : ''}` : ''

    const clientLines = [
      clientName,
      `CNPJ/CPF: ${clientCnpj}`,
      `${clientAddr}${clientNeigh ? ` - ${clientNeigh}` : ''}`,
      clientCityState,
      quote.clientPhone ? `Tel: ${quote.clientPhone}` : '',
    ].filter(Boolean)

    y = drawInfoCards(doc, y, clientLines, company)

    sectionTitle(doc, 'ITENS PARA TRANSPORTE', 14, y)
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

    let finalY = (doc as any).lastAutoTable?.finalY ?? y + 80
    finalY = ensureSpace(doc, finalY, 35)
    sectionTitle(doc, 'OBSERVAÇÕES', 14, finalY + 10)
    doc.setFont(BRAND_FONT, 'normal')
    doc.setFontSize(9)
    const obsLines = doc.splitTextToSize(quote.notes || quote.internalNotes || 'Nenhuma observação.', pageWidth - 28)
    doc.text(obsLines, 14, finalY + 17)

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
    registerBrandFont(doc)
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'REQUISIÇÃO DE COMPRA', `Nº ${requisition.number}`)

    doc.setFontSize(9)
    doc.setFont(BRAND_FONT, 'normal')
    doc.setTextColor(...BRAND_GRAY)
    doc.text(`Data: ${requisition.date}`, 14, y)
    doc.setTextColor(0, 0, 0)
    y += 8

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

    let finalY = (doc as any).lastAutoTable?.finalY ?? y + 40
    finalY = ensureSpace(doc, finalY, 30)
    const totalEstimated = requisition.items.reduce((sum, i) => sum + i.estimatedPrice * i.quantity, 0)

    // Geometria alinhada com drawSummaryBox (boxWidth 82, margem direita 14) — antes esta caixa
    // era desenhada com posição/largura próprias (70/84), ficando desalinhada com a caixa de
    // total de todos os outros documentos (Orçamento, Pedido de Venda, Pedido de Compra).
    const totalBoxWidth = 82
    const totalBoxX = pageWidth - 14 - totalBoxWidth
    doc.setFillColor(...BRAND_RED)
    doc.rect(totalBoxX, finalY + 4, totalBoxWidth, 9, 'F')
    doc.setFont(BRAND_FONT, 'normal')
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text('TOTAL ESTIMADO:', totalBoxX + 5, finalY + 10)
    doc.text(`R$ ${totalEstimated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 14, finalY + 10, { align: 'right' })
    doc.setTextColor(0, 0, 0)

    if (requisition.notes) {
      finalY = ensureSpace(doc, finalY, 35)
      sectionTitle(doc, 'OBSERVAÇÕES', 14, finalY + 22)
      doc.setFont(BRAND_FONT, 'normal')
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
    registerBrandFont(doc)
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'ORDEM DE PRODUÇÃO', `Nº ${order.number}`)

    const infoLines = [
      `Produto: ${order.productName || order.product?.name || '-'}`,
      `Data: ${order.date}`,
      `Quantidade: ${order.quantity} ${order.unit}`,
      `Status: ${order.status}    Prioridade: ${order.priority}`,
      `Prazo: ${order.dueDate || '-'}`,
      `Responsável: ${order.user.name}`,
    ]

    y = drawInfoCards(doc, y, infoLines, company)

    if (order.description) {
      sectionTitle(doc, 'DESCRIÇÃO', 14, y)
      y += 6
      doc.setFont(BRAND_FONT, 'normal')
      doc.setFontSize(9)
      const lines = doc.splitTextToSize(order.description, pageWidth - 28)
      doc.text(lines, 14, y)
      y += lines.length * 4 + 6
    }

    const materials = order.product?.materials || []
    if (materials.length > 0) {
      y = ensureSpace(doc, y, 45)
      sectionTitle(doc, 'MATÉRIA-PRIMA NECESSÁRIA', 14, y)
      y += 4

      const tableData = materials.map((pm, idx) => {
        const grossNeeded = pm.quantity * order.quantity * (1 + pm.scrapPct / 100)
        return [
          String(idx + 1), pm.material.name, String(pm.quantity), pm.unit,
          `${pm.scrapPct}%`,
          grossNeeded.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          pm.material.stockQty.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        ]
      })

      autoTable(doc, {
        startY: y,
        head: [['#', 'Matéria-Prima', 'Qtd/Un', 'Unid', 'Perda', 'Total Necess.', 'Estoque Atual']],
        body: tableData,
        ...brandTableStyles,
        columnStyles: {
          0: { cellWidth: 10 },
          2: { halign: 'right', cellWidth: 20 },
          3: { halign: 'center', cellWidth: 14 },
          4: { halign: 'right', cellWidth: 16 },
          5: { halign: 'right', cellWidth: 25 },
          6: { halign: 'right', cellWidth: 25 },
        },
      })
    }

    if (order.notes) {
      let finalY = (doc as any).lastAutoTable?.finalY ?? y + 20
      finalY = ensureSpace(doc, finalY, 35)
      sectionTitle(doc, 'OBSERVAÇÕES', 14, finalY + 10)
      doc.setFont(BRAND_FONT, 'normal')
      doc.setFontSize(9)
      const lines = doc.splitTextToSize(order.notes, pageWidth - 28)
      doc.text(lines, 14, finalY + 17)
    }

    drawFooter(doc)
    return Buffer.from(doc.output('arraybuffer'))
  }

  async generateReportPdf(title: string, rows: Record<string, unknown>[], summaryLines: string[] = []): Promise<Buffer> {
    const company = await getCompanyInfo()
    const doc = new jsPDF('l', 'mm', 'a4') // paisagem — relatórios costumam ter muitas colunas
    registerBrandFont(doc)
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, title.toUpperCase())

    doc.setFontSize(8)
    doc.setFont(BRAND_FONT, 'normal')
    doc.setTextColor(...BRAND_GRAY)
    doc.text(`${company.tradeName} — CNPJ ${company.cnpj}`, 14, y)
    doc.setTextColor(0, 0, 0)
    y += 7

    if (summaryLines.length > 0) {
      doc.setFontSize(9)
      doc.setFont(BRAND_FONT, 'normal')
      for (const line of summaryLines) {
        const wrapped = doc.splitTextToSize(line, pageWidth - 28)
        doc.text(wrapped, 14, y)
        y += wrapped.length * 5
      }
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
  async generateSalesOrderPdf(salesOrderId: string): Promise<Buffer> {
    const salesOrder = await db.salesOrder.findUnique({
      where: { id: salesOrderId },
      include: { items: true, client: true, quote: { select: { number: true } }, user: { select: { name: true } } },
    })

    if (!salesOrder) throw new Error('Pedido de venda não encontrado')
    const company = await getCompanyInfo()

    const doc = new jsPDF('p', 'mm', 'a4')
    registerBrandFont(doc)
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'PEDIDO DE VENDA', `Nº ${salesOrder.number}`)

    doc.setFontSize(9)
    doc.setFont(BRAND_FONT, 'normal')
    doc.setTextColor(...BRAND_GRAY)
    doc.text(`Data: ${salesOrder.date}`, 14, y)
    doc.text(`Origem: Orçamento ${salesOrder.quote.number}`, pageWidth - 14, y, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    y += 8

    const clientName = salesOrder.clientName || salesOrder.client?.corporateName || '-'
    const clientCnpj = salesOrder.clientCnpj || salesOrder.client?.cpfCnpj || '-'
    const clientLines = [
      clientName,
      `CNPJ/CPF: ${clientCnpj}`,
      salesOrder.client?.address ? `${salesOrder.client.address}${salesOrder.client.neighborhood ? ` - ${salesOrder.client.neighborhood}` : ''}` : '',
      salesOrder.client ? `${salesOrder.client.city || ''}${salesOrder.client.state ? `/${salesOrder.client.state}` : ''}` : '',
      salesOrder.client?.phone ? `Tel: ${salesOrder.client.phone}` : '',
    ].filter(Boolean)

    y = drawInfoCards(doc, y, clientLines, company)

    sectionTitle(doc, 'ITENS DO PEDIDO', 14, y)
    y += 4

    const tableData = salesOrder.items.map((item, idx) => [
      String(idx + 1), item.code || '', item.description || '', String(item.quantity), item.unit,
      item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    ])

    autoTable(doc, {
      startY: y,
      head: [['#', 'Código', 'Descrição', 'Qtd', 'Unid', 'Preço Unit.', 'Total']],
      body: tableData,
      ...brandTableStyles,
      columnStyles: { 0: { cellWidth: 10 }, 3: { halign: 'right', cellWidth: 18 }, 4: { halign: 'center', cellWidth: 12 }, 5: { halign: 'right', cellWidth: 25 }, 6: { halign: 'right', cellWidth: 25 } },
    })

    y = ((doc as any).lastAutoTable?.finalY ?? y + 40) + 8
    y = ensureSpace(doc, y, 45)
    y = drawSummaryBox(doc, y, salesOrder.subtotal, salesOrder.discountTotal, 'Desconto:', 0, '', salesOrder.total)

    const conditionLines = [
      salesOrder.paymentTerms ? `Pagamento: ${salesOrder.paymentTerms}` : '',
      salesOrder.deliveryTime ? `Prazo de entrega: ${salesOrder.deliveryTime}` : '',
      `Vendedor: ${salesOrder.user.name}`,
    ].filter(Boolean)
    const noteLines = [salesOrder.notes || 'Nenhuma observação.']
    y = ensureSpace(doc, y, 45)
    y = drawTwoColumnBoxes(doc, y, 'CONDIÇÕES', conditionLines, 'OBSERVAÇÕES', noteLines)

    // Identidade institucional (Fase 13, Lote 5, ADR-015) — mesmo selo de marca já usado no
    // Orçamento, estendido aqui por ser igualmente um documento comercial externo (cliente).
    y = ensureSpace(doc, y, 20)
    drawBrandFooterBar(doc, y + 4)

    drawFooter(doc)
    return Buffer.from(doc.output('arraybuffer'))
  }

  /** Documento externo/comercial enviado ao fornecedor (mesmo shape de generateSalesOrderPdf). */
  async generatePurchaseOrderPdf(purchaseOrderId: string): Promise<Buffer> {
    const po = await db.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: { include: { material: true } }, supplier: true, requisition: { select: { number: true } }, user: { select: { name: true } } },
    })

    if (!po) throw new Error('Pedido de compra não encontrado')
    const company = await getCompanyInfo()

    const doc = new jsPDF('p', 'mm', 'a4')
    registerBrandFont(doc)
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = drawHeader(doc, 'PEDIDO DE COMPRA', `Nº ${po.number}`)

    doc.setFontSize(9)
    doc.setFont(BRAND_FONT, 'normal')
    doc.setTextColor(...BRAND_GRAY)
    doc.text(`Data: ${po.date}`, 14, y)
    doc.text(`Origem: Requisição ${po.requisition.number}`, pageWidth - 14, y, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    y += 8

    const supplierName = po.supplier.corporateName || po.supplier.tradeName || '-'
    const supplierLines = [
      supplierName,
      `CNPJ/CPF: ${po.supplier.cpfCnpj || '-'}`,
      po.supplier.address ? `${po.supplier.address}${po.supplier.neighborhood ? ` - ${po.supplier.neighborhood}` : ''}` : '',
      `${po.supplier.city || ''}${po.supplier.state ? `/${po.supplier.state}` : ''}`,
      po.supplier.phone ? `Tel: ${po.supplier.phone}` : '',
    ].filter(Boolean)

    y = drawInfoCards(doc, y, supplierLines, company)

    sectionTitle(doc, 'ITENS DO PEDIDO', 14, y)
    y += 4

    const tableData = po.items.map((item, idx) => [
      String(idx + 1), item.material.name, String(item.quantity), item.unit,
      item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    ])

    autoTable(doc, {
      startY: y,
      head: [['#', 'Matéria-Prima', 'Qtd', 'Unid', 'Preço Unit.', 'Total']],
      body: tableData,
      ...brandTableStyles,
      columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'right', cellWidth: 18 }, 3: { halign: 'center', cellWidth: 14 }, 4: { halign: 'right', cellWidth: 28 }, 5: { halign: 'right', cellWidth: 28 } },
    })

    y = ((doc as any).lastAutoTable?.finalY ?? y + 40) + 8
    y = ensureSpace(doc, y, 45)
    y = drawSummaryBox(doc, y, po.subtotal, 0, '', 0, '', po.total)

    const conditionLines = [
      po.paymentTerms ? `Pagamento: ${po.paymentTerms}` : '',
      po.expectedDate ? `Previsão de entrega: ${po.expectedDate}` : '',
      `Comprador: ${po.user.name}`,
    ].filter(Boolean)
    const noteLines = [po.notes || 'Nenhuma observação.']
    y = ensureSpace(doc, y, 45)
    y = drawTwoColumnBoxes(doc, y, 'CONDIÇÕES', conditionLines, 'OBSERVAÇÕES', noteLines)

    // Identidade institucional (Fase 13, Lote 5, ADR-015) — mesmo selo de marca já usado no
    // Orçamento e no Pedido de Venda, estendido aqui por ser igualmente um documento comercial
    // externo (fornecedor).
    y = ensureSpace(doc, y, 20)
    drawBrandFooterBar(doc, y + 4)

    drawFooter(doc)
    return Buffer.from(doc.output('arraybuffer'))
  }
}

export const pdfService = new PdfService()
