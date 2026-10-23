// Texto da fonte de cada tempo de trecho no planejamento (fase 8): roteiro, rota ou manual, com
// o tempo de carro, o fator, a distância, a data do cálculo e a comparação manual × rota.

import { compararManualComRota, fatorImplicito, rotaDoTrecho, type ComparacaoManualRota } from '../../core/rotas'
import type { DuracaoTrecho, Instante, Trecho } from '../../core/tipos'
import { formatarDuracao } from './duracao'
import { formatarData, formatarHora } from './horarios'
import { textoDaFonte } from './textos'

/** 1,15 → "1,15". */
export function formatarFator(fator: number): string {
  return fator.toFixed(2).replace('.', ',')
}

/** "1,15" ou "1.15" → número; texto que não é um número simples → `null`. */
export function lerFator(texto: string): number | null {
  const limpo = texto.trim()
  if (!/^\d+([.,]\d+)?$/.test(limpo)) return null
  return Number(limpo.replace(',', '.'))
}

/** "23/10 às 15:30". */
export function textoDaDataDoCalculo(i: Instante): string {
  const [, mes, dia] = formatarData(i).split('-')
  return `${dia}/${mes} às ${formatarHora(i)}`
}

const km = (n: number) => `${String(n).replace('.', ',')} km`

export interface DescricaoDoTrecho {
  /** "do roteiro", "calculado pela rota", "manual"... Vazio quando não há tempo. */
  fonte: string
  detalhes: string[]
  /** Só quando o tempo é manual, há rota ao lado e a diferença é grande: a pessoa escolhe. */
  comparacao: (ComparacaoManualRota & { texto: string }) | null
}

export function descreverTrecho(duracao: DuracaoTrecho | null, guardado: Trecho | undefined, fator: number): DescricaoDoTrecho {
  if (!duracao || duracao.minutos === null) return { fonte: '', detalhes: [], comparacao: null }
  const resultado: DescricaoDoTrecho = { fonte: textoDaFonte(duracao.fonte), detalhes: [], comparacao: null }
  const rota = rotaDoTrecho(guardado)
  if (!rota) return resultado
  const carro = formatarDuracao(rota.duracaoMin)
  const quando = `${km(rota.distanciaKm)} · calculado em ${textoDaDataDoCalculo(rota.calculadoEm)}`

  if (duracao.fonte === 'rota') {
    resultado.detalhes.push(`carro ${carro} × fator ${formatarFator(fator)} · ${quando}`)
  } else if (duracao.fonte === 'roteiro') {
    resultado.detalhes.push(
      `roteiro ${formatarDuracao(duracao.minutos)} · carro ${carro} · fator implícito ${formatarFator(fatorImplicito(duracao.minutos, rota.duracaoMin))}`,
      quando,
    )
  } else if (duracao.fonte === 'manual') {
    const c = compararManualComRota(duracao.minutos, rota, fator)
    resultado.detalhes.push(`rota: ${formatarDuracao(c.onibusMin)} (carro ${carro} × fator ${formatarFator(fator)}) · ${quando}`)
    if (c.grande) {
      const sinal = c.diferencaMin > 0 ? '+' : '−'
      resultado.comparacao = {
        ...c,
        texto: `Seu tempo ${formatarDuracao(c.manualMin)} · rota ${formatarDuracao(c.onibusMin)} (diferença ${sinal}${formatarDuracao(Math.abs(c.diferencaMin))})`,
      }
    }
  }
  return resultado
}
