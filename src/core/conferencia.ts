// Conferência de passageiros ("Passageiros e conferência"). Funções puras: a tela guarda
// o estado e chama estas funções; só o resultado final vira evento.

import type { ConteudoEvento } from './eventos'
import { contagemRapida, passageirosABordoNaParada, passageirosEmTransito, passageirosEsperados } from './passageiros'
import { ordenarEtapas } from './trechos'
import type {
  Conferencia,
  DadosPlano,
  Etapa,
  Evento,
  Instante,
  LocalDaDescida,
  ModoConferencia,
  MomentoConferencia,
  Passageiro,
  ResultadoConferencia,
  StatusPassageiro,
} from './tipos'

const ordemAlfabetica = (a: Passageiro, b: Passageiro) => a.nome.localeCompare(b.nome, 'pt-BR')

/** O que se confere: a saída de uma etapa ou a volta à estrada (a conferência leva a próxima etapa). */
export interface ContextoConferencia {
  momento: MomentoConferencia
  /** Saída: a etapa de onde saímos. Volta: a próxima etapa, a que a parada está ligada. */
  etapaId: string
  esperados: Passageiro[]
}

export function contextoDeSaida(
  etapaId: string,
  d: Pick<DadosPlano, 'etapas'>,
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
): ContextoConferencia {
  return { momento: 'saida', etapaId, esperados: passageirosEsperados(etapaId, d.etapas, passageiros, eventos) }
}

/** Depois de VOLTAMOS os esperados são os que seguem a bordo no trecho que chega em `proximaEtapaId`. */
export function contextoDeVolta(
  proximaEtapaId: string,
  d: Pick<DadosPlano, 'etapas'>,
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
): ContextoConferencia {
  return { momento: 'volta', etapaId: proximaEtapaId, esperados: passageirosEmTransito(proximaEtapaId, d.etapas, passageiros, eventos) }
}

// ---------- Estado inicial ----------

const MODO_POR_CATEGORIA: Record<string, ModoConferencia> = {
  almoco: 'todos_desceram',
  cafe: 'todos_desceram',
  jantar: 'todos_desceram',
  visita: 'todos_desceram',
  refeicao: 'todos_desceram',
  abastecimento: 'so_alguns',
  outro: 'so_alguns',
  banheiro: 'so_alguns',
  descanso: 'so_alguns',
}

/**
 * Modo em que a conferência abre. `modoConferencia` da etapa, se definido, manda;
 * senão: volta, banheiro, descanso, ponto obrigatório e parada sem categoria = "só alguns";
 * origem e refeições = "todos desceram".
 */
export function modoPadrao(etapa: Pick<Etapa, 'tipo' | 'categoria' | 'modoConferencia'>, momento: MomentoConferencia): ModoConferencia {
  if (momento === 'volta') return 'so_alguns'
  if (etapa.modoConferencia) return etapa.modoConferencia
  if (etapa.tipo === 'origem') return 'todos_desceram'
  if (etapa.categoria && MODO_POR_CATEGORIA[etapa.categoria]) return MODO_POR_CATEGORIA[etapa.categoria]!
  return 'so_alguns'
}

/** Almoço, café e jantar: o padrão já é "todos desceram", então a marcação não abre sozinha. */
export function ehRefeicao(categoria: string | undefined): boolean {
  return categoria !== undefined && MODO_POR_CATEGORIA[categoria] === 'todos_desceram'
}

/** O CHEGAMOS oferece "Quem desceu?" em toda parada, exceto no destino e nas refeições. */
export function oferecerDescidaAoChegar(etapa: Pick<Etapa, 'tipo' | 'categoria'>): boolean {
  return etapa.tipo !== 'destino' && etapa.tipo !== 'origem' && !ehRefeicao(etapa.categoria)
}

export interface EstadoConferencia {
  modo: ModoConferencia
  confirmados: string[]
  /** Verdadeiro quando a contagem rápida confirmou todos e ninguém foi mexido depois. */
  porContagem: boolean
}

/**
 * Estado ao abrir (ou ao trocar o modo, que reinicia a lista). No modo padrão de um ponto
 * obrigatório, quem já estava a bordo fica confirmado e quem embarca ali, pendente. No de
 * outro modo: "todos desceram" = todos pendentes; "só alguns" = todos confirmados.
 */
