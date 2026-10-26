// PDF do relatório (fase 10b): desenha o mesmo documento da prévia com o jsPDF, que só é baixado
// quando a pessoa abre a tela do relatório (pedaço à parte do build, guardado pelo service worker:
// funciona sem internet). Tudo roda no celular; nada é enviado a lugar nenhum.

import type { Bloco, DocumentoDoRelatorio } from './relatorioDocumento'

export const TIPO_DO_PDF = 'application/pdf'

const PAGINA = { largura: 210, altura: 297, margem: 14 }
const UTIL = PAGINA.largura - PAGINA.margem * 2
const COR = {
  texto: [21, 33, 29] as const,
  suave: [90, 102, 97] as const,
  linha: [200, 207, 203] as const,
  cabecalhoTabela: [232, 237, 234] as const,
  aviso: [253, 244, 220] as const,
}

/**
 * Os tipos de letra padrão do PDF cobrem o latim (acentos do português), mas não "−" nem "→":
 * troca por equivalentes e o que ficar fora vira "?", em vez de sair torto.
 */
export function textoSeguroParaPdf(texto: string): string {
  const mapa: Record<string, string> = { '−': '-', '→': '->', '’': "'", '‘': "'", '“': '"', '”': '"', ' ': ' ' }
  return [...texto]
    .map((c) => {
      if (mapa[c]) return mapa[c]
      const cod = c.codePointAt(0)!
      if (cod === 9 || cod === 10 || (cod >= 32 && cod <= 126) || (cod >= 160 && cod <= 255) || c === '—' || c === '–' || c === '•' || c === '…') return c
      return '?'
    })
    .join('')
}

type Cor = readonly [number, number, number]

