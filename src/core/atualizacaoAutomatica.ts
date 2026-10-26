// Atualizar sozinho pela localização (núcleo): quando o ciclo vale, quando pausa e quando uma
// leitura vira recalibração. Só lógica pura; o GPS, a rede e o ciclo ficam fora daqui. A gravação
// é uma recalibração comum (mesmas travas), marcada `automatica`.

import { CONFIG } from './config'
import { ehErroDeGps, chegadaDaPrevia, type PreviaPorLocalizacao } from './localizacao'
import { modoDaRecalibracao, validarRecalibracao } from './recalibracao'
import { situacaoDaViagem } from './registro'
import { diferencaMin, somarMinutos } from './tempo'
import type { DadosPlano, Evento, Instante, PlanoOriginal } from './tipos'
import type { ServicoDeRota } from './transito'

export type MotivoDePausa = 'parado' | 'parada_nao_planejada' | 'sem_coordenadas'

export type SituacaoDoAutomatico =
  | { situacao: 'ativo'; etapaId: string }
  /** Condição que volta sozinha (por exemplo, depois do SAÍMOS): o modo segue ligado. */
  | { situacao: 'pausado'; motivo: MotivoDePausa }
  /** A viagem terminou (CHEGAMOS no destino): o modo desliga e a preferência é zerada. */
  | { situacao: 'encerrada' }

/**
 * Só atualiza em trânsito, para a próxima etapa (o destino inclusive, até o CHEGAMOS final) e com
 * coordenadas nela. Parado ou em parada não planejada, pausa.
 */
export function situacaoDoAutomatico(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  proximaTemCoordenadas: boolean,
  agora: Instante,
): SituacaoDoAutomatico {
  const s = situacaoDaViagem(d, original, eventos, agora)
  if (s.situacao === 'chegamos') return { situacao: 'encerrada' }
  if (s.situacao === 'parada_nao_planejada') return { situacao: 'pausado', motivo: 'parada_nao_planejada' }
  const etapaId = s.proximaEtapaId
  if (s.situacao !== 'em_viagem' || !etapaId) return { situacao: 'pausado', motivo: 'parado' }
  if (!proximaTemCoordenadas) return { situacao: 'pausado', motivo: 'sem_coordenadas' }
  const ok =
    modoDaRecalibracao(d, original, eventos, etapaId, agora) === 'em_transito' &&
    validarRecalibracao(d, original, eventos, etapaId, agora, agora).ok
  return ok ? { situacao: 'ativo', etapaId } : { situacao: 'pausado', motivo: 'parado' }
}

export function textoDaPausa(motivo: MotivoDePausa, nomeLocalParado?: string | null): string {
  switch (motivo) {
    case 'parado':
      return nomeLocalParado ? `Pausado: parados em ${nomeLocalParado}. Volta a atualizar depois do SAÍMOS.` : 'Pausado: parados. Volta a atualizar depois do SAÍMOS.'
    case 'parada_nao_planejada':
      return 'Pausado: parada não planejada. Volta a atualizar depois do VOLTAMOS.'
    case 'sem_coordenadas':
      return 'Pausado: o local da próxima parada não tem coordenadas.'
  }
}

export type MotivoDeNaoGravar = 'impreciso' | 'travada' | 'diferenca_pequena'

export type DecisaoDeGravacao =
  | { grava: true; horario: Instante; calculadoEm: Instante; servico: ServicoDeRota }
  | { grava: false; motivo: MotivoDeNaoGravar }

/**
 * A leitura vira recalibração? Nunca com GPS impreciso (no botão é só aviso; aqui ninguém
 * confere a prévia), nunca fora das travas da recalibração e nunca se o horário calculado difere
 * da previsão atual por menos de `atualizacaoAutomaticaDiferencaMinMin`.
 */
export function decidirGravacao(entrada: {
  plano: DadosPlano
  original: PlanoOriginal
  eventos: readonly Evento[]
  etapaId: string
  previa: PreviaPorLocalizacao
  fator: number
  /** Chegada prevista hoje na próxima parada, venha de onde vier; vazio se não há. */
  previsaoAtual: Instante | null
  agora: Instante
}): DecisaoDeGravacao {
  const { plano, original, eventos, etapaId, previa, fator, previsaoAtual, agora } = entrada
  if (previa.precisaoRuimM !== null) return { grava: false, motivo: 'impreciso' }
  const horario = chegadaDaPrevia(previa, fator, true)
  if (!validarRecalibracao(plano, original, eventos, etapaId, horario, agora).ok) return { grava: false, motivo: 'travada' }
  if (previsaoAtual && Math.abs(diferencaMin(horario, previsaoAtual)) < CONFIG.atualizacaoAutomaticaDiferencaMinMin) {
    return { grava: false, motivo: 'diferenca_pequena' }
  }
  return { grava: true, horario, calculadoEm: previa.calculadoEm, servico: previa.servico }
}

/** Motivo curto da falha de um ciclo, para o cartão ("sem internet", "GPS sem sinal"...). */
export function textoDaFalhaAutomatica(erro: string): string {
  if (ehErroDeGps(erro)) {
    switch (erro) {
      case 'negada':
        return 'sem permissão de localização'
      case 'sem_sinal':
        return 'GPS sem sinal'
      case 'gps_tempo_esgotado':
        return 'o GPS demorou demais'
      case 'sem_suporte':
        return 'aparelho sem localização'
    }
  }
  switch (erro) {
    case 'sem_internet':
      return 'sem internet ou sinal fraco'
    case 'tempo_esgotado':
      return 'o serviço de rotas demorou demais'
    case 'limite':
      return 'o serviço de rotas atingiu o limite'
    case 'fora':
      return 'o serviço de rotas está fora do ar'
    case 'sem_rota':
      return 'sem rota da posição até a parada'
    case 'impreciso':
      return 'posição aproximada demais (acima de 1 km)'
    case 'travada':
      return 'o horário calculado já passou'
    default:
      return 'falha ao calcular'
  }
}

/** Instante do próximo ciclo: o anterior mais o intervalo. */
export function proximoCiclo(ultimo: Instante): Instante {
  return somarMinutos(ultimo, CONFIG.atualizacaoAutomaticaMin)
}