export function iniciarConferencia(
  ctx: ContextoConferencia,
  etapas: readonly Etapa[],
  modo: ModoConferencia,
  etapa: Pick<Etapa, 'tipo' | 'categoria' | 'modoConferencia'>,
  /**
   * Marcação de quem desceu na parada, se houver: só esses ficam pendentes e os demais
   * (que já estavam a bordo) são confirmados. "Todos" equivale a "todos desceram".
   */
  desceram: readonly string[] | null = null,
): EstadoConferencia {
  const todos = ctx.esperados.map((p) => p.id)
  const base = estadoBase(ctx, etapas, modo, etapa, todos)
  if (desceram === null) return base
  const confirmados = (modo === 'todos_desceram' ? todos : base.confirmados).filter((id) => !desceram.includes(id))
  return { ...base, confirmados }
}

function estadoBase(
  ctx: ContextoConferencia,
  etapas: readonly Etapa[],
  modo: ModoConferencia,
  etapa: Pick<Etapa, 'tipo' | 'categoria' | 'modoConferencia'>,
  todos: string[],
): EstadoConferencia {
  if (modo === 'todos_desceram') return { modo, confirmados: [], porContagem: false }
  const ehEmbarque = ctx.momento === 'saida' && etapa.tipo === 'obrigatoria' && modoPadrao(etapa, 'saida') === modo
  if (!ehEmbarque) return { modo, confirmados: todos, porContagem: false }
  const ordem = new Map(ordenarEtapas(etapas).map((e, i) => [e.id, i]))
  const aqui = ordem.get(ctx.etapaId)!
  const aBordo = ctx.esperados.filter((p) => (ordem.get(p.etapaEmbarqueId) ?? Infinity) < aqui)
  return { modo, confirmados: aBordo.map((p) => p.id), porContagem: false }
}

// ---------- Operações ----------

/**
 * Troca o modo: reinicia a lista no estado do novo modo (sem a marcação de quem desceu).
 * Tocar no modo que já está selecionado não faz nada: devolve o mesmo estado.
 */
export function trocarModo(
  ctx: ContextoConferencia,
  etapas: readonly Etapa[],
  estado: EstadoConferencia,
  modo: ModoConferencia,
  etapa: Pick<Etapa, 'tipo' | 'categoria' | 'modoConferencia'>,
): EstadoConferencia {
  if (modo === estado.modo) return estado
  return iniciarConferencia(ctx, etapas, modo, etapa)
}

export function alternarPassageiro(estado: EstadoConferencia, passageiroId: string): EstadoConferencia {
  const confirmados = estado.confirmados.includes(passageiroId)
    ? estado.confirmados.filter((id) => id !== passageiroId)
    : [...estado.confirmados, passageiroId]
  return { ...estado, confirmados, porContagem: false }
}

export function pendentesDa(ctx: ContextoConferencia, estado: EstadoConferencia): Passageiro[] {
  return ctx.esperados.filter((p) => !estado.confirmados.includes(p.id)).sort(ordemAlfabetica)
}

/** Pendentes primeiro, depois os confirmados, cada grupo em ordem alfabética. */
export function listaParaTela(ctx: ContextoConferencia, estado: EstadoConferencia): Array<{ passageiro: Passageiro; confirmado: boolean }> {
  const confirmados = ctx.esperados.filter((p) => estado.confirmados.includes(p.id)).sort(ordemAlfabetica)
  return [
    ...pendentesDa(ctx, estado).map((passageiro) => ({ passageiro, confirmado: false })),
    ...confirmados.map((passageiro) => ({ passageiro, confirmado: true })),
  ]
}

export type Quadro =
  | { todosABordo: true; confirmados: number; total: number }
  | { todosABordo: false; confirmados: number; total: number; faltam: string[] }

export function quadroDeSituacao(ctx: ContextoConferencia, estado: EstadoConferencia): Quadro {
  const faltam = pendentesDa(ctx, estado).map((p) => p.nome)
  const total = ctx.esperados.length
  const confirmados = total - faltam.length
  return faltam.length === 0 ? { todosABordo: true, confirmados, total } : { todosABordo: false, confirmados, total, faltam }
}

/** Contagem rápida: igual aos esperados confirma todos; diferente não altera ninguém. */
export function aplicarContagem(
  ctx: ContextoConferencia,
  estado: EstadoConferencia,
  digitado: number,
): { estado: EstadoConferencia; resposta: ReturnType<typeof contagemRapida> } {
  const resposta = contagemRapida(ctx.esperados.length, digitado)
  if (!resposta.completa) return { estado, resposta }
  return { estado: { ...estado, confirmados: ctx.esperados.map((p) => p.id), porContagem: true }, resposta }
}

export function podeSair(ctx: ContextoConferencia, estado: EstadoConferencia): boolean {
  return pendentesDa(ctx, estado).length === 0
}

// ---------- Sair sem todos ----------

