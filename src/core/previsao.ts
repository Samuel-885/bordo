// Cálculo da previsão ("Regras de cálculo da previsão"). Tudo é recalculado do
// zero a partir do plano e dos eventos; nada aqui é guardado.

import { atrasoMin } from './atraso'
import { emOrdemDeGravacao } from './eventos'
import { antes, diferencaMin, ordenarPor, somarMinutos, truncarMinuto } from './tempo'
import {
  duracaoComPuladas,
  ordenarEtapas,
  saidaRoteiro,
  SEM_TEMPO,
  type PontoDoTrecho,
} from './trechos'
import type {
  DadosPlano,
  DuracaoTrecho,
  Etapa,
  EstadoDaEtapa,
  EstadoEtapa,
  EstadoViagem,
  Evento,
  HorarioPrevisto,
  Instante,
  OrigemHorario,
  PlanoOriginal,
} from './tipos'

// ---------- Fatos registrados ----------

interface Recalibracao {
  horario: Instante
  informadoEm: Instante
  pelaLocalizacaoEm?: Instante
  /** Ordem de gravação (desempata o mesmo minuto). */
  ordem: number
}

interface ParadaNaoPlanejada {
  inicio: Instante
  fim: Instante | null
  /** Só vale com a parada aberta; fechada, vale a duração real. */
  tempoPrevistoMin?: number
}

interface Fatos {
  chegada: Map<string, Instante>
  saida: Map<string, Instante>
  puladas: Set<string>
  troca: Map<string, { localId: string; em: Instante; ordem: number }>
  recalibracao: Map<string, Recalibracao>
  paradas: Map<string, ParadaNaoPlanejada[]>
}

/**
 * Ordem de gravação de um evento: a sequência, quando existe; senão a posição na lista (um
 * evento acrescentado no fim, como o simulado da avaliação das alternativas, vale por último).
 */
const ordemDeGravacao = (e: Evento, posicao: number): number => e.sequencia ?? 1e9 + posicao

function indexarEventos(eventos: readonly Evento[]): Fatos {
  const posicao = new Map(eventos.map((e, i) => [e, i]))
  const fatos: Fatos = {
    chegada: new Map(),
    saida: new Map(),
    puladas: new Set(),
    troca: new Map(),
    recalibracao: new Map(),
    paradas: new Map(),
  }
  // Mesmo horário do fato: vale a ordem de gravação (ordenarPor é estável).
  for (const e of ordenarPor(emOrdemDeGravacao(eventos), (x) => x.horarioFato)) {
    switch (e.tipo) {
      case 'chegada':
        fatos.chegada.set(e.etapaId, e.horarioFato)
        break
      case 'saida':
        fatos.saida.set(e.etapaId, e.horarioFato)
        break
      case 'pular_etapa':
        fatos.puladas.add(e.etapaId)
        break
      case 'troca_local':
        fatos.troca.set(e.etapaId, { localId: e.dados.localId, em: e.horarioFato, ordem: ordemDeGravacao(e, posicao.get(e)!) })
        break
      case 'recalibracao':
        // Uma nova recalibração no mesmo trecho substitui a anterior.
        fatos.recalibracao.set(e.etapaId, {
          horario: e.dados.horario,
          informadoEm: e.horarioFato,
          ...(e.dados.origem === 'localizacao' && e.dados.calculadoEm ? { pelaLocalizacaoEm: e.dados.calculadoEm } : {}),
          ordem: ordemDeGravacao(e, posicao.get(e)!),
        })
        break
      case 'parada_nao_planejada': {
        const lista = fatos.paradas.get(e.etapaId) ?? []
        const aberta = lista.find((p) => p.fim === null)
        if (e.dados.fase === 'inicio' && !aberta) {
          lista.push({
            inicio: e.horarioFato,
            fim: null,
            ...(e.dados.tempoPrevistoMin !== undefined ? { tempoPrevistoMin: e.dados.tempoPrevistoMin } : {}),
          })
        }
        if (e.dados.fase === 'previsao' && aberta) {
          // O evento leva o estado completo: o que vem ausente fica sem valor.
          if (e.dados.tempoPrevistoMin !== undefined) aberta.tempoPrevistoMin = e.dados.tempoPrevistoMin
          else delete aberta.tempoPrevistoMin
        }
        if (e.dados.fase === 'fim' && aberta) aberta.fim = e.horarioFato
        fatos.paradas.set(e.etapaId, lista)
        break
      }
      default:
        break
    }
  }
  return fatos
}

const SEM_FATOS = indexarEventos([])

function localAtual(fatos: Fatos, etapa: Etapa): string | null {
  return fatos.troca.get(etapa.id)?.localId ?? etapa.localId
}

