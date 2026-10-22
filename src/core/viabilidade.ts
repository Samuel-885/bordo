// Alternativas e viabilidade: cada alternativa de uma parada flexível ainda não
// alcançada é calculada como se fosse a escolhida e classificada pelo funcionamento.

import { CONFIG } from './config'
import { calcularEstado } from './previsao'
import { antes, diferencaMin, minutosDoDia, naHoraDoDia, somarMinutos, truncarMinuto } from './tempo'
import { chegadaDaConsulta, vigenciaDaConsulta, type SituacaoDaConsulta } from './consulta'
import { validarRecalibracao } from './recalibracao'
import { duracaoTrecho, ordenarEtapas, type ParDeTrecho } from './trechos'
import type { Consulta, DadosPlano, EstadoViagem, Etapa, Evento, Instante, Local, PlanoOriginal } from './tipos'

export type ClasseAlternativa = 'viavel' | 'pouca_margem' | 'sem_horario' | 'inviavel' | 'sem_tempo'

/** Avisos aparecem junto da classe, sem mudá-la. ("Mal avaliado" fica para a fase 10.) */
export type AvisoAlternativa =
  | 'fora_da_janela'
  | 'onibus_nao_para'
  | 'onibus_para_nao_sei'
  | 'evitar'
  | 'favorito'

/** Trecho sem duração que impede a chegada ou a previsão seguinte com a alternativa. */
export interface TrechoFaltante extends ParDeTrecho {
  /** Ainda não percorrido: dá para informar a duração durante a viagem. */
  podeInformar: boolean
  /** Até o local da etapa (chegada) ou do local até a etapa ativa seguinte. */
  perna: 'ate_o_local' | 'do_local'
}

export type Resultado = { ok: true } | { ok: false; motivo: string }

/** A consulta ao Google Maps deste local. "Antiga" aparece marcada, mas não entra no cálculo. */
export interface ConsultaDaAlternativa {
  horario: Instante
  consultadoEm: Instante
  idadeMin: number
  situacao: Exclude<SituacaoDaConsulta, 'descartada'>
  /** A chegada que a consulta vale agora (ver `chegadaDaConsulta`). */
  chegadaEfetiva: Instante
}

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
  /** Trechos sem tempo (até a alternativa e dela até a etapa seguinte). Vazio se nenhum falta. */
  trechosFaltantes: TrechoFaltante[]
  /**
   * Em trânsito para a parada, o único trecho sem tempo até esta alternativa é o que está em
   * curso: só dá para escolhê-la informando a chegada pelo Google Maps.
   */
  exigeChegadaPeloMaps: boolean
  /** Consulta vigente (entra no cálculo) ou antiga (só marcada). Vazio se não há. */
  consulta?: ConsultaDaAlternativa
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

/** O local preferido e as alternativas, sem repetidos e sem vazios. */
export function candidatosDaEtapa(etapa: Etapa): string[] {
  return [...new Set([etapa.localId, ...etapa.alternativas])].filter((id): id is string => id !== null)
}

/** Paradas flexíveis ainda não alcançadas nem puladas, na ordem do percurso. */
export function paradasFlexiveisPendentes(d: DadosPlano, estado: EstadoViagem): Etapa[] {
  return ordenarEtapas(d.etapas).filter(
    (e) => e.tipo === 'flexivel' && estado.etapas.find((x) => x.etapaId === e.id)?.estado === 'pendente',
  )
}