export interface DecisaoDePendente {
  passageiroId: string
  status: Exclude<StatusPassageiro, 'ativo'> | null
  motivo: string
}

/** "Sair sem todos": cada pendente precisa de um status e de um motivo. */
export function decisoesCompletas(pendentes: readonly Passageiro[], decisoes: readonly DecisaoDePendente[]): boolean {
  return pendentes.every((p) => {
    const d = decisoes.find((x) => x.passageiroId === p.id)
    return d !== undefined && d.status !== null && d.motivo.trim() !== ''
  })
}

export function resultadoDa(ctx: ContextoConferencia, estado: EstadoConferencia): ResultadoConferencia {
  if (!podeSair(ctx, estado)) return 'incompleta'
  return estado.porContagem ? 'completa_por_contagem' : 'completa'
}

/**
 * Conteúdo dos eventos da conferência, na ordem de gravação: a conferência e, para cada
 * pendente, o status que ele recebeu. A saída (ou o VOLTAMOS) é registrada pelo repositório.
 */
export function eventosDaConferencia(
  ctx: ContextoConferencia,
  estado: EstadoConferencia,
  decisoes: readonly DecisaoDePendente[],
): ConteudoEvento[] {
  const pendentes = pendentesDa(ctx, estado)
  const conferencia: Conferencia = {
    momento: ctx.momento,
    modo: estado.modo,
    confirmados: ctx.esperados.filter((p) => estado.confirmados.includes(p.id)).map((p) => p.id),
    pendentes: pendentes.map((p) => p.id),
    resultado: resultadoDa(ctx, estado),
  }
  const status = pendentes.map((p): ConteudoEvento => {
    const d = decisoes.find((x) => x.passageiroId === p.id)
    if (!d || d.status === null || d.motivo.trim() === '') {
      throw new Error('Cada pendente precisa de um status e de um motivo para sair sem todos.')
    }
    return { tipo: 'status_passageiro', etapaId: ctx.etapaId, dados: { passageiroId: p.id, status: d.status, motivo: d.motivo.trim() } }
  })
  return [{ tipo: 'conferencia', etapaId: ctx.etapaId, dados: conferencia }, ...status]
}

// ---------- Validação dos eventos ----------

type Resultado = { ok: true } | { ok: false; motivo: string }

/** A conferência precisa cobrir exatamente os esperados, sem repetir ninguém. */
export function validarConferencia(c: Conferencia, esperados: readonly Passageiro[]): Resultado {
  const ids = [...c.confirmados, ...c.pendentes]
  const certo =
    ids.length === esperados.length &&
    new Set(ids).size === ids.length &&
    esperados.every((p) => ids.includes(p.id))
  if (!certo) return { ok: false, motivo: 'A conferência não bate com os passageiros esperados a bordo.' }
  const completa = c.pendentes.length === 0
  if (completa !== (c.resultado !== 'incompleta')) {
    return { ok: false, motivo: 'O resultado da conferência não bate com os pendentes.' }
  }
  return { ok: true }
}

/** Só "não embarcou" ou "saiu da viagem", para quem está entre os esperados. */
export function validarStatus(passageiroId: string, status: StatusPassageiro, esperados: readonly Passageiro[]): Resultado {
  if (status === 'ativo') return { ok: false, motivo: 'Use "não embarcou" ou "saiu da viagem".' }
  if (!esperados.some((p) => p.id === passageiroId)) {
    return { ok: false, motivo: 'Este passageiro não está entre os esperados a bordo.' }
  }
  return { ok: true }
}

// ---------- "A bordo" na tela principal ----------

export type ABordo =
  /** Em trânsito: todos os esperados estão conferidos; `conferidoEm` vazio = saída sem conferência. */
  | { tipo: 'conferido'; total: number; conferidoEm: Instante | null }
  /** Parado ou aguardando a saída: ninguém foi conferido ainda. */
  | { tipo: 'esperados'; total: number }
  /** Viagem concluída: quem chegou ao destino, pelo que foi registrado (descidas e mudanças de status), não por contagem. */
  | { tipo: 'chegaram'; total: number }

/**
 * O que a tela principal mostra. Sem passageiros cadastrados, nada. A conferência considerada
 * é a mais recente da saída da última etapa deixada ou da volta à estrada nesse trecho.
 */
