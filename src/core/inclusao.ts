// Mudança de roteiro em viagem: local novo numa parada flexível e parada incluída. O plano
// gravado não muda; `aplicarInclusoes` devolve o plano efetivo (etapas, candidatos e trechos
// vindos dos eventos). Funções puras, sem efeito na regra de cálculo da previsão.

import { emOrdemDeGravacao } from './eventos'
import { calcularEstado } from './previsao'
import { validarRecalibracao } from './recalibracao'
import { paradaAberta } from './registro'
import { truncarMinuto } from './tempo'
import { ordenarEtapas } from './trechos'
import { textoDoTrechoFaltante, trechoAindaNaoPercorrido, trechosFaltantes } from './viabilidade'
import type { DadosPlano, Etapa, EstadoViagem, Evento, Instante, PlanoOriginal, Trecho } from './tipos'

export type Resultado = { ok: true } | { ok: false; motivo: string }

export const CATEGORIAS_DA_INCLUSAO = ['visita', 'refeicao', 'cafe', 'banheiro', 'abastecimento', 'outro'] as const
export const MAX_MOTIVO_INCLUSAO = 60
export const MIN_PERMANENCIA_INCLUSAO_MIN = 1
export const MAX_PERMANENCIA_INCLUSAO_MIN = 600

type ParadaIncluida = Extract<Evento, { tipo: 'parada_incluida' }>
type LocalIncluido = Extract<Evento, { tipo: 'local_incluido' }>

const chaveDoTrecho = (t: Pick<Trecho, 'etapaOrigemId' | 'localOrigemId' | 'etapaDestinoId' | 'localDestinoId'>) =>
  `${t.etapaOrigemId}|${t.localOrigemId}|${t.etapaDestinoId}|${t.localDestinoId}`

/** As paradas incluídas que não foram canceladas, na ordem de gravação. */
export function inclusoesAtivas(eventos: readonly Evento[]): ParadaIncluida[] {
  const canceladas = new Set(eventos.flatMap((e) => (e.tipo === 'inclusao_cancelada' ? [e.dados.eventoId] : [])))
  return emOrdemDeGravacao(eventos).filter((e): e is ParadaIncluida => e.tipo === 'parada_incluida' && !canceladas.has(e.id))
}

/** A parada incluída que deu origem à etapa, se ela foi incluída em viagem e não cancelada. */
export function inclusaoDaEtapa(eventos: readonly Evento[], etapaId: string): ParadaIncluida | null {
  return inclusoesAtivas(eventos).find((e) => e.etapaId === etapaId) ?? null
}

/**
 * O plano efetivo: o gravado mais o que os eventos de inclusão acrescentam. A parada incluída
 * entra depois de `apos` como etapa flexível; o local novo entra em `alternativas`; os trechos
 * dos eventos se somam. Inclusão cancelada é ignorada (e, com ela, o que dependia da etapa).
 * Idempotente: o que já está no plano não é acrescentado de novo.
 */