/** Há escolha a fazer: alguma parada flexível pendente com mais de um local. */
export function temAlternativasPendentes(d: DadosPlano, estado: EstadoViagem): boolean {
  return paradasFlexiveisPendentes(d, estado).some((e) => candidatosDaEtapa(e).length > 1)
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
 *
 * Com uma consulta vigente ao Google Maps num local, ele é calculado como se a troca e a
 * recalibração com a chegada consultada tivessem sido feitas agora (só a recalibração, se já
 * é o escolhido). A consulta nunca altera a previsão atual nem o plano.
 */
export function avaliarAlternativas(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
  etapaId: string,
  consultas: readonly Consulta[] = [],
): AvaliacaoAlternativa[] {
  const agora = truncarMinuto(agoraDoRelogio)
  const etapa = d.etapas.find((e) => e.id === etapaId)
  if (!etapa || etapa.tipo !== 'flexivel') return []
  const atual = calcularEstado(d, original, eventos, agora)
  const estadoEtapa = atual.etapas.find((e) => e.etapaId === etapaId)
  if (estadoEtapa?.estado !== 'pendente') return []

  const candidatos = candidatosDaEtapa(etapa)
  const avaliacoes: AvaliacaoAlternativa[] = []
  for (const localId of candidatos) {
    const local = d.locais.find((l) => l.id === localId)
    if (!local) continue
    const escolhida = localId === estadoEtapa.localId
    const doLocal = consultas.find((c) => c.etapaId === etapaId && c.localId === localId)
    const vigencia = doLocal && vigenciaDaConsulta(doLocal, eventos, agora)
    const consulta: ConsultaDaAlternativa | undefined =
      doLocal && vigencia && vigencia.situacao !== 'descartada'
        ? {
            horario: doLocal.horario,
            consultadoEm: doLocal.consultadoEm,
            idadeMin: vigencia.idadeMin,
            situacao: vigencia.situacao,
            chegadaEfetiva: chegadaDaConsulta(doLocal, agora),
          }
        : undefined
    const usaConsulta = consulta?.situacao === 'vigente'
    const simulados: Evento[] = [
      ...(escolhida ? [] : [trocaSimulada(d, etapaId, localId, agora)]),
      ...(usaConsulta ? [recalibracaoSimulada(d, etapaId, consulta.chegadaEfetiva, agora)] : []),
    ]
    const simulado = simulados.length === 0 ? atual : calcularEstado(d, original, [...eventos, ...simulados], agora)
    const chegada = simulado.etapas.find((e) => e.etapaId === etapaId)?.chegada?.instante ?? null
    // Com consulta, a chegada vem do Google Maps: o trecho de chegada sem tempo não impede.
    const faltam = trechosFaltantes(d, simulado, etapaId).filter((t) => !usaConsulta || t.perna === 'do_local')
    const destinoCom = simulado.chegadaDestino?.instante
    const destinoAtual = atual.chegadaDestino?.instante
    avaliacoes.push({
      localId,
      escolhida,
      ...classificar(local, chegada, etapa.permanenciaMin),
      chegada,
      impactoDestinoMin: destinoCom && destinoAtual ? diferencaMin(destinoCom, destinoAtual) : null,
      avisos: avisos(etapa, local, chegada),
      trechosFaltantes: faltam,
      exigeChegadaPeloMaps: !escolhida && !usaConsulta && exigeChegadaInformada(simulado, etapaId, faltam),
      ...(consulta ? { consulta } : {}),
    })
  }

  return avaliacoes.sort((a, b) => {
    const porClasse = ORDEM_CLASSES.indexOf(a.classe) - ORDEM_CLASSES.indexOf(b.classe)
    if (porClasse !== 0 || !a.chegada || !b.chegada) return porClasse
    return diferencaMin(a.chegada, b.chegada)
  })
}

function recalibracaoSimulada(d: DadosPlano, etapaId: string, horario: Instante, agora: Instante): Evento {
  return {
    id: 'simulacao-consulta',
    viagemId: d.viagem.id,
    tipo: 'recalibracao',
    etapaId,
    dados: { horario },
    horarioFato: agora,
    registradoEm: agora,
  }
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

// ---------- Trechos que faltam e troca de local ----------

const AINDA_NAO_PERCORRIDO_NA_ORIGEM = new Set(['pendente', 'em_parada', 'pulada'])

/**
 * Um trecho pode receber duração durante a viagem só se ainda não foi percorrido: a etapa
 * de destino não foi alcançada e a de origem ainda não foi deixada (ou foi pulada).
 * Etapa pulada nunca chegou a ser alcançada.
 */
export function trechoAindaNaoPercorrido(estado: EstadoViagem, par: ParDeTrecho): boolean {
  const origem = estado.etapas.find((e) => e.etapaId === par.etapaOrigemId)?.estado
  const destino = estado.etapas.find((e) => e.etapaId === par.etapaDestinoId)?.estado
  return !!origem && !!destino && AINDA_NAO_PERCORRIDO_NA_ORIGEM.has(origem) && (destino === 'pendente' || destino === 'pulada')
}

/**
 * Trecho sem tempo que liga duas etapas ativas (com as puladas entre elas): se a duração
 * da ponta a ponta está definida, nada falta; senão, são as partes sem tempo.
 */
function partesSemTempo(
  d: DadosPlano,
  estado: EstadoViagem,
  de: number,
  ate: number,
  perna: TrechoFaltante['perna'],
): TrechoFaltante[] {
  const ordenadas = ordenarEtapas(d.etapas)
  const ponta = estado.etapas.find((e) => e.etapaId === ordenadas[ate]?.id)
  if (!ponta?.trechoChegada || ponta.trechoChegada.minutos !== null) return []
  const faltam: TrechoFaltante[] = []
  for (let i = de; i < ate; i++) {
    const a = ordenadas[i]!
    const b = ordenadas[i + 1]!
    const localA = estado.etapas.find((e) => e.etapaId === a.id)?.localId ?? null
    const localB = estado.etapas.find((e) => e.etapaId === b.id)?.localId ?? null
    if (localA === null || localB === null) continue
    if (duracaoTrecho(d, a, localA, b, localB).minutos !== null) continue
    const par = { etapaOrigemId: a.id, localOrigemId: localA, etapaDestinoId: b.id, localDestinoId: localB }
    faltam.push({ ...par, podeInformar: trechoAindaNaoPercorrido(estado, par), perna })
  }
  return faltam
}

/**
 * Trechos sem tempo no estado dado (já com o local da etapa trocado) que impedem a
 * chegada na etapa ou a previsão da etapa ativa seguinte.
 */
export function trechosFaltantes(d: DadosPlano, estado: EstadoViagem, etapaId: string): TrechoFaltante[] {
  const ordenadas = ordenarEtapas(d.etapas)
  const i = ordenadas.findIndex((e) => e.id === etapaId)
  const puladaEm = (k: number) => estado.etapas.find((e) => e.etapaId === ordenadas[k]?.id)?.estado === 'pulada'
  if (i < 0) return []

  let antesDe = i - 1
  while (antesDe >= 0 && puladaEm(antesDe)) antesDe--
  let depoisDe = i + 1
  while (depoisDe < ordenadas.length && puladaEm(depoisDe)) depoisDe++

  return [
    ...(antesDe >= 0 ? partesSemTempo(d, estado, antesDe, i, 'ate_o_local') : []),
    ...(depoisDe < ordenadas.length ? partesSemTempo(d, estado, i, depoisDe, 'do_local') : []),
  ]
}

function nomeDoLocal(d: DadosPlano, id: string): string {
  return d.locais.find((l) => l.id === id)?.nome ?? 'local'
}

export function textoDoTrechoFaltante(d: DadosPlano, t: ParDeTrecho): string {
  return `${nomeDoLocal(d, t.localOrigemId)} até ${nomeDoLocal(d, t.localDestinoId)}`
}

/**
 * Em trânsito para a parada, o único trecho sem tempo até a alternativa é o que está em
 * curso (não dá mais para informar a duração). O trecho dela até a etapa seguinte continua
 * obrigatório: se faltar, não vale.
 */
function exigeChegadaInformada(simulado: EstadoViagem, etapaId: string, faltam: readonly TrechoFaltante[]): boolean {
  return (
    simulado.emTransito &&
    simulado.proximaEtapaId === etapaId &&
    faltam.length > 0 &&
    faltam.every((t) => t.perna === 'ate_o_local' && !t.podeInformar)
  )
}

type ExameDaTroca =
  | { ok: false; motivo: string }
  | { ok: true; simulado: EstadoViagem; faltam: TrechoFaltante[]; troca: Evento }

/** As regras de estrutura da troca (etapa, local, estado), sem olhar os tempos dos trechos. */
function examinarTroca(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agora: Instante,
  etapaId: string,
  localId: string,
): ExameDaTroca {
  const etapa = d.etapas.find((e) => e.id === etapaId)
  if (!etapa) return { ok: false, motivo: 'Etapa não encontrada.' }
  if (etapa.tipo !== 'flexivel') return { ok: false, motivo: 'Só paradas flexíveis têm alternativas.' }
  const atual = calcularEstado(d, original, eventos, agora)
  const estadoEtapa = atual.etapas.find((e) => e.etapaId === etapaId)
  if (estadoEtapa?.estado !== 'pendente') return { ok: false, motivo: 'Esta parada já foi alcançada ou pulada.' }
  const candidatos = [etapa.localId, ...etapa.alternativas]
  if (!candidatos.includes(localId)) return { ok: false, motivo: 'Este local não é uma das alternativas desta parada.' }
  if (localId === estadoEtapa.localId) return { ok: false, motivo: 'Este já é o local escolhido.' }

  const troca = trocaSimulada(d, etapaId, localId, agora)
  const simulado = calcularEstado(d, original, [...eventos, troca], agora)
  return { ok: true, simulado, faltam: trechosFaltantes(d, simulado, etapaId), troca }
}

const textoDosFaltantes = (d: DadosPlano, faltam: readonly TrechoFaltante[]) =>
  `Falta o tempo de ${faltam.map((t) => textoDoTrechoFaltante(d, t)).join('; ')}.`

/**
 * Trocar o local de uma parada flexível ainda pendente: o local precisa ser candidato da
 * etapa, diferente do atual, e a previsão não pode ficar sem tempo definido. "Inviável"
 * não é recusada aqui: quem decide é a pessoa, com confirmação na tela.
 */
export function validarTroca(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
  etapaId: string,
  localId: string,
): Resultado {
  const agora = truncarMinuto(agoraDoRelogio)
  const exame = examinarTroca(d, original, eventos, agora, etapaId, localId)
  if (!exame.ok) return exame
  if (exame.faltam.length > 0) return { ok: false, motivo: textoDosFaltantes(d, exame.faltam) }
  if (!exame.simulado.etapas.find((e) => e.etapaId === etapaId)?.chegada) {
    return { ok: false, motivo: 'Sem tempo definido para chegar a este local.' }
  }
  return { ok: true }
}

/**
 * Troca de local com a chegada informada pelo Google Maps (troca + recalibração da etapa,
 * gravadas juntas): a chegada que o trecho em curso sem tempo não dá, ou uma consulta ao
 * Maps. O trecho do local até a etapa seguinte continua obrigatório; o de chegada sem tempo
 * não impede, porque o horário informado o substitui. A recalibração feita depois da troca
 * vale para o novo local (decisão da fase 1) e passa pelas mesmas travas da recalibração
 * (próxima etapa, em trânsito ou parado na anterior, horário não anterior a agora),
 * avaliadas já com a troca.
 */
export function validarTrocaComChegada(
  d: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agoraDoRelogio: Instante,
  etapaId: string,
  localId: string,
  horario: Instante,
): Resultado {
  const agora = truncarMinuto(agoraDoRelogio)
  const exame = examinarTroca(d, original, eventos, agora, etapaId, localId)
  if (!exame.ok) return exame
  const doLocal = exame.faltam.filter((t) => t.perna === 'do_local')
  if (doLocal.length > 0) return { ok: false, motivo: textoDosFaltantes(d, doLocal) }
  return validarRecalibracao(d, original, [...eventos, exame.troca], etapaId, horario, agora)
}

/**
 * Duração digitada à mão durante a viagem. Só para trecho ainda não percorrido, entre
 * etapas vizinhas e locais candidatos, e só quando o par ainda não tem tempo (nada que já
 * entra na previsão é alterado em silêncio). O plano original guarda horários, não
 * durações: não é tocado.
 */
export function validarTrechoManualEmViagem(
  d: DadosPlano,
  estado: EstadoViagem,
  par: ParDeTrecho,
  duracaoMin: number,
): Resultado {
  if (d.viagem.status !== 'em_andamento') return { ok: false, motivo: 'A viagem não está em andamento.' }
  if (!Number.isInteger(duracaoMin) || duracaoMin <= 0) {
    return { ok: false, motivo: 'A duração precisa ser de pelo menos 1 minuto.' }
  }
  const ordenadas = ordenarEtapas(d.etapas)
  const i = ordenadas.findIndex((e) => e.id === par.etapaOrigemId)
  const a = ordenadas[i]
  const b = ordenadas[i + 1]
  if (!a || !b || b.id !== par.etapaDestinoId) return { ok: false, motivo: 'O trecho precisa ligar etapas vizinhas.' }
  const candidato = (e: Etapa, id: string) => id === e.localId || e.alternativas.includes(id)
  if (!candidato(a, par.localOrigemId) || !candidato(b, par.localDestinoId)) {
    return { ok: false, motivo: 'Os locais do trecho precisam ser candidatos das etapas.' }
  }
  if (!trechoAindaNaoPercorrido(estado, par)) {
    return { ok: false, motivo: 'Este trecho já foi percorrido (ou está em curso): não dá mais para informar o tempo.' }
  }
  if (duracaoTrecho(d, a, par.localOrigemId, b, par.localDestinoId).minutos !== null) {
    return { ok: false, motivo: 'Este trecho já tem tempo definido.' }
  }
  return { ok: true }
}
