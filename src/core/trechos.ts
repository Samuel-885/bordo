// Duração de um trecho, sempre com fonte ("Regras de cálculo da previsão").

import { diferencaMin, somarMinutos } from './tempo'
import type { DadosPlano, DuracaoTrecho, Etapa, Instante } from './tipos'

export const SEM_TEMPO: DuracaoTrecho = { minutos: null, fonte: null }

export function ordenarEtapas(etapas: readonly Etapa[]): Etapa[] {
  return [...etapas].sort((a, b) => a.ordem - b.ordem)
}

/** Saída do roteiro: na origem é o próprio horário; nas outras, chegada + permanência. */
export function saidaRoteiro(etapa: Etapa): Instante | null {
  if (!etapa.chegadaRoteiro) return null
  if (etapa.tipo === 'origem') return etapa.chegadaRoteiro
  return somarMinutos(etapa.chegadaRoteiro, etapa.permanenciaMin)
}

/** Duração × fator ônibus, arredondada para cima. */
export function aplicarFatorOnibus(minutosCarro: number, fator: number): number {
  // Arredonda antes do ceil para que erros de ponto flutuante (60 × 1,15 = 69,00000000000001)
  // não ganhem um minuto a mais.
  return Math.ceil(Math.round(minutosCarro * fator * 1e6) / 1e6)
}

function trechoGuardado(
  d: DadosPlano,
  etapaA: Etapa,
  localA: string,
  etapaB: Etapa,
  localB: string,
): DuracaoTrecho {
  const t = d.trechos.find(
    (x) =>
      x.etapaOrigemId === etapaA.id &&
      x.localOrigemId === localA &&
      x.etapaDestinoId === etapaB.id &&
      x.localDestinoId === localB,
  )
  if (!t || t.duracaoMin === null) return SEM_TEMPO
  if (t.fonte === 'rota') {
    return { minutos: aplicarFatorOnibus(t.duracaoMin, d.viagem.fatorOnibus), fonte: 'rota' }
  }
  return { minutos: t.duracaoMin, fonte: 'manual' }
}

/**
 * Duração do trecho entre dois locais de duas etapas, nesta ordem:
 * 1. roteiro: etapas vizinhas no plano, ambas no local preferido e com horário de roteiro;
 * 2. rota (× fator ônibus, para cima); 3. manual; 4. sem tempo.
 */
export function duracaoTrecho(
  d: DadosPlano,
  etapaA: Etapa,
  localA: string | null,
  etapaB: Etapa,
  localB: string | null,
): DuracaoTrecho {
  if (localA === null || localB === null) return SEM_TEMPO

  const ordenadas = ordenarEtapas(d.etapas)
  const vizinhas =
    ordenadas.findIndex((e) => e.id === etapaB.id) -
      ordenadas.findIndex((e) => e.id === etapaA.id) ===
    1
  const saidaA = saidaRoteiro(etapaA)
  if (
    vizinhas &&
    localA === etapaA.localId &&
    localB === etapaB.localId &&
    saidaA !== null &&
    etapaB.chegadaRoteiro
  ) {
    return { minutos: diferencaMin(etapaB.chegadaRoteiro, saidaA), fonte: 'roteiro' }
  }

  return trechoGuardado(d, etapaA, localA, etapaB, localB)
}

export interface PontoDoTrecho {
  etapa: Etapa
  localId: string | null
}

/**
 * Duração entre duas etapas ativas, com as puladas entre elas. Sem puladas, é o
 * trecho normal. Com puladas, usa o trecho direto se ele foi calculado; senão,
 * a soma dos trechos que passavam pelas puladas, com fonte "estimado".
 */
export function duracaoComPuladas(
  d: DadosPlano,
  de: PontoDoTrecho,
  puladas: readonly PontoDoTrecho[],
  ate: PontoDoTrecho,
): DuracaoTrecho {
  if (puladas.length === 0) return duracaoTrecho(d, de.etapa, de.localId, ate.etapa, ate.localId)

  if (de.localId !== null && ate.localId !== null) {
    const direto = trechoGuardado(d, de.etapa, de.localId, ate.etapa, ate.localId)
    if (direto.minutos !== null) return direto
  }

  const pontos = [de, ...puladas, ate]
  let total = 0
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1]!
    const b = pontos[i]!
    const parte = duracaoTrecho(d, a.etapa, a.localId, b.etapa, b.localId)
    if (parte.minutos === null) return SEM_TEMPO
    total += parte.minutos
  }
  return { minutos: total, fonte: 'estimado' }
}