export function aplicarInclusoes(d: DadosPlano, eventos: readonly Evento[]): DadosPlano {
  const canceladas = new Set(eventos.flatMap((e) => (e.tipo === 'inclusao_cancelada' ? [e.dados.eventoId] : [])))
  const relevantes = emOrdemDeGravacao(eventos).filter(
    (e): e is ParadaIncluida | LocalIncluido =>
      (e.tipo === 'parada_incluida' && !canceladas.has(e.id)) || e.tipo === 'local_incluido',
  )
  if (relevantes.length === 0) return d

  let etapas = ordenarEtapas(d.etapas)
  const trechos = [...d.trechos]
  const vistos = new Set(trechos.map(chaveDoTrecho))
  const somarTrechos = (novos: readonly Trecho[]) => {
    for (const t of novos) {
      if (vistos.has(chaveDoTrecho(t))) continue
      vistos.add(chaveDoTrecho(t))
      trechos.push(t)
    }
  }

  for (const e of relevantes) {
    if (e.tipo === 'local_incluido') {
      const etapa = etapas.find((x) => x.id === e.etapaId)
      if (!etapa) continue
      if (etapa.localId !== e.dados.localId && !etapa.alternativas.includes(e.dados.localId)) {
        etapas = etapas.map((x) => (x.id === etapa.id ? { ...x, alternativas: [...x.alternativas, e.dados.localId] } : x))
      }
      somarTrechos(e.dados.trechos)
      continue
    }
    if (etapas.some((x) => x.id === e.etapaId)) {
      somarTrechos(e.dados.trechos)
      continue
    }
    const i = etapas.findIndex((x) => x.id === e.dados.apos)
    if (i < 0) continue
    const nova: Etapa = {
      id: e.etapaId,
      viagemId: d.viagem.id,
      ordem: 0,
      tipo: 'flexivel',
      localId: e.dados.localId,
      alternativas: [],
      categoria: e.dados.categoria,
      permanenciaMin: e.dados.permanenciaMin,
      ...(e.dados.motivo ? { motivo: e.dados.motivo } : {}),
    }
    etapas = [...etapas.slice(0, i + 1), nova, ...etapas.slice(i + 1)]
    somarTrechos(e.dados.trechos)
  }
  return { ...d, etapas: etapas.map((x, i) => ({ ...x, ordem: i + 1 })), trechos }
}

// ---------- Validação ----------

export interface DadosDaInclusao {
  apos: string
  localId: string
  motivo?: string
  categoria: string
  permanenciaMin: number
  trechos: Trecho[]
}

function simulada<T extends Omit<Evento, 'id' | 'viagemId' | 'horarioFato' | 'registradoEm'>>(d: DadosPlano, agora: Instante, id: string, conteudo: T): Evento {
  return { ...conteudo, id, viagemId: d.viagem.id, horarioFato: agora, registradoEm: agora } as Evento
}

/** Trechos informados no evento: ligam etapas vizinhas, locais candidatos, ainda não percorridos, com tempo válido. */
function validarTrechosDoEvento(
  d2: DadosPlano,
  estado: EstadoViagem,
  trechos: readonly Trecho[],
  tocaEtapaNova: (t: Trecho) => boolean,
): Resultado {
  const ordenadas = ordenarEtapas(d2.etapas)
  const candidato = (e: Etapa | undefined, id: string) => !!e && (e.localId === id || e.alternativas.includes(id))
  for (const t of trechos) {
    const i = ordenadas.findIndex((e) => e.id === t.etapaOrigemId)
    const a = ordenadas[i]
    const b = ordenadas[i + 1]
    if (!a || !b || b.id !== t.etapaDestinoId || !tocaEtapaNova(t)) {
      return { ok: false, motivo: 'O trecho informado não liga a parada nova à etapa vizinha.' }
    }
    if (!candidato(a, t.localOrigemId) || !candidato(b, t.localDestinoId)) {
      return { ok: false, motivo: 'Os locais do trecho precisam ser candidatos das etapas.' }
    }
    if (t.fonte !== 'rota' && t.fonte !== 'manual') return { ok: false, motivo: 'Fonte de trecho inválida.' }
    if (t.duracaoMin === null || !Number.isInteger(t.duracaoMin) || t.duracaoMin <= 0) {
      return { ok: false, motivo: 'A duração do trecho precisa ser de pelo menos 1 minuto.' }
    }
    if (t.fonte === 'rota' && (t.distanciaKm === undefined || !t.calculadoEm)) {
      return { ok: false, motivo: 'Trecho de rota sem distância ou data do cálculo.' }
    }
    if (!trechoAindaNaoPercorrido(estado, t)) {
      return {
        ok: false,
        motivo: 'O trecho em curso não aceita duração: informe a chegada pelo Google Maps.',
      }
    }
  }
  return { ok: true }
}

