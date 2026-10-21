// Alternativas e viabilidade: cada alternativa de uma parada flexível ainda não
// alcançada é calculada como se fosse a escolhida e classificada pelo funcionamento.

import { CONFIG } from './config'
import { calcularEstado } from './previsao'
import { antes, diferencaMin, minutosDoDia, naHoraDoDia, somarMinutos, truncarMinuto } from './tempo'
import type { DadosPlano, Etapa, Evento, Instante, Local, PlanoOriginal } from './tipos'

export type ClasseAlternativa = 'viavel' | 'pouca_margem' | 'sem_horario' | 'inviavel' | 'sem_tempo'

/** Avisos aparecem junto da classe, sem mudá-la. ("Mal avaliado" fica para a fase 10.) */
export type AvisoAlternativa =
  | 'fora_da_janela'
  | 'onibus_nao_para'
  | 'onibus_para_nao_sei'
  | 'evitar'
  | 'favorito'

export interface AvaliacaoAlternativa {
  localId: string
  escolhida: boolean
  classe: ClasseAlternativa
  chegada: Instante | null
  fimParada: Instante | null
  /** Fechamento − fim da parada. */
  margemMin: number | null
  /** Chegada no destino com esta alternativa − com a escolha atual. */
  impactoDestinoMin: number | null
  avisos: AvisoAlternativa[]
}

const ORDEM_CLASSES: ClasseAlternativa[] = ['viavel', 'pouca_margem', 'sem_horario', 'inviavel', 'sem_tempo']

/**
 * Fechamento do período de funcionamento em que a chegada cai, ou vazio se chega
 * com o local fechado. Fecha antes de abrir = fecha no dia seguinte; por isso o
 * período que começou na véspera também é considerado.
 */
function fechamentoSeAberto(local: Local & { abre: string; fecha: string }, chegada: Instante): Instante | null {
  const viraODia = minutosDoDia(local.fecha) < minutosDoDia(local.abre) ? 1 : 0
  for (const dia of [-1, 0]) {
    const abre = naHoraDoDia(chegada, local.abre, dia)
    const fecha = naHoraDoDia(chegada, local.fecha, dia + viraODia)
    if (!antes(chegada, abre) && antes(chegada, fecha)) return fecha
  }
  return null
}

export function classificar(
  local: Local,
  chegada: Instante | null,
  permanenciaMin: number,
  margemMinima: number = CONFIG.margemViavelMin,
): { classe: ClasseAlternativa; fimParada: Instante | null; margemMin: number | null } {
  if (chegada === null) return { classe: 'sem_tempo', fimParada: null, margemMin: null }
  const fimParada = somarMinutos(chegada, permanenciaMin)
  const { abre, fecha } = local
  if (!abre || !fecha) return { classe: 'sem_horario', fimParada, margemMin: null }

  const fechamento = fechamentoSeAberto({ ...local, abre, fecha }, chegada)
  if (fechamento === null) return { classe: 'inviavel', fimParada, margemMin: null }
  const margemMin = diferencaMin(fechamento, fimParada)
  return { classe: margemMin < margemMinima ? 'pouca_margem' : 'viavel', fimParada, margemMin }
}

function avisos(etapa: Etapa, local: Local, chegada: Instante | null): AvisoAlternativa[] {
  const lista: AvisoAlternativa[] = []
  if (
    chegada &&
    ((etapa.janelaInicio && antes(chegada, etapa.janelaInicio)) ||
      (etapa.janelaFim && antes(etapa.janelaFim, chegada)))
  ) {
    lista.push('fora_da_janela')
  }
  if (local.onibusPara === 'nao') lista.push('onibus_nao_para')
  if (local.onibusPara === 'nao_sei') lista.push('onibus_para_nao_sei')
  if (local.marcacao === 'evitar') lista.push('evitar')
  if (local.marcacao === 'favorito') lista.push('favorito')
  return lista
}

/**
 * Avalia o local preferido e as alternativas de uma parada flexível ainda não
 * alcançada, já na ordem da lista: viáveis, pouca margem, sem horário, inviáveis
 * e sem tempo; dentro de cada grupo, pela chegada mais cedo.
 */
export function avaliarAlternativas(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
  etapaId: string,
): AvaliacaoAlternativa[] {
  const agora = truncarMinuto(agoraDoRelogio)
  const etapa = d.etapas.find((e) => e.id === etapaId)
  if (!etapa || etapa.tipo !== 'flexivel') return []
  const atual = calcularEstado(d, original, eventos, agora)
  const estadoEtapa = atual.etapas.find((e) => e.etapaId === etapaId)
  if (estadoEtapa?.estado !== 'pendente') return []

  const candidatos = [...new Set([etapa.localId, ...etapa.alternativas])].filter((id) => id !== null)
  const avaliacoes: AvaliacaoAlternativa[] = []
  for (const localId of candidatos) {
    const local = d.locais.find((l) => l.id === localId)
    if (!local) continue
    const escolhida = localId === estadoEtapa.localId
    const simulado = escolhida
      ? atual
      : calcularEstado(d, original, [...eventos, trocaSimulada(d, etapaId, localId, agora)], agora)
    const chegada = simulado.etapas.find((e) => e.etapaId === etapaId)?.chegada?.instante ?? null
    const destinoCom = simulado.chegadaDestino?.instante
    const destinoAtual = atual.chegadaDestino?.instante
    avaliacoes.push({
      localId,
      escolhida,
      ...classificar(local, chegada, etapa.permanenciaMin),
      chegada,
      impactoDestinoMin: destinoCom && destinoAtual ? diferencaMin(destinoCom, destinoAtual) : null,
      avisos: avisos(etapa, local, chegada),
    })
  }

  return avaliacoes.sort((a, b) => {
    const porClasse = ORDEM_CLASSES.indexOf(a.classe) - ORDEM_CLASSES.indexOf(b.classe)
    if (porClasse !== 0 || !a.chegada || !b.chegada) return porClasse
    return diferencaMin(a.chegada, b.chegada)
  })
}

function trocaSimulada(d: DadosPlano, etapaId: string, localId: string, agora: Instante): Evento {
  return {
    id: 'simulacao',
    viagemId: d.viagem.id,
    tipo: 'troca_local',
    etapaId,
    dados: { localId },
    horarioFato: agora,
    registradoEm: agora,
  }
}