export async function gerarPdfDoRelatorio(doc: DocumentoDoRelatorio): Promise<File> {
  const { jsPDF: JsPdf } = await import('jspdf')
  const pdf = new JsPdf({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  pdf.setProperties({ title: doc.titulo, creator: 'Bordo' })
  let y = PAGINA.margem

  const limpo = textoSeguroParaPdf
  const cor = (c: Cor) => pdf.setTextColor(c[0], c[1], c[2])
  const fonte = (tamanho: number, estilo: 'normal' | 'bold' = 'normal') => {
    pdf.setFont('helvetica', estilo)
    pdf.setFontSize(tamanho)
  }
  const alturaDaLinha = (tamanho: number) => tamanho * 0.3528 * 1.35
  const garantir = (altura: number) => {
    if (y + altura > PAGINA.altura - PAGINA.margem - 8) {
      pdf.addPage()
      y = PAGINA.margem
      return true
    }
    return false
  }
  const quebrar = (texto: string, largura: number): string[] => pdf.splitTextToSize(limpo(texto), largura) as string[]

  const paragrafo = (texto: string, tamanho = 9.5, estilo: 'normal' | 'bold' = 'normal', c: Cor = COR.texto, recuo = 0) => {
    fonte(tamanho, estilo)
    cor(c)
    const linhas = quebrar(texto, UTIL - recuo)
    const h = alturaDaLinha(tamanho)
    for (const l of linhas) {
      garantir(h)
      pdf.text(l, PAGINA.margem + recuo, y + h * 0.75)
      y += h
    }
  }

  // Título e cabeçalho.
  paragrafo(doc.titulo, 17, 'bold')
  y += 1.5
  for (const [rotulo, valor] of doc.cabecalho) {
    fonte(9.5, 'bold')
    cor(COR.suave)
    const h = alturaDaLinha(9.5)
    garantir(h)
    pdf.text(limpo(rotulo), PAGINA.margem, y + h * 0.75)
    fonte(9.5)
    cor(COR.texto)
    const linhas = quebrar(valor, UTIL - 32)
    for (const [i, l] of linhas.entries()) {
      if (i > 0) garantir(h)
      pdf.text(l, PAGINA.margem + 32, y + h * 0.75)
      if (i < linhas.length - 1) y += h
    }
    y += h
  }
  y += 2

  // Avisos em caixa.
  for (const aviso of doc.avisos) {
    fonte(9)
    const linhas = quebrar(aviso, UTIL - 6)
    const h = alturaDaLinha(9)
    garantir(linhas.length * h + 5)
    pdf.setFillColor(COR.aviso[0], COR.aviso[1], COR.aviso[2])
    pdf.rect(PAGINA.margem, y, UTIL, linhas.length * h + 4, 'F')
    cor(COR.texto)
    linhas.forEach((l, i) => pdf.text(l, PAGINA.margem + 3, y + 2.5 + h * (i + 0.75)))
    y += linhas.length * h + 6
  }

  const desenharBloco = (b: Bloco) => {
    if (b.tipo === 'texto') {
      paragrafo(b.texto, b.estilo === 'dica' ? 8.5 : 9.5, 'normal', b.estilo === 'dica' ? COR.suave : COR.texto)
      y += 1.5
    } else if (b.tipo === 'lista') {
      for (const item of b.itens) paragrafo(`• ${item}`, 9.5, 'normal', COR.texto, 0)
      y += 1.5
    } else if (b.tipo === 'chaves') {
      for (const [rotulo, valor] of b.linhas) {
        const h = alturaDaLinha(9.5)
        fonte(9.5)
        const esq = quebrar(rotulo, UTIL * 0.58 - 2)
        fonte(9.5, 'bold')
        const dir = quebrar(valor, UTIL * 0.42)
        const n = Math.max(esq.length, dir.length)
        garantir(n * h)
        fonte(9.5)
        cor(COR.suave)
        esq.forEach((l, i) => pdf.text(l, PAGINA.margem, y + h * (i + 0.75)))
        fonte(9.5, 'bold')
        cor(COR.texto)
        dir.forEach((l, i) => pdf.text(l, PAGINA.margem + UTIL * 0.58, y + h * (i + 0.75)))
        y += n * h + 0.6
      }
      y += 1.5
    } else {
      const total = b.larguras.reduce((s, x) => s + x, 0)
      const larguras = b.larguras.map((x) => (x / total) * UTIL)
      const tamanho = 8
      const h = alturaDaLinha(tamanho)
      const pad = 1.2
      const linhaDaTabela = (celulas: string[], cabecalho: boolean) => {
        fonte(tamanho, cabecalho ? 'bold' : 'normal')
        const quebradas = celulas.map((c, i) => quebrar(c, larguras[i]! - pad * 2))
        const n = Math.max(1, ...quebradas.map((q) => q.length))
        const altura = n * h + pad * 2
        if (garantir(altura) && !cabecalho) {
          desenharCabecalho()
        }
        if (cabecalho) {
          pdf.setFillColor(COR.cabecalhoTabela[0], COR.cabecalhoTabela[1], COR.cabecalhoTabela[2])
          pdf.rect(PAGINA.margem, y, UTIL, altura, 'F')
        }
        fonte(tamanho, cabecalho ? 'bold' : 'normal')
        cor(COR.texto)
        let x = PAGINA.margem
        quebradas.forEach((q, i) => {
          q.forEach((l, k) => pdf.text(l, x + pad, y + pad + h * (k + 0.75)))
          x += larguras[i]!
        })
        pdf.setDrawColor(COR.linha[0], COR.linha[1], COR.linha[2])
        pdf.setLineWidth(0.15)
        pdf.line(PAGINA.margem, y + altura, PAGINA.margem + UTIL, y + altura)
        y += altura
      }
      const desenharCabecalho = () => {
        if (b.colunas.some((c) => c !== '')) linhaDaTabela(b.colunas, true)
      }
      desenharCabecalho()
      for (const l of b.linhas) linhaDaTabela(l, false)
      y += 3
    }
  }

  for (const secao of doc.secoes) {
    garantir(22)
    y += 3
    paragrafo(secao.titulo, 12.5, 'bold')
    pdf.setDrawColor(COR.linha[0], COR.linha[1], COR.linha[2])
    pdf.setLineWidth(0.3)
    pdf.line(PAGINA.margem, y, PAGINA.margem + UTIL, y)
    y += 2
    for (const b of secao.blocos) desenharBloco(b)
  }

  // Rodapé de cada página.
  const paginas = pdf.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    pdf.setPage(i)
    fonte(8)
    cor(COR.suave)
    pdf.text(limpo(`${doc.titulo} · Bordo`), PAGINA.margem, PAGINA.altura - 8)
    pdf.text(`Página ${i} de ${paginas}`, PAGINA.largura - PAGINA.margem, PAGINA.altura - 8, { align: 'right' })
  }

  return new File([pdf.output('arraybuffer')], doc.nomeDoArquivo, { type: TIPO_DO_PDF })
}