function textoFaltantes(d: DadosPlano, faltam: ReturnType<typeof trechosFaltantes>): string {
  return `Falta o tempo de ${faltam.map((t) => textoDoTrechoFaltante(d, t)).join('; ')}.`
}

/** Tempos que faltam depois da mudança, com a chegada pelo Maps (se vier) cobrindo o trecho até o local. */
function conferirTempos(
  d2: DadosPlano,
  original: PlanoOriginal,
  eventosComMudanca: readonly Evento[],
  estado2: EstadoViagem,
  etapaId: string,
  agora: Instante,
  chegadaPeloMaps: Instante | undefined,
): Resultado {
  const faltam = trechosFaltantes(d2, estado2, etapaId)
  const doLocal = faltam.filter((t) => t.perna === 'do_local')
  if (doLocal.length > 0) return { ok: false, motivo: textoFaltantes(d2, doLocal) }
  const ate = faltam.filter((t) => t.perna === 'ate_o_local')
  if (chegadaPeloMaps) return validarRecalibracao(d2, original, eventosComMudanca, etapaId, chegadaPeloMaps, agora)
  if (ate.length > 0) {
    return ate.every((t) => !t.podeInformar)
      ? { ok: false, motivo: 'Em trânsito, a parada nova só vale com a chegada pelo Google Maps.' }
      : { ok: false, motivo: textoFaltantes(d2, ate) }
  }
  return { ok: true }
}

/**
 * As etapas depois das quais uma parada nova pode entrar: a etapa em que estamos, a última deixada
 * (em trânsito) e as pendentes adiante, nunca o destino. Vazio se a viagem não está em andamento.
 */
export function posicoesParaIncluir(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
): string[] {
  if (d.viagem.status !== 'em_andamento') return []
  const atual = calcularEstado(d, original, eventos, truncarMinuto(agoraDoRelogio))
  if (atual.chegadaDestino?.origem === 'real') return []
  const ordenadas = ordenarEtapas(d.etapas)
  const estadoDe = (id: string) => atual.etapas.find((e) => e.etapaId === id)?.estado
  return ordenadas
    .filter((apos, i) => {
      if (apos.tipo === 'destino') return false
      const est = estadoDe(apos.id)
      if (est === 'pendente' || est === 'em_parada') return true
      const seguinte = ordenadas.slice(i + 1).find((e) => estadoDe(e.id) !== 'pulada')
      return est === 'concluida' && !!seguinte && estadoDe(seguinte.id) === 'pendente'
    })
    .map((e) => e.id)
}

/**
 * Incluir uma parada nova (flexível) depois de `dados.apos`: entre a posição atual e o destino,
 * com a viagem em andamento. O trecho dela até a etapa seguinte é obrigatório. O trecho até ela
 * precisa de tempo, ou de `chegadaPeloMaps` (obrigatória quando o trecho está em curso).
 */
