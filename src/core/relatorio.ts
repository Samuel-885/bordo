// Relatório da viagem (fase 10b): tudo derivado do plano, dos eventos e dos passageiros.
// Nenhuma regra de cálculo nova: o atraso de cada evento é o horário real menos o original do
// mesmo evento; a variação é a diferença entre o atraso de um evento e o do evento anterior.
// Nada é guardado: o relatório é refeito a cada geração.

import { atrasoMin } from './atraso'
import { emOrdemDeGravacao } from './eventos'
import { aplicarInclusoes } from './inclusao'
import { passageirosEmTransito } from './passageiros'
import { calcularEstado } from './previsao'
import { diferencaMin, ordenarPor, truncarMinuto } from './tempo'
import { ordenarEtapas } from './trechos'
import type {
  DadosPlano,
  Evento,
  Etapa,
  EstadoEtapa,
  Instante,
  MotivoParada,
  Passageiro,
  RestauradoDe,
  StatusPassageiro,
  TipoEtapa,
  TipoImprevisto,
  Trecho,
} from './tipos'

/** As duas opções são independentes e começam desligadas a cada geração. */
export interface OpcoesDoRelatorio {
  /** Lista de passageiros com nome (dado pessoal). */
  incluirNomes: boolean
  /** Texto das observações livres, que "ficam só no celular". */
  incluirObservacoes: boolean
}

export const OPCOES_PADRAO: OpcoesDoRelatorio = { incluirNomes: false, incluirObservacoes: false }

// ---------- Tipos do relatório ----------

export interface Marco {
  original: Instante | null
  real: Instante | null
  /** Real − original. Vazio sem um dos dois (parada incluída não tem original). */
  atrasoMin: number | null
  /** Quanto o atraso cresceu (+) ou diminuiu (−) neste trecho ou parada. */
  variacaoMin: number | null
}

export interface LinhaDeAtraso {
  etapaId: string
  tipo: TipoEtapa
  categoria?: string
  /** Motivo digitado na inclusão (só parada incluída). */
  motivo?: string
  incluida: boolean
  pulada: boolean
  /** Local do plano original (na parada incluída, o local dela). */
  localPlanejadoId: string | null
  /** Local em uso no fim (depois das trocas). */
  localRealId: string | null
  localTrocado: boolean
  /** Vazio na origem. */
  chegada: Marco | null
  /** Vazio no destino. */
  saida: Marco | null
}

export type SituacaoDaPermanencia =
  | 'completa'
  /** Ainda parado nela, ou a parada não planejada ainda aberta. */
  | 'em_curso'
  /** O ônibus seguiu viagem (ou a viagem acabou) e a saída (ou o VOLTAMOS) não foi registrada. */
  | 'sem_saida'

export interface LinhaDePermanencia {
  tipo: 'planejada' | 'nao_planejada'
  /** Planejada: a própria etapa. Não planejada: a etapa que vinha depois. */
  etapaId: string
  incluida: boolean
  motivo?: MotivoParada
  onde?: string
  chegada: Instante
  saida: Instante | null
  realMin: number | null
  planejadoMin: number | null
  /** Real − planejado. */
  diferencaMin: number | null
  situacao: SituacaoDaPermanencia
}

export type Ocorrencia = { horario: Instante } & (
  | { tipo: 'parada_nao_planejada'; etapaId: string; motivo?: MotivoParada; onde?: string; realMin: number | null; previstoMin: number | null; aberta: boolean }
  | { tipo: 'imprevisto'; categoria: TipoImprevisto; /** Anotação curta digitada; entra sempre, como o motivo das paradas. Vazio quando não houve. */ texto: string }
  | { tipo: 'observacao'; /** Vazio quando a opção de observações está desligada. */ texto: string | null }
  | { tipo: 'troca_local'; etapaId: string; deLocalId: string | null; paraLocalId: string }
  | { tipo: 'local_novo'; etapaId: string; localId: string; /** Já trocado para ele no mesmo registro. */ trocado: boolean }
  | { tipo: 'parada_incluida'; etapaId: string; apos: string; localId: string; categoria: string; motivo?: string; permanenciaMin: number }
  | { tipo: 'inclusao_cancelada'; etapaId: string; localId: string | null }
  | { tipo: 'etapa_pulada'; etapaId: string }
)

