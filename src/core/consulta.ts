// Consulta ao Google Maps (ver `Consulta` em tipos.ts): vigência e horário de chegada efetivo.
// A consulta usa o mesmo mecanismo da recalibração, só que simulado; as regras de cálculo
// são as de sempre (previsao.ts).

import { CONFIG } from './config'
import { modoDaRecalibracao, validarRecalibracao } from './recalibracao'
import { antes, diferencaMin, somarMinutos, truncarMinuto } from './tempo'
import type { Consulta, DadosPlano, Evento, Instante, PlanoOriginal } from './tipos'
import { calcularEstado } from './previsao'

/** Eventos que mudam a situação: uma consulta feita antes deles já não vale. */
const MUDAM_A_SITUACAO = new Set<Evento['tipo']>(['saida', 'chegada', 'troca_local', 'pular_etapa', 'local_incluido', 'parada_incluida', 'inclusao_cancelada'])

/** Maior sequência de saída, chegada, troca de local e pulo (0 se não houver). */
export function baseDaSituacao(eventos: readonly Evento[]): number {
  return eventos.reduce((m, e) => (MUDAM_A_SITUACAO.has(e.tipo) ? Math.max(m, e.sequencia ?? 0) : m), 0)
}

/**
 * Chegada que a consulta vale agora. Em trânsito, o horário é absoluto. Feita parado, informa
 * a duração até o local: a chegada é o horário consultado + o tempo passado desde a consulta
 * (consultado às 08:30 com chegada 12:00, aplicado às 08:38 → 12:08).
 */
export function chegadaDaConsulta(c: Consulta, agoraDoRelogio: Instante): Instante {
  if (!c.parado) return c.horario
  return somarMinutos(c.horario, Math.max(0, diferencaMin(truncarMinuto(agoraDoRelogio), c.consultadoEm)))
}

export type SituacaoDaConsulta = 'vigente' | 'antiga' | 'descartada'

export interface VigenciaDaConsulta {
  situacao: SituacaoDaConsulta
  idadeMin: number
}

/**
 * Descartada: depois da consulta houve saída, chegada, troca de local ou pulo. Antiga: passaram
 * mais de `consultaValidaMin` minutos ou (em trânsito) o horário consultado já passou.
 */
export function vigenciaDaConsulta(c: Consulta, eventos: readonly Evento[], agoraDoRelogio: Instante): VigenciaDaConsulta {
  const agora = truncarMinuto(agoraDoRelogio)
  const idadeMin = Math.max(0, diferencaMin(agora, c.consultadoEm))
  if (baseDaSituacao(eventos) > c.base) return { situacao: 'descartada', idadeMin }
  const passou = !c.parado && antes(c.horario, agora)
  return { situacao: idadeMin > CONFIG.consultaValidaMin || passou ? 'antiga' : 'vigente', idadeMin }
}

export type ResultadoConsulta =
  | { ok: true; parado: boolean; base: number }
  | { ok: false; motivo: string }

/**
 * Só a próxima parada flexível, com um dos locais candidatos, e quando dá para recalibrar
 * (em trânsito para ela ou parado na etapa anterior). O horário passa pela trava da recalibração.
 */
export function validarConsulta(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
  etapaId: string,
  localId: string,
  horario: Instante,
): ResultadoConsulta {
  if (d.viagem.status !== 'em_andamento') return { ok: false, motivo: 'A viagem não está em andamento.' }
  const agora = truncarMinuto(agoraDoRelogio)
  const etapa = d.etapas.find((e) => e.id === etapaId)
  if (!etapa || etapa.tipo !== 'flexivel') return { ok: false, motivo: 'Só paradas flexíveis têm alternativas.' }
  if (calcularEstado(d, original, eventos, agora).proximaEtapaId !== etapaId) {
    return { ok: false, motivo: 'A consulta só vale para a próxima parada.' }
  }
  if (localId !== etapa.localId && !etapa.alternativas.includes(localId)) {
    return { ok: false, motivo: 'Este local não é uma das alternativas desta parada.' }
  }
  const modo = modoDaRecalibracao(d, original, eventos, etapaId, agora)
  if (modo === null) {
    return { ok: false, motivo: 'A consulta só vale em trânsito para a parada ou parado na etapa anterior.' }
  }
  const horarioOk = validarRecalibracao(d, original, eventos, etapaId, horario, agora)
  if (!horarioOk.ok) return horarioOk
  return { ok: true, parado: modo === 'parado', base: baseDaSituacao(eventos) }
}
