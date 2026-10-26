// Atualizar pela localização: a posição do GPS vai ao OSRM só no toque, e o resultado é uma
// prévia que só vira recalibração se a pessoa confirmar. Só lógica pura; o GPS e a rede ficam
// em `src/servicos/`. A posição nunca é guardada: só o horário calculado entra no evento.

import { CONFIG } from './config'
import type { Ponto } from './rotas'
import { aplicarFatorOnibus } from './trechos'
import { diferencaMin, somarMinutos, truncarMinuto } from './tempo'
import type { Instante } from './tipos'
import type { ServicoDeRota } from './transito'

/** Posição lida do GPS. `precisaoM` é o raio de incerteza informado pelo aparelho. */
export interface PosicaoGps extends Ponto {
  precisaoM: number
}

export type ErroDeGps = 'negada' | 'sem_sinal' | 'gps_tempo_esgotado' | 'sem_suporte'

export const ehErroDeGps = (e: string): e is ErroDeGps => ['negada', 'sem_sinal', 'gps_tempo_esgotado', 'sem_suporte'].includes(e)

export function textoDoErroDeGps(erro: ErroDeGps): string {
  switch (erro) {
    case 'negada':
      return 'Sem permissão para usar a localização. Libere a localização deste site nas configurações do navegador, ou digite o horário do Google Maps.'
    case 'sem_sinal':
      return 'Sem sinal de GPS agora. Tente de novo em um lugar mais aberto, ou digite o horário do Google Maps.'
    case 'gps_tempo_esgotado':
      return 'O GPS demorou demais para responder. Tente de novo, ou digite o horário do Google Maps.'
    case 'sem_suporte':
      return 'Este aparelho ou navegador não oferece localização. Digite o horário do Google Maps.'
  }
}

/** Posição utilizável: números finitos, dentro dos limites da Terra. */
export function posicaoValida(p: { lat: number; lng: number; precisaoM: number }): boolean {
  return (
    Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.precisaoM) &&
    Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && p.precisaoM >= 0
  )
}

export interface PreviaPorLocalizacao {
  /** Quando foi calculada (arredondado para baixo, para o minuto). */
  calculadoEm: Instante
  minutosCarro: number
  distanciaKm: number
  /** Quem calculou: o TomTom (com trânsito) ou o OSRM (sem). */
  servico: ServicoDeRota
  /** Raio de incerteza do GPS quando passa do limite ("posição aproximada"); vazio se está bom. */
  precisaoRuimM: number | null
}

export function criarPrevia(
  rota: { minutosCarro: number; distanciaKm: number; servico: ServicoDeRota },
  precisaoM: number,
  agora: Instante,
): PreviaPorLocalizacao {
  return {
    calculadoEm: truncarMinuto(agora),
    minutosCarro: rota.minutosCarro,
    distanciaKm: rota.distanciaKm,
    servico: rota.servico,
    precisaoRuimM: precisaoM > CONFIG.gpsPrecisaoRuimM ? precisaoM : null,
  }
}

/** Minutos até a parada: tempo de carro, ou × fator ônibus (para cima), como nos trechos de rota. */
export function minutosDaPrevia(p: PreviaPorLocalizacao, fator: number, aplicarFator: boolean): number {
  return aplicarFator ? aplicarFatorOnibus(p.minutosCarro, fator) : p.minutosCarro
}

/** Chegada prevista: o momento do cálculo mais o tempo da posição até a parada. */
export function chegadaDaPrevia(p: PreviaPorLocalizacao, fator: number, aplicarFator: boolean): Instante {
  return somarMinutos(p.calculadoEm, minutosDaPrevia(p, fator, aplicarFator))
}

/** Depois de alguns minutos a posição já mudou e o horário pode ter ficado para trás. */
export function previaVencida(p: PreviaPorLocalizacao, agora: Instante): boolean {
  return diferencaMin(agora, p.calculadoEm) >= CONFIG.previaLocalizacaoValidaMin
}

/** "posição aproximada (±1,8 km)" quando o GPS está impreciso; vazio caso contrário. */
export function textoDaPrecisaoDoGps(precisaoM: number | null): string | null {
  if (precisaoM === null) return null
  const km = (Math.round(precisaoM / 100) / 10).toFixed(1).replace('.', ',')
  return `posição aproximada (±${km} km)`
}