export interface MensagemGerada {
  horario: Instante
  previsaoDestino: Instante | null
  atrasoMin: number | null
}

export interface ResumoDoRelatorio {
  saidaOriginal: Instante | null
  saidaReal: Instante | null
  chegadaOriginal: Instante | null
  chegadaReal: Instante | null
  /** Só com a viagem em andamento: a chegada prevista no destino agora. */
  chegadaPrevista: Instante | null
  atrasoFinalMin: number | null
  atrasoPrevistoMin: number | null
  /** Saída real até a chegada real (ou até agora, se a viagem não acabou). */
  duracaoTotalMin: number | null
  duracaoParcial: boolean
  quilometragem: { km: number; trechosComDistancia: number; trechosTotais: number } | null
}

export interface TotaisDeParada {
  /** Planejadas + não planejadas, só as completas. */
  paradoMin: number
  /** Duração total − parado. Vazio sem duração total. */
  movimentoMin: number | null
  /** Paradas completas somadas. */
  completas: number
  /** Paradas sem saída (ou sem VOLTAMOS) registrada: ficam fora dos totais. */
  semSaida: number
  /** Paradas ainda em curso: ficam fora dos totais. */
  emCurso: number
}

export interface ContagemDePassageiros {
  cadastrados: number
  conferidos: number
  conferencias: { total: number; completas: number; porContagem: number; incompletas: number }
  desceram: number
  naoEmbarcaram: number
  sairamDaViagem: number
  /** Só com a viagem concluída: a bordo no destino. */
  chegaram: number | null
}

export type SituacaoDoPassageiro = 'chegou' | 'desceu' | 'nao_embarcou' | 'saiu_da_viagem' | 'em_viagem'

export interface LinhaDePassageiro {
  nome: string
  etapaEmbarqueId: string
  etapaDesembarqueId: string | null
  situacao: SituacaoDoPassageiro
}

export interface Relatorio {
  viagemId: string
  nome: string
  tipo: DadosPlano['viagem']['tipo']
  dataSaida: Instante
  identificacao?: string
  equipe?: number
  status: DadosPlano['viagem']['status']
  /** A viagem ainda não acabou: o relatório mostra só o que já aconteceu. */
  emAndamento: boolean
  geradoEm: Instante
  restaurada: { geradoEm: Instante; restauradoEm: Instante } | null
  opcoes: OpcoesDoRelatorio
  resumo: ResumoDoRelatorio
  permanencias: { linhas: LinhaDePermanencia[]; totais: TotaisDeParada }
  atraso: LinhaDeAtraso[]
  ocorrencias: Ocorrencia[]
  comunicacao: {
    mensagens: MensagemGerada[]
    atualizacoes: { digitadas: number; pelaLocalizacao: number; automaticas: number }
  }
  passageiros: { contagem: ContagemDePassageiros; lista: LinhaDePassageiro[] | null }
}

// ---------- Auxiliares ----------

/** Distância pela rota de carro: a do trecho de rota, ou a rota guardada ao lado de um trecho manual. */
function distanciaDoTrecho(t: Trecho | undefined): number | null {
  if (!t) return null
  if (t.fonte === 'rota') return t.distanciaKm ?? null
  return t.rota?.distanciaKm ?? null
}

interface ParadaNaoPlanejadaRegistrada {
  etapaId: string
  inicio: Instante
  fim: Instante | null
  motivo?: MotivoParada
  onde?: string
  tempoPrevistoMin?: number
}