/**
 * A recalibração vale até a chegada real. Se o local da etapa foi trocado depois
 * dela, ela se referia a outro lugar e deixa de valer.
 */
function recalibracaoAtiva(fatos: Fatos, etapa: Etapa): Recalibracao | null {
  const r = fatos.recalibracao.get(etapa.id)
  if (!r || fatos.chegada.has(etapa.id)) return null
  const troca = fatos.troca.get(etapa.id)
  // A troca cancela a recalibração feita antes dela; no mesmo minuto, vale a ordem de gravação.
  if (troca && (antes(r.informadoEm, troca.em) || (!antes(troca.em, r.informadoEm) && troca.ordem > r.ordem))) return null
  return r
}

/**
 * Minutos parados no trecho que chega na etapa. Parada fechada: a duração real. Parada aberta:
 * até agora, e com tempo previsto T, o maior entre T e o decorrido (volta prevista = o maior
 * entre início + T e agora).
 */
function tempoParadoMin(
  fatos: Fatos,
  etapaId: string,
  agora: Instante | null,
  aPartirDe: Instante | null,
): number {
  let total = 0
  for (const p of fatos.paradas.get(etapaId) ?? []) {
    if (aPartirDe && antes(p.inicio, aPartirDe)) continue
    const fim = p.fim ?? agora
    if (!fim) continue
    const decorrido = Math.max(0, diferencaMin(fim, p.inicio))
    total += p.fim === null && p.tempoPrevistoMin !== undefined ? Math.max(p.tempoPrevistoMin, decorrido) : decorrido
  }
  return total
}

// ---------- Percurso da primeira à última etapa ----------

export type Momento = 'chegada' | 'saida'
const chave = (etapa: Etapa, m: Momento) => `${etapa.id}:${m}`

interface MomentoDoPercurso {
  etapaId: string
  momento: Momento
  chave: string
  registrado: boolean
}

/** Chegadas e saídas das etapas ativas, em ordem (a origem só tem saída e o destino só chegada). */
function momentosDoPercurso(ativas: readonly Etapa[], fatos: Fatos): MomentoDoPercurso[] {
  const momentos: MomentoDoPercurso[] = []
  for (const e of ativas) {
    if (e.tipo !== 'origem') {
      momentos.push({ etapaId: e.id, momento: 'chegada', chave: chave(e, 'chegada'), registrado: fatos.chegada.has(e.id) })
    }
    if (e.tipo !== 'destino') {
      momentos.push({ etapaId: e.id, momento: 'saida', chave: chave(e, 'saida'), registrado: fatos.saida.has(e.id) })
    }
  }
  return momentos
}

/**
 * A regra do relógio vale para o próximo evento ainda não registrado: o primeiro
 * sem registro depois do último registrado. Os seguintes partem dele.
 */
function chaveDaRegraDoRelogio(ativas: readonly Etapa[], fatos: Fatos): string | null {
  const momentos = momentosDoPercurso(ativas, fatos)
  const ultimo = momentos.findLastIndex((m) => m.registrado)
  return momentos.find((m, i) => i > ultimo && !m.registrado)?.chave ?? null
}

interface Percurso {
  d: DadosPlano
  fatos: Fatos
  original: PlanoOriginal | null
  /** Vazio no cálculo do plano original: sem regra do relógio. */
  agora: Instante | null
  saidaPlanejadaOrigem: Instante | null
}

