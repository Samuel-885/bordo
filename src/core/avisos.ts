// Avisos do planejamento ("Ciclo de vida da viagem"): problemas que NÃO bloqueiam o
// início da viagem. Os bloqueios continuam sendo os de `calcularPlanoOriginal`.

import { antes, diferencaMin } from './tempo'
import { ordenarEtapas, paresDeTrechoDasAlternativas, saidaRoteiro } from './trechos'
import type { DadosPlano, EstadoEtapa, Passageiro } from './tipos'

export type AvisoPlano =
  | { tipo: 'flexivel_sem_local'; etapaId: string }
  /** Locais candidatos de uma parada flexível sem abre/fecha: a viabilidade fica "sem horário". */
  | { tipo: 'local_sem_horario'; etapaId: string; localIds: string[] }
  | { tipo: 'chegada_fora_da_janela'; etapaId: string }
  /** Alternativas (não preferidas) com algum trecho sem duração: não dá para trocar para elas na viagem. */
  | { tipo: 'alternativa_sem_trecho'; etapaId: string; localIds: string[] }
  | { tipo: 'sem_passageiros' }

/**
 * Inconsistência dos horários do roteiro: uma etapa com chegada anterior à saída da
 * etapa anterior daria um trecho de duração negativa. Não é regra de cálculo: é um
 * erro de digitação que a tela aponta e que impede iniciar.
 */
export interface HorarioForaDeOrdem {
  etapaId: string
  /** A etapa anterior com horário de roteiro, que sai depois. */
  anteriorId: string
}

/** Com `passageiros` informado e vazio, avisa que não há ninguém cadastrado. */
export function avisosDoPlano(dados: DadosPlano, estados: readonly EstadoEtapa[], passageiros?: readonly Passageiro[]): AvisoPlano[] {
  const avisos: AvisoPlano[] = []
  if (passageiros?.length === 0) avisos.push({ tipo: 'sem_passageiros' })
  for (const etapa of ordenarEtapas(dados.etapas)) {
    if (etapa.tipo !== 'flexivel') continue

    if (etapa.localId === null) {
      avisos.push({ tipo: 'flexivel_sem_local', etapaId: etapa.id })
    }

    const candidatos = [...(etapa.localId ? [etapa.localId] : []), ...etapa.alternativas]
    const semHorario = candidatos.filter((id) => {
      const local = dados.locais.find((l) => l.id === id)
      return !local?.abre || !local.fecha
    })
    if (semHorario.length > 0) {
      avisos.push({ tipo: 'local_sem_horario', etapaId: etapa.id, localIds: semHorario })
    }

    const chegada = estados.find((e) => e.etapaId === etapa.id)?.chegada?.instante
    if (chegada && etapa.janelaInicio && etapa.janelaFim) {
      if (antes(chegada, etapa.janelaInicio) || antes(etapa.janelaFim, chegada)) {
        avisos.push({ tipo: 'chegada_fora_da_janela', etapaId: etapa.id })
      }
    }
  }

  const semTrecho = new Map<string, Set<string>>()
  const marcar = (etapaId: string, localId: string) => {
    const e = dados.etapas.find((x) => x.id === etapaId)
    if (!e || localId === e.localId) return
    semTrecho.set(etapaId, (semTrecho.get(etapaId) ?? new Set()).add(localId))
  }
  for (const { par, duracao } of paresDeTrechoDasAlternativas(dados)) {
    if (duracao.minutos !== null) continue
    marcar(par.etapaOrigemId, par.localOrigemId)
    marcar(par.etapaDestinoId, par.localDestinoId)
  }
  for (const etapa of ordenarEtapas(dados.etapas)) {
    const locais = semTrecho.get(etapa.id)
    if (locais) avisos.push({ tipo: 'alternativa_sem_trecho', etapaId: etapa.id, localIds: [...locais] })
  }
  return avisos
}

export function horariosForaDeOrdem(dados: DadosPlano): HorarioForaDeOrdem[] {
  const resultado: HorarioForaDeOrdem[] = []
  let anterior: { id: string; saida: NonNullable<ReturnType<typeof saidaRoteiro>> } | null = null
  for (const etapa of ordenarEtapas(dados.etapas)) {
    if (anterior && etapa.chegadaRoteiro && diferencaMin(etapa.chegadaRoteiro, anterior.saida) < 0) {
      resultado.push({ etapaId: etapa.id, anteriorId: anterior.id })
    }
    const saida = saidaRoteiro(etapa)
    if (saida) anterior = { id: etapa.id, saida }
  }
  return resultado
}