/** Os pares PARAMOS/VOLTAMOS, lidos como o cálculo da previsão os lê (uma aberta por vez; `previsao` leva o estado completo). */
function paradasNaoPlanejadas(ordenados: readonly Evento[]): ParadaNaoPlanejadaRegistrada[] {
  const todas: ParadaNaoPlanejadaRegistrada[] = []
  for (const e of ordenados) {
    if (e.tipo !== 'parada_nao_planejada') continue
    const aberta = todas.findLast((p) => p.etapaId === e.etapaId && p.fim === null)
    if (e.dados.fase === 'inicio' && !aberta) {
      todas.push({
        etapaId: e.etapaId,
        inicio: e.horarioFato,
        fim: null,
        ...(e.dados.motivo ? { motivo: e.dados.motivo } : {}),
        ...(e.dados.onde ? { onde: e.dados.onde } : {}),
        ...(e.dados.tempoPrevistoMin !== undefined ? { tempoPrevistoMin: e.dados.tempoPrevistoMin } : {}),
      })
    } else if (e.dados.fase === 'previsao' && aberta) {
      if (e.dados.onde) aberta.onde = e.dados.onde
      else delete aberta.onde
      if (e.dados.tempoPrevistoMin !== undefined) aberta.tempoPrevistoMin = e.dados.tempoPrevistoMin
      else delete aberta.tempoPrevistoMin
    } else if (e.dados.fase === 'fim' && aberta) {
      aberta.fim = e.horarioFato
    }
  }
  return todas
}

const minutos = (a: Instante, b: Instante) => Math.max(0, diferencaMin(a, b))

// ---------- Montagem ----------