export function validarInclusao(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
  etapaId: string,
  dados: DadosDaInclusao,
  chegadaPeloMaps?: Instante,
): Resultado {
  const agora = truncarMinuto(agoraDoRelogio)
  if (d.viagem.status !== 'em_andamento') return { ok: false, motivo: 'A viagem não está em andamento.' }
  if (d.etapas.some((e) => e.id === etapaId)) return { ok: false, motivo: 'Esta parada já existe.' }
  if (!d.locais.some((l) => l.id === dados.localId)) return { ok: false, motivo: 'Local não encontrado.' }
  if (!(CATEGORIAS_DA_INCLUSAO as readonly string[]).includes(dados.categoria)) return { ok: false, motivo: 'Escolha a categoria da parada.' }
  const p = dados.permanenciaMin
  if (!Number.isInteger(p) || p < MIN_PERMANENCIA_INCLUSAO_MIN || p > MAX_PERMANENCIA_INCLUSAO_MIN) {
    return { ok: false, motivo: `A permanência vai de ${MIN_PERMANENCIA_INCLUSAO_MIN} a ${MAX_PERMANENCIA_INCLUSAO_MIN} minutos, inteiros.` }
  }
  if (dados.motivo !== undefined && (dados.motivo.trim() === '' || dados.motivo.length > MAX_MOTIVO_INCLUSAO)) {
    return { ok: false, motivo: `O motivo vai até ${MAX_MOTIVO_INCLUSAO} caracteres (ou fica em branco).` }
  }

  const ordenadas = ordenarEtapas(d.etapas)
  const i = ordenadas.findIndex((e) => e.id === dados.apos)
  const apos = ordenadas[i]
  if (!apos) return { ok: false, motivo: 'Etapa de referência não encontrada.' }
  if (apos.tipo === 'destino') return { ok: false, motivo: 'A parada nova entra antes do destino.' }

  const atual = calcularEstado(d, original, eventos, agora)
  if (atual.chegadaDestino?.origem === 'real') return { ok: false, motivo: 'A viagem já chegou ao destino.' }
  const estadoDe = (id: string) => atual.etapas.find((e) => e.etapaId === id)?.estado
  const seguinte = ordenadas.slice(i + 1).find((e) => estadoDe(e.id) !== 'pulada')
  const est = estadoDe(apos.id)
  if (!posicoesParaIncluir(d, original, eventos, agora).includes(apos.id)) {
    return { ok: false, motivo: 'A parada nova só entra depois da posição atual, antes do destino.' }
  }
  if (paradaAberta(eventos)) return { ok: false, motivo: 'Há uma parada não planejada aberta: registre o VOLTAMOS antes de incluir uma parada.' }
  if (est === 'concluida' && seguinte) {
    const comParadas = eventos.some((e) => e.tipo === 'parada_nao_planejada' && e.etapaId === seguinte.id)
    const comPrevisao = eventos.some((e) => e.tipo === 'recalibracao' && e.etapaId === seguinte.id)
    if (comParadas) return { ok: false, motivo: 'Houve parada não planejada neste trecho: a parada nova ainda não pode entrar aqui.' }
    if (comPrevisao) return { ok: false, motivo: 'Há uma previsão do Google Maps para a próxima etapa: ela deixaria de valer. Registre a chegada ou informe a previsão depois.' }
  }

  const sim = simulada(d, agora, 'simulacao-inclusao', { tipo: 'parada_incluida', etapaId, dados: { ...dados } })
  const comMudanca = [...eventos, sim]
  const d2 = aplicarInclusoes(d, comMudanca)
  if (!d2.etapas.some((e) => e.id === etapaId)) return { ok: false, motivo: 'Não foi possível incluir a parada nesta posição.' }
  const estado2 = calcularEstado(d2, original, comMudanca, agora)
  const trechosOk = validarTrechosDoEvento(d2, estado2, dados.trechos, (t) => t.etapaOrigemId === etapaId || t.etapaDestinoId === etapaId)
  if (!trechosOk.ok) return trechosOk
  return conferirTempos(d2, original, comMudanca, estado2, etapaId, agora, chegadaPeloMaps)
}

export interface DadosDoLocalNovo {
  localId: string
  trechos: Trecho[]
}

/**
 * Trocar o local de uma parada flexível ainda não alcançada por um local novo (que não era
 * alternativa). Só vale com os tempos em dia: validar já com o local candidato e a troca feitos.
 * Ponto obrigatório nunca troca de local.
 */