function percorrer(p: Percurso): EstadoEtapa[] {
  const { d, fatos, original, agora } = p
  const etapas = ordenarEtapas(d.etapas)
  const ativas = etapas.filter((e) => !fatos.puladas.has(e.id))
  const chaveRelogio = agora ? chaveDaRegraDoRelogio(ativas, fatos) : null

  const horario = (
    etapa: Etapa,
    m: Momento,
    valor: Instante | null,
    origem: OrigemHorario,
    recalibradoEm?: Instante,
    pelaLocalizacaoEm?: Instante,
  ): HorarioPrevisto | null => {
    if (valor === null) return null
    if (agora && chave(etapa, m) === chaveRelogio && antes(valor, agora)) {
      valor = agora
      origem = 'relogio'
      recalibradoEm = undefined
      pelaLocalizacaoEm = undefined
    }
    const orig = original?.etapas.find((o) => o.etapaId === etapa.id)?.[m] ?? null
    return {
      instante: valor,
      origem,
      ...(recalibradoEm ? { recalibradoEm } : {}),
      ...(pelaLocalizacaoEm ? { pelaLocalizacaoEm } : {}),
      atrasoMin: orig ? atrasoMin(valor, orig) : null,
    }
  }

  const resultado: EstadoEtapa[] = []
  let anterior: { ponto: PontoDoTrecho; saida: Instante | null } | null = null
  let puladasEntre: PontoDoTrecho[] = []

  for (const etapa of etapas) {
    const localId = localAtual(fatos, etapa)

    if (fatos.puladas.has(etapa.id)) {
      resultado.push({ etapaId: etapa.id, localId, estado: 'pulada', trechoChegada: null, chegada: null, saida: null })
      puladasEntre.push({ etapa, localId })
      continue
    }

    // Chegada: real → recalibração → saída anterior + trecho + paradas não planejadas.
    let trechoChegada: DuracaoTrecho | null = null
    let chegada: HorarioPrevisto | null = null
    if (etapa.tipo !== 'origem') {
      trechoChegada = anterior
        ? duracaoComPuladas(d, anterior.ponto, puladasEntre, { etapa, localId })
        : SEM_TEMPO
      const real = fatos.chegada.get(etapa.id)
      if (real) {
        chegada = horario(etapa, 'chegada', real, 'real')
      } else {
        const recal = recalibracaoAtiva(fatos, etapa)
        const saidaAnterior = anterior?.saida ?? null
        let valor: Instante | null = null
        if (recal) {
          const saidaRealAnterior = anterior ? fatos.saida.get(anterior.ponto.etapa.id) : undefined
          const feitaEmTransito = saidaRealAnterior !== undefined && !antes(recal.informadoEm, saidaRealAnterior)
          if (feitaEmTransito) {
            valor = recal.horario
          } else if (saidaAnterior) {
            // Feita parado na etapa anterior (ou aguardando a saída da origem):
            // vira duração do trecho, a partir da saída real ou prevista.
            valor = somarMinutos(saidaAnterior, diferencaMin(recal.horario, recal.informadoEm))
          }
        } else if (saidaAnterior && trechoChegada.minutos !== null) {
          valor = somarMinutos(saidaAnterior, trechoChegada.minutos)
        }
        if (valor) {
          valor = somarMinutos(valor, tempoParadoMin(fatos, etapa.id, agora, recal?.informadoEm ?? null))
        }
        chegada = recal
          ? horario(etapa, 'chegada', valor, 'recalibracao', recal.informadoEm, recal.pelaLocalizacaoEm)
          : horario(etapa, 'chegada', valor, 'calculado')
      }
    }

    // Saída: real → chegada prevista + permanência (na origem, a saída planejada).
    let saida: HorarioPrevisto | null = null
    if (etapa.tipo !== 'destino') {
      const real = fatos.saida.get(etapa.id)
      if (real) {
        saida = horario(etapa, 'saida', real, 'real')
      } else {
        const valor =
          etapa.tipo === 'origem'
            ? p.saidaPlanejadaOrigem
            : chegada
              ? somarMinutos(chegada.instante, etapa.permanenciaMin)
              : null
        saida = horario(etapa, 'saida', valor, 'calculado')
      }
    }

    resultado.push({ etapaId: etapa.id, localId, estado: estadoDaEtapa(etapa, fatos), trechoChegada, chegada, saida })
    anterior = { ponto: { etapa, localId }, saida: saida?.instante ?? null }
    puladasEntre = []
  }

  return resultado
}

function estadoDaEtapa(etapa: Etapa, fatos: Fatos): EstadoDaEtapa {
  if (fatos.puladas.has(etapa.id)) return 'pulada'
  if (etapa.tipo === 'destino') return fatos.chegada.has(etapa.id) ? 'concluida' : 'pendente'
  if (fatos.saida.has(etapa.id)) return 'concluida'
  if (etapa.tipo !== 'origem' && fatos.chegada.has(etapa.id)) return 'em_parada'
  return 'pendente'
}

// ---------- Plano original ----------

export type BloqueioInicio =
  | { tipo: 'falta_origem' }
  | { tipo: 'falta_destino' }
  | { tipo: 'origem_sem_horario'; etapaId: string }
  | { tipo: 'trecho_sem_tempo'; etapaDestinoId: string }

/**
 * As mesmas regras, sem eventos e sem a regra do relógio. Só dá certo se toda
 * etapa tiver horário calculável: senão, a viagem não pode ser iniciada.
 */