export function montarRelatorio(
  plano: DadosPlano,
  eventos: readonly Evento[],
  passageiros: readonly Passageiro[],
  agoraDoRelogio: Instante,
  restaurado: RestauradoDe | null,
  opcoes: OpcoesDoRelatorio = OPCOES_PADRAO,
): Relatorio {
  const original = plano.viagem.planoOriginal
  if (!original) throw new Error('A viagem ainda não foi iniciada: não há o que relatar.')
  const agora = truncarMinuto(agoraDoRelogio)
  const efetivo = aplicarInclusoes(plano, eventos)
  const etapas = ordenarEtapas(efetivo.etapas)
  const estado = calcularEstado(efetivo, original, eventos, agora)
  const ordenados = ordenarPor(emOrdemDeGravacao(eventos), (e) => e.horarioFato)
  const concluida = plano.viagem.status === 'concluida'
  const idsDasEtapas = new Set(etapas.map((e) => e.id))
  const idsDoPlano = new Set(plano.etapas.map((e) => e.id))

  const estadoDe = new Map<string, EstadoEtapa>(estado.etapas.map((e) => [e.etapaId, e]))
  const originalDe = new Map(original.etapas.map((o) => [o.etapaId, o]))
  const real = (etapaId: string, m: 'chegada' | 'saida'): Instante | null => {
    const h = estadoDe.get(etapaId)?.[m]
    return h?.origem === 'real' ? h.instante : null
  }

  // Locais: o preferido, a cada troca o novo.
  const localEmUso = new Map<string, string | null>(etapas.map((e) => [e.id, e.localId]))
  for (const e of ordenados) if (e.tipo === 'troca_local') localEmUso.set(e.etapaId, e.dados.localId)

  // ----- Onde o atraso nasceu -----
  const atraso: LinhaDeAtraso[] = []
  // Atraso do último marco com original e horário real; vazio depois de um marco sem registro.
  let ultimo: number | null = 0
  let permanenciasIncluidasDesde = 0

  const marcoComOriginal = (orig: Instante | null, r: Instante | null): Marco => {
    const atrasoDoEvento = orig && r ? atrasoMin(r, orig) : null
    let variacaoMin: number | null = null
    if (atrasoDoEvento !== null) {
      if (ultimo !== null) variacaoMin = atrasoDoEvento - ultimo - permanenciasIncluidasDesde
      ultimo = atrasoDoEvento
      permanenciasIncluidasDesde = 0
    } else if (orig) {
      ultimo = null
      permanenciasIncluidasDesde = 0
    }
    return { original: orig, real: r, atrasoMin: atrasoDoEvento, variacaoMin }
  }

  for (const etapa of etapas) {
    const incluida = !idsDoPlano.has(etapa.id)
    const pulada = estadoDe.get(etapa.id)?.estado === 'pulada'
    const orig = originalDe.get(etapa.id)
    const localPlanejadoId = incluida ? etapa.localId : (orig?.localId ?? etapa.localId)
    const localRealId = localEmUso.get(etapa.id) ?? null
    const base = {
      etapaId: etapa.id,
      tipo: etapa.tipo,
      ...(etapa.categoria ? { categoria: etapa.categoria } : {}),
      ...(incluida && etapa.motivo ? { motivo: etapa.motivo } : {}),
      incluida,
      pulada,
      localPlanejadoId,
      localRealId,
      localTrocado: !pulada && localRealId !== localPlanejadoId,
    }
    if (pulada) {
      atraso.push({ ...base, chegada: null, saida: null })
      continue
    }
    const rChegada = etapa.tipo === 'origem' ? null : real(etapa.id, 'chegada')
    const rSaida = etapa.tipo === 'destino' ? null : real(etapa.id, 'saida')
    let chegada: Marco | null = null
    let saida: Marco | null = null
    if (incluida) {
      // Sem original: o trecho até ela fica sem variação; a permanência inteira é variação.
      chegada = { original: null, real: rChegada, atrasoMin: null, variacaoMin: null }
      const permanencia = rChegada && rSaida ? minutos(rSaida, rChegada) : null
      saida = { original: null, real: rSaida, atrasoMin: null, variacaoMin: permanencia }
      if (permanencia !== null) permanenciasIncluidasDesde += permanencia
    } else {
      if (etapa.tipo !== 'origem') chegada = marcoComOriginal(orig?.chegada ?? null, rChegada)
      if (etapa.tipo !== 'destino') saida = marcoComOriginal(orig?.saida ?? null, rSaida)
    }
    atraso.push({ ...base, chegada, saida })
  }

  // ----- Resumo -----
  const origem = etapas.find((e) => e.tipo === 'origem')
  const destino = etapas.find((e) => e.tipo === 'destino')
  const saidaReal = origem ? real(origem.id, 'saida') : null
  const chegadaReal = destino ? real(destino.id, 'chegada') : null
  const saidaOriginal = (origem && originalDe.get(origem.id)?.saida) || null
  const chegadaOriginal = (destino && originalDe.get(destino.id)?.chegada) || null
  const duracaoTotalMin = saidaReal ? minutos(chegadaReal ?? agora, saidaReal) : null

  // Quilometragem: segmentos já percorridos, pela rota de carro (não é odômetro).
  const ativas = etapas.filter((e) => estadoDe.get(e.id)?.estado !== 'pulada')
  const todasComPuladas = etapas
  let km = 0
  let comDistancia = 0
  let totais = 0
  for (let i = 1; i < ativas.length; i++) {
    const de = ativas[i - 1]!
    const ate = ativas[i]!
    if (!real(ate.id, 'chegada')) continue
    totais += 1
    const trecho = (a: Etapa, b: Etapa) =>
      efetivo.trechos.find(
        (t) => t.etapaOrigemId === a.id && t.localOrigemId === localEmUso.get(a.id) && t.etapaDestinoId === b.id && t.localDestinoId === localEmUso.get(b.id),
      )
    let distancia = distanciaDoTrecho(trecho(de, ate))
    if (distancia === null) {
      // Com etapas puladas no meio e sem o trecho direto: a soma dos trechos que passavam por elas.
      const a = todasComPuladas.findIndex((e) => e.id === de.id)
      const b = todasComPuladas.findIndex((e) => e.id === ate.id)
      const caminho = todasComPuladas.slice(a, b + 1)
      if (caminho.length > 2) {
        const partes = caminho.slice(1).map((e, j) => distanciaDoTrecho(trecho(caminho[j]!, e)))
        if (partes.every((p) => p !== null)) distancia = partes.reduce<number>((s, p) => s + p!, 0)
      }
    }
    if (distancia !== null) {
      km += distancia
      comDistancia += 1
    }
  }

  const resumo: ResumoDoRelatorio = {
    saidaOriginal,
    saidaReal,
    chegadaOriginal,
    chegadaReal,
    chegadaPrevista: concluida || chegadaReal ? null : (estado.chegadaDestino?.instante ?? null),
    atrasoFinalMin: chegadaReal && chegadaOriginal ? atrasoMin(chegadaReal, chegadaOriginal) : null,
    atrasoPrevistoMin: concluida || chegadaReal ? null : estado.atrasoDestinoMin,
    duracaoTotalMin,
    duracaoParcial: duracaoTotalMin !== null && chegadaReal === null,
    quilometragem: comDistancia > 0 ? { km: Math.round(km * 10) / 10, trechosComDistancia: comDistancia, trechosTotais: totais } : null,
  }

  // ----- Permanência nas paradas -----
  const ordemDe = new Map(etapas.map((e, i) => [e.id, i]))
  const ultimaAlcancada = etapas.findLastIndex((e) => real(e.id, 'chegada') !== null)
  const jaSeguiu = (etapaId: string) => concluida || (ordemDe.get(etapaId) ?? Infinity) < ultimaAlcancada
  const linhas: LinhaDePermanencia[] = []

  for (const etapa of etapas) {
    if (etapa.tipo !== 'obrigatoria' && etapa.tipo !== 'flexivel') continue
    const chegada = real(etapa.id, 'chegada')
    if (!chegada) continue
    const saida = real(etapa.id, 'saida')
    const realMin = saida ? minutos(saida, chegada) : null
    linhas.push({
      tipo: 'planejada',
      etapaId: etapa.id,
      incluida: !idsDoPlano.has(etapa.id),
      chegada,
      saida,
      realMin,
      planejadoMin: etapa.permanenciaMin,
      diferencaMin: realMin === null ? null : realMin - etapa.permanenciaMin,
      situacao: saida ? 'completa' : jaSeguiu(etapa.id) ? 'sem_saida' : 'em_curso',
    })
  }
  for (const p of paradasNaoPlanejadas(ordenados)) {
    if (!idsDasEtapas.has(p.etapaId)) continue
    const realMin = p.fim ? minutos(p.fim, p.inicio) : null
    const previsto = p.tempoPrevistoMin ?? null
    linhas.push({
      tipo: 'nao_planejada',
      etapaId: p.etapaId,
      incluida: false,
      ...(p.motivo ? { motivo: p.motivo } : {}),
      ...(p.onde ? { onde: p.onde } : {}),
      chegada: p.inicio,
      saida: p.fim,
      realMin,
      planejadoMin: previsto,
      diferencaMin: realMin !== null && previsto !== null ? realMin - previsto : null,
      situacao: p.fim ? 'completa' : concluida || (ordemDe.get(p.etapaId) ?? Infinity) <= ultimaAlcancada ? 'sem_saida' : 'em_curso',
    })
  }
  const linhasEmOrdem = ordenarPor(linhas, (l) => l.chegada)
  const completas = linhasEmOrdem.filter((l) => l.situacao === 'completa')
  const paradoMin = completas.reduce((s, l) => s + (l.realMin ?? 0), 0)

  // ----- Ocorrências -----
  const ocorrencias: Ocorrencia[] = []
  const incluidas = new Map(eventos.flatMap((e) => (e.tipo === 'parada_incluida' ? [[e.id, e] as const] : [])))
  const localAtual = new Map<string, string | null>(plano.etapas.map((e) => [e.id, e.localId]))
  for (const e of ordenados) if (e.tipo === 'parada_incluida') localAtual.set(e.etapaId, e.dados.localId)
  const localNovoNaMesmaHora = (etapaId: string, localId: string, horario: Instante) =>
    ordenados.some((x) => x.tipo === 'local_incluido' && x.etapaId === etapaId && x.dados.localId === localId && diferencaMin(x.horarioFato, horario) === 0)
  const correndo = new Map<string, string | null>(localAtual)
  for (const e of ordenados) {
    switch (e.tipo) {
      case 'imprevisto':
        ocorrencias.push({ tipo: 'imprevisto', horario: e.horarioFato, categoria: e.dados.categoria, texto: e.observacao ?? '' })
        break
      case 'observacao':
        ocorrencias.push({ tipo: 'observacao', horario: e.horarioFato, texto: opcoes.incluirObservacoes ? e.dados.texto : null })
        break
      case 'troca_local': {
        const de = correndo.get(e.etapaId) ?? null
        correndo.set(e.etapaId, e.dados.localId)
        if (!localNovoNaMesmaHora(e.etapaId, e.dados.localId, e.horarioFato)) {
          ocorrencias.push({ tipo: 'troca_local', horario: e.horarioFato, etapaId: e.etapaId, deLocalId: de, paraLocalId: e.dados.localId })
        }
        break
      }
      case 'local_incluido': {
        const trocado = ordenados.some((x) => x.tipo === 'troca_local' && x.etapaId === e.etapaId && x.dados.localId === e.dados.localId && diferencaMin(x.horarioFato, e.horarioFato) === 0)
        ocorrencias.push({ tipo: 'local_novo', horario: e.horarioFato, etapaId: e.etapaId, localId: e.dados.localId, trocado })
        break
      }
      case 'parada_incluida':
        ocorrencias.push({
          tipo: 'parada_incluida',
          horario: e.horarioFato,
          etapaId: e.etapaId,
          apos: e.dados.apos,
          localId: e.dados.localId,
          categoria: e.dados.categoria,
          ...(e.dados.motivo ? { motivo: e.dados.motivo } : {}),
          permanenciaMin: e.dados.permanenciaMin,
        })
        break
      case 'inclusao_cancelada':
        ocorrencias.push({ tipo: 'inclusao_cancelada', horario: e.horarioFato, etapaId: e.etapaId, localId: incluidas.get(e.dados.eventoId)?.dados.localId ?? null })
        break
      case 'pular_etapa':
        ocorrencias.push({ tipo: 'etapa_pulada', horario: e.horarioFato, etapaId: e.etapaId })
        break
      default:
        break
    }
  }
  for (const l of linhasEmOrdem) {
    if (l.tipo !== 'nao_planejada') continue
    ocorrencias.push({
      tipo: 'parada_nao_planejada',
      horario: l.chegada,
      etapaId: l.etapaId,
      ...(l.motivo ? { motivo: l.motivo } : {}),
      ...(l.onde ? { onde: l.onde } : {}),
      realMin: l.realMin,
      previstoMin: l.planejadoMin,
      aberta: l.saida === null,
    })
  }
  const ocorrenciasEmOrdem = ordenarPor(ocorrencias, (o) => o.horario)

  // ----- Comunicação -----
  const mensagens: MensagemGerada[] = ordenados.flatMap((e) =>
    e.tipo === 'atualizacao_gerada' ? [{ horario: e.horarioFato, previsaoDestino: e.dados.previsaoDestino, atrasoMin: e.dados.atrasoMin }] : [],
  )
  const recalibracoes = ordenados.filter((e) => e.tipo === 'recalibracao' && idsDasEtapas.has(e.etapaId))
  const atualizacoes = {
    digitadas: recalibracoes.filter((e) => e.tipo === 'recalibracao' && e.dados.origem !== 'localizacao').length,
    pelaLocalizacao: recalibracoes.filter((e) => e.tipo === 'recalibracao' && e.dados.origem === 'localizacao' && !e.dados.automatica).length,
    automaticas: recalibracoes.filter((e) => e.tipo === 'recalibracao' && e.dados.origem === 'localizacao' && e.dados.automatica).length,
  }

  // ----- Passageiros -----
  const status = new Map<string, StatusPassageiro>(passageiros.map((p) => [p.id, p.status]))
  for (const e of ordenados) if (e.tipo === 'status_passageiro') status.set(e.dados.passageiroId, e.dados.status)
  const conferencias = ordenados.filter((e) => e.tipo === 'conferencia')
  const conferidos = new Set(conferencias.flatMap((e) => (e.tipo === 'conferencia' ? e.dados.confirmados : [])))
  // "Quem desceu": a marcação mais recente de cada parada (etapa e lugar) substitui a anterior.
  const marcacoes = new Map<string, string[]>()
  for (const e of ordenados) if (e.tipo === 'desceram') marcacoes.set(`${e.etapaId}|${e.dados.local}`, e.dados.passageiroIds)
  const desceram = new Set([...marcacoes.values()].flat())
  const cadastrados = new Set(passageiros.map((p) => p.id))
  const chegaram =
    concluida && destino
      ? new Set(passageirosEmTransito(destino.id, etapas, passageiros, eventos).map((p) => p.id).filter((id) => !desceram.has(id)))
      : null
  const naoEmbarcaram = passageiros.filter((p) => status.get(p.id) === 'nao_embarcou').length
  const sairam = passageiros.filter((p) => status.get(p.id) === 'saiu_da_viagem').length

  const situacaoDe = (p: Passageiro): SituacaoDoPassageiro => {
    const s = status.get(p.id)
    if (s === 'nao_embarcou') return 'nao_embarcou'
    if (s === 'saiu_da_viagem') return 'saiu_da_viagem'
    if (desceram.has(p.id)) return 'desceu'
    return chegaram?.has(p.id) ? 'chegou' : 'em_viagem'
  }

  return {
    viagemId: plano.viagem.id,
    nome: plano.viagem.nome,
    tipo: plano.viagem.tipo,
    dataSaida: plano.viagem.dataSaida,
    ...(plano.viagem.identificacao ? { identificacao: plano.viagem.identificacao } : {}),
    ...(plano.viagem.equipe ? { equipe: plano.viagem.equipe } : {}),
    status: plano.viagem.status,
    emAndamento: !concluida,
    geradoEm: agora,
    restaurada: restaurado?.viagemIds.includes(plano.viagem.id) ? { geradoEm: restaurado.geradoEm, restauradoEm: restaurado.restauradoEm } : null,
    opcoes,
    resumo,
    permanencias: {
      linhas: linhasEmOrdem,
      totais: {
        paradoMin,
        movimentoMin: duracaoTotalMin === null ? null : Math.max(0, duracaoTotalMin - paradoMin),
        completas: completas.length,
        semSaida: linhasEmOrdem.filter((l) => l.situacao === 'sem_saida').length,
        emCurso: linhasEmOrdem.filter((l) => l.situacao === 'em_curso').length,
      },
    },
    atraso,
    ocorrencias: ocorrenciasEmOrdem,
    comunicacao: { mensagens, atualizacoes },
    passageiros: {
      contagem: {
        cadastrados: cadastrados.size,
        conferidos: [...conferidos].filter((id) => cadastrados.has(id)).length,
        conferencias: {
          total: conferencias.length,
          completas: conferencias.filter((e) => e.tipo === 'conferencia' && e.dados.resultado === 'completa').length,
          porContagem: conferencias.filter((e) => e.tipo === 'conferencia' && e.dados.resultado === 'completa_por_contagem').length,
          incompletas: conferencias.filter((e) => e.tipo === 'conferencia' && e.dados.resultado === 'incompleta').length,
        },
        desceram: [...desceram].filter((id) => cadastrados.has(id)).length,
        naoEmbarcaram,
        sairamDaViagem: sairam,
        chegaram: chegaram ? chegaram.size : null,
      },
      lista: opcoes.incluirNomes
        ? passageiros.map((p) => ({ nome: p.nome, etapaEmbarqueId: p.etapaEmbarqueId, etapaDesembarqueId: p.etapaDesembarqueId, situacao: situacaoDe(p) }))
        : null,
    },
  }
}