export function validarLocalNovo(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
  etapaId: string,
  dados: DadosDoLocalNovo,
  chegadaPeloMaps?: Instante,
): Resultado {
  const agora = truncarMinuto(agoraDoRelogio)
  if (d.viagem.status !== 'em_andamento') return { ok: false, motivo: 'A viagem não está em andamento.' }
  const etapa = d.etapas.find((e) => e.id === etapaId)
  if (!etapa) return { ok: false, motivo: 'Etapa não encontrada.' }
  if (etapa.tipo !== 'flexivel') return { ok: false, motivo: 'Só paradas flexíveis aceitam um local novo.' }
  if (!d.locais.some((l) => l.id === dados.localId)) return { ok: false, motivo: 'Local não encontrado.' }
  if (etapa.localId === dados.localId || etapa.alternativas.includes(dados.localId)) {
    return { ok: false, motivo: 'Este local já é candidato desta parada: escolha-o pelas alternativas.' }
  }
  const atual = calcularEstado(d, original, eventos, agora)
  if (atual.etapas.find((e) => e.etapaId === etapaId)?.estado !== 'pendente') {
    return { ok: false, motivo: 'Esta parada já foi alcançada ou pulada.' }
  }
  const incluido = simulada(d, agora, 'simulacao-local', { tipo: 'local_incluido', etapaId, dados: { ...dados } })
  const troca = simulada(d, agora, 'simulacao-troca', { tipo: 'troca_local', etapaId, dados: { localId: dados.localId } })
  const comMudanca = [...eventos, incluido, troca]
  const d2 = aplicarInclusoes(d, comMudanca)
  const estado2 = calcularEstado(d2, original, comMudanca, agora)
  const naEtapa = (t: Trecho) =>
    (t.etapaDestinoId === etapaId && t.localDestinoId === dados.localId) || (t.etapaOrigemId === etapaId && t.localOrigemId === dados.localId)
  const trechosOk = validarTrechosDoEvento(d2, estado2, dados.trechos, naEtapa)
  if (!trechosOk.ok) return trechosOk
  return conferirTempos(d2, original, comMudanca, estado2, etapaId, agora, chegadaPeloMaps)
}

/**
 * Cancelar uma parada incluída: só antes de chegar nela, uma vez, e sem outra parada incluída
 * depois dela (que ficaria sem referência).
 */
export function validarCancelamento(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
  eventoId: string,
): Resultado {
  if (d.viagem.status !== 'em_andamento') return { ok: false, motivo: 'A viagem não está em andamento.' }
  const evento = eventos.find((e) => e.id === eventoId)
  if (!evento || evento.tipo !== 'parada_incluida') return { ok: false, motivo: 'Este registro não é uma parada incluída.' }
  const ativa = inclusoesAtivas(eventos).find((e) => e.id === eventoId)
  if (!ativa) return { ok: false, motivo: 'Esta parada incluída já foi cancelada.' }
  if (eventos.some((e) => e.tipo === 'chegada' && e.etapaId === ativa.etapaId)) {
    return { ok: false, motivo: 'Já chegamos nesta parada: não dá para cancelar.' }
  }
  if (inclusoesAtivas(eventos).some((e) => e.dados.apos === ativa.etapaId)) {
    return { ok: false, motivo: 'Há outra parada incluída depois desta: cancele-a primeiro.' }
  }
  const estado = calcularEstado(d, original, eventos, truncarMinuto(agoraDoRelogio))
  if (estado.etapas.find((e) => e.etapaId === ativa.etapaId)?.estado === 'em_parada') {
    return { ok: false, motivo: 'Já chegamos nesta parada: não dá para cancelar.' }
  }
  return { ok: true }
}

// ---------- Para a tela: trechos que a mudança pede e pré-visualização ----------

export type AlvoDaMudanca = { tipo: 'incluir'; apos: string } | { tipo: 'local_novo'; etapaId: string }

export interface PernasDaMudanca {
  /** A etapa antes do local novo (a "depois de" da inclusão) e o local em uso nela. */
  anterior: { etapaId: string; localId: string | null }
  /** A etapa logo depois e o local em uso nela. */
  seguinte: { etapaId: string; localId: string | null }
  /** O trecho até o local novo é o que está em curso (a etapa anterior já foi deixada): só a chegada pelo Maps. */
  ateOLocalEmCurso: boolean
}

