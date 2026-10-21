// Conferência de passageiros ("Passageiros e conferência"). Funções puras: a tela guarda
// o estado e chama estas funções; só o resultado final vira evento.

import type { ConteudoEvento } from './eventos'
import { contagemRapida, passageirosEmTransito, passageirosEsperados } from './passageiros'
import { ordenarEtapas } from './trechos'
import type {
  Conferencia,
  DadosPlano,
  Etapa,
  Evento,
  Instante,
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
): EstadoConferencia {
  const todos = ctx.esperados.map((p) => p.id)
  if (modo === 'todos_desceram') return { modo, confirmados: [], porContagem: false }
  const ehEmbarque = ctx.momento === 'saida' && etapa.tipo === 'obrigatoria' && modoPadrao(etapa, 'saida') === modo
  if (!ehEmbarque) return { modo, confirmados: todos, porContagem: false }
  const ordem = new Map(ordenarEtapas(etapas).map((e, i) => [e.id, i]))
  const aqui = ordem.get(ctx.etapaId)!
  const aBordo = ctx.esperados.filter((p) => (ordem.get(p.etapaEmbarqueId) ?? Infinity) < aqui)
  return { modo, confirmados: aBordo.map((p) => p.id), porContagem: false }
}

// ---------- Operações ----------

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
  if (passageiros.length === 0 || situacao.situacao === 'chegamos') return null
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