export function resumoABordo(
  d: Pick<DadosPlano, 'etapas'>,
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
  situacao: { situacao: string; etapaAtualId: string | null; proximaEtapaId: string | null },
): ABordo | null {
  if (passageiros.length === 0) return null
  if (situacao.situacao === 'chegamos') {
    const destino = ordenarEtapas(d.etapas).findLast((e) => e.tipo === 'destino')
    return destino ? { tipo: 'chegaram', total: passageirosEmTransito(destino.id, d.etapas, passageiros, eventos).length } : null
  }
  if (situacao.etapaAtualId) {
    return { tipo: 'esperados', total: passageirosEsperados(situacao.etapaAtualId, d.etapas, passageiros, eventos).length }
  }
  const proxima = situacao.proximaEtapaId
  if (!proxima) return null
  const ordem = new Map(ordenarEtapas(d.etapas).map((e, i) => [e.id, i]))
  const ultimaSaida = [...eventos]
    .filter((e) => e.tipo === 'saida')
    .sort((a, b) => (b.sequencia ?? 0) - (a.sequencia ?? 0) || (ordem.get(b.etapaId) ?? 0) - (ordem.get(a.etapaId) ?? 0))[0]
  const doTrecho = eventos.filter(
    (e) =>
      e.tipo === 'conferencia' &&
      ((e.dados.momento === 'volta' && e.etapaId === proxima) ||
        (e.dados.momento !== 'volta' && ultimaSaida !== undefined && e.etapaId === ultimaSaida.etapaId)),
  )
  const ultima = doTrecho.sort((a, b) => (a.sequencia ?? 0) - (b.sequencia ?? 0)).at(-1)
  return {
    tipo: 'conferido',
    total: passageirosEmTransito(proxima, d.etapas, passageiros, eventos).length,
    conferidoEm: ultima?.horarioFato ?? null,
  }
}

// ---------- Quem desceu na parada ----------

/** Onde se marca quem desceu: a parada de uma etapa ou a parada não planejada ligada à próxima etapa. */
export interface ContextoDeDescida {
  local: LocalDaDescida
  etapaId: string
  /** Só os esperados a bordo naquele ponto. */
  aBordo: Passageiro[]
}

export function contextoDeDescidaNaEtapa(
  etapaId: string,
  d: Pick<DadosPlano, 'etapas'>,
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
): ContextoDeDescida {
  return { local: 'etapa', etapaId, aBordo: passageirosABordoNaParada(etapaId, d.etapas, passageiros, eventos) }
}

export function contextoDeDescidaNaoPlanejada(
  proximaEtapaId: string,
  d: Pick<DadosPlano, 'etapas'>,
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
): ContextoDeDescida {
  return { local: 'nao_planejada', etapaId: proximaEtapaId, aBordo: passageirosEmTransito(proximaEtapaId, d.etapas, passageiros, eventos) }
}

/**
 * A marcação em vigor na parada: a mais recente. Na parada não planejada só vale a que veio
 * depois do último PARAMOS (um PARAMOS novo começa uma parada nova, sem marcação).
 * Vazio se ninguém marcou; lista vazia = marcou que ninguém desceu.
 */
export function marcacaoDeDescida(eventos: readonly Evento[], local: LocalDaDescida, etapaId: string): string[] | null {
  const seq = (e: Evento) => e.sequencia ?? 0
  const inicioDaParada =
    local === 'nao_planejada'
      ? Math.max(
          0,
          ...eventos.filter((e) => e.tipo === 'parada_nao_planejada' && e.etapaId === etapaId && e.dados.fase === 'inicio').map(seq),
        )
      : 0
  const ultima = eventos
    .filter((e) => e.tipo === 'desceram' && e.dados.local === local && e.etapaId === etapaId && seq(e) > inicioDaParada)
    .sort((a, b) => seq(a) - seq(b))
    .at(-1)
  return ultima?.tipo === 'desceram' ? ultima.dados.passageiroIds : null
}

/** A marcação restrita aos esperados da conferência (quem saiu da viagem no meio não conta). */
export function descidaParaConferencia(ctx: ContextoConferencia, eventos: readonly Evento[]): string[] | null {
  const marcados = marcacaoDeDescida(eventos, ctx.momento === 'saida' ? 'etapa' : 'nao_planejada', ctx.etapaId)
  if (marcados === null) return null
  return ctx.esperados.filter((p) => marcados.includes(p.id)).map((p) => p.id)
}

/** "3 desceram, 32 ficaram no ônibus. Se tiver dúvida, use a contagem rápida." */
export function avisoDaMarcacao(desceram: number, ficaram: number): string {
  const desc = desceram === 1 ? '1 desceu' : `${desceram} desceram`
  const fic = ficaram === 1 ? '1 ficou' : `${ficaram} ficaram`
  return `${desc}, ${fic} no ônibus. Se tiver dúvida, use a contagem rápida.`
}