/** Os vizinhos do local novo ou da parada nova, para a tela pedir os dois tempos. */
export function pernasDaMudanca(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
  alvo: AlvoDaMudanca,
): PernasDaMudanca | null {
  const ordenadas = ordenarEtapas(d.etapas)
  const i = ordenadas.findIndex((e) => e.id === (alvo.tipo === 'incluir' ? alvo.apos : alvo.etapaId))
  if (i < 0) return null
  const anterior = ordenadas[alvo.tipo === 'incluir' ? i : i - 1]
  const seguinte = ordenadas[i + 1]
  if (!anterior || !seguinte) return null
  const estado = calcularEstado(d, original, eventos, truncarMinuto(agoraDoRelogio))
  const doEstado = (id: string) => estado.etapas.find((e) => e.etapaId === id)
  return {
    anterior: { etapaId: anterior.id, localId: doEstado(anterior.id)?.localId ?? null },
    seguinte: { etapaId: seguinte.id, localId: doEstado(seguinte.id)?.localId ?? null },
    ateOLocalEmCurso: doEstado(anterior.id)?.estado === 'concluida',
  }
}

export interface PrevisaoDaMudanca {
  chegadaNaParada: Instante | null
  chegadaDestino: Instante | null
  /** Chegada no destino com a mudança − sem ela. */
  impactoDestinoMin: number | null
  atrasoDestinoMin: number | null
}

function prever(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agora: Instante,
  extras: readonly Evento[],
  etapaId: string,
): PrevisaoDaMudanca {
  const antes = calcularEstado(d, original, eventos, agora)
  const comMudanca = [...eventos, ...extras]
  const d2 = aplicarInclusoes(d, comMudanca)
  const depois = calcularEstado(d2, original, comMudanca, agora)
  const destinoDepois = depois.chegadaDestino?.instante ?? null
  const destinoAntes = antes.chegadaDestino?.instante ?? null
  return {
    chegadaNaParada: depois.etapas.find((e) => e.etapaId === etapaId)?.chegada?.instante ?? null,
    chegadaDestino: destinoDepois,
    impactoDestinoMin: destinoDepois && destinoAntes ? Math.round((Date.parse(destinoDepois) - Date.parse(destinoAntes)) / 60_000) : null,
    atrasoDestinoMin: depois.atrasoDestinoMin,
  }
}

const recalibracaoSimulada = (d: DadosPlano, agora: Instante, etapaId: string, horario: Instante): Evento =>
  simulada(d, agora, 'simulacao-chegada', { tipo: 'recalibracao', etapaId, dados: { horario } })

/** Chegada na parada nova, no destino e o impacto, antes de confirmar (mesmo cálculo do registro). */
export function preverInclusao(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
  etapaId: string,
  dados: DadosDaInclusao,
  chegadaPeloMaps?: Instante,
): PrevisaoDaMudanca {
  const agora = truncarMinuto(agoraDoRelogio)
  return prever(
    d, original, eventos, agora,
    [
      simulada(d, agora, 'simulacao-inclusao', { tipo: 'parada_incluida', etapaId, dados: { ...dados } }),
      ...(chegadaPeloMaps ? [recalibracaoSimulada(d, agora, etapaId, chegadaPeloMaps)] : []),
    ],
    etapaId,
  )
}

/** Chegada na parada com o local novo, no destino e o impacto, antes de confirmar. */
export function preverLocalNovo(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
  etapaId: string,
  dados: DadosDoLocalNovo,
  chegadaPeloMaps?: Instante,
): PrevisaoDaMudanca {
  const agora = truncarMinuto(agoraDoRelogio)
  return prever(
    d, original, eventos, agora,
    [
      simulada(d, agora, 'simulacao-local', { tipo: 'local_incluido', etapaId, dados: { ...dados } }),
      simulada(d, agora, 'simulacao-troca', { tipo: 'troca_local', etapaId, dados: { localId: dados.localId } }),
      ...(chegadaPeloMaps ? [recalibracaoSimulada(d, agora, etapaId, chegadaPeloMaps)] : []),
    ],
    etapaId,
  )
}