export function calcularPlanoOriginal(
  d: DadosPlano,
  agoraDoRelogio: Instante,
): { ok: true; plano: PlanoOriginal } | { ok: false; bloqueios: BloqueioInicio[] } {
  const agora = truncarMinuto(agoraDoRelogio)
  const etapas = ordenarEtapas(d.etapas)
  const origem = etapas.find((e) => e.tipo === 'origem')
  const bloqueios: BloqueioInicio[] = []
  if (!origem) bloqueios.push({ tipo: 'falta_origem' })
  if (!etapas.some((e) => e.tipo === 'destino')) bloqueios.push({ tipo: 'falta_destino' })
  const saidaOrigem = origem ? saidaRoteiro(origem) : null
  if (origem && !saidaOrigem) bloqueios.push({ tipo: 'origem_sem_horario', etapaId: origem.id })

  const estados = percorrer({ d, fatos: SEM_FATOS, original: null, agora: null, saidaPlanejadaOrigem: saidaOrigem })
  for (const e of estados) {
    if (e.trechoChegada && e.trechoChegada.minutos === null) {
      bloqueios.push({ tipo: 'trecho_sem_tempo', etapaDestinoId: e.etapaId })
    }
  }
  if (bloqueios.length > 0) return { ok: false, bloqueios }

  return {
    ok: true,
    plano: {
      congeladoEm: agora,
      etapas: estados.map((e) => ({
        etapaId: e.etapaId,
        localId: e.localId,
        chegada: e.chegada?.instante ?? null,
        saida: e.saida?.instante ?? null,
      })),
    },
  }
}

/**
 * Horários e trechos do planejamento, como em `calcularPlanoOriginal`, mas também
 * quando há bloqueios: o que não tem como ser calculado fica vazio. Serve para a
 * tela de planejamento mostrar o que existe e o que falta.
 */
export function estadosDoPlano(d: DadosPlano): EstadoEtapa[] {
  const origem = ordenarEtapas(d.etapas).find((e) => e.tipo === 'origem')
  const saidaOrigem = origem ? saidaRoteiro(origem) : null
  return percorrer({ d, fatos: SEM_FATOS, original: null, agora: null, saidaPlanejadaOrigem: saidaOrigem })
}

// ---------- Estado da viagem ----------

export function calcularEstado(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
): EstadoViagem {
  const agora = truncarMinuto(agoraDoRelogio)
  const fatos = indexarEventos(eventos)
  const origem = d.etapas.find((e) => e.tipo === 'origem')
  const saidaPlanejadaOrigem = original.etapas.find((o) => o.etapaId === origem?.id)?.saida ?? null

  const etapas = percorrer({ d, fatos, original, agora, saidaPlanejadaOrigem })

  const tipoDe = new Map(d.etapas.map((e) => [e.id, e.tipo]))
  const primeiraEmAberto = etapas.find((e) => e.estado === 'pendente' || e.estado === 'em_parada')
  const emTransito = primeiraEmAberto?.estado === 'pendente' && tipoDe.get(primeiraEmAberto.etapaId) !== 'origem'
  const destino = etapas.find((e) => tipoDe.get(e.etapaId) === 'destino')

  return {
    etapas,
    emTransito,
    proximaEtapaId: etapas.find((e) => e.estado === 'pendente')?.etapaId ?? null,
    chegadaDestino: destino?.chegada ?? null,
    atrasoDestinoMin: destino?.chegada?.atrasoMin ?? null,
  }
}

// ---------- Pendências de registro ----------

export interface PendenciaDeRegistro {
  etapaId: string
  momento: Momento
}

/**
 * Chegadas e saídas esquecidas: sem registro, mas com um registro posterior no
 * percurso. Por exemplo, chegada registrada sem a saída da etapa anterior (ou da
 * origem). A regra do relógio não as empurra; a tela pede o horário.
 */
export function pendenciasDeRegistro(d: DadosPlano, eventos: readonly Evento[]): PendenciaDeRegistro[] {
  const fatos = indexarEventos(eventos)
  const ativas = ordenarEtapas(d.etapas).filter((e) => !fatos.puladas.has(e.id))
  const momentos = momentosDoPercurso(ativas, fatos)
  const ultimo = momentos.findLastIndex((m) => m.registrado)
  return momentos
    .filter((m, i) => i < ultimo && !m.registrado)
    .map(({ etapaId, momento }) => ({ etapaId, momento }))
}

// ---------- Pular etapa ----------

/** Só etapa flexível ainda não alcançada pode ser pulada. */
export function validarPulo(
  d: DadosPlano,
  estado: EstadoViagem,
  etapaId: string,
): { ok: true } | { ok: false; motivo: string } {
  const etapa = d.etapas.find((e) => e.id === etapaId)
  if (!etapa) return { ok: false, motivo: 'Etapa não encontrada.' }
  if (etapa.tipo !== 'flexivel') return { ok: false, motivo: 'Só paradas flexíveis podem ser puladas.' }
  const atual = estado.etapas.find((e) => e.etapaId === etapaId)
  if (atual?.estado !== 'pendente') return { ok: false, motivo: 'Esta etapa já foi alcançada ou pulada.' }
  return { ok: true }
}
