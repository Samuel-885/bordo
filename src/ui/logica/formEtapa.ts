// Modelo do formulário de etapa: valores em texto como nos campos da tela, a
// conversão de e para `Etapa` e as validações. Sem React.

import { normalizarOrdem } from '../../core/ordem'
import { estadosDoPlano } from '../../core/previsao'
import { somarMinutos } from '../../core/tempo'
import type { DadosPlano, Etapa, EstadoEtapa, HoraDoDia, Instante, TipoEtapa } from '../../core/tipos'
import { formatarHora, referenciaAnterior, resolverHora, resolverJanela } from './horarios'
import { PERMANENCIAS_MIN } from './rotulos'

export interface FormEtapa {
  tipo: TipoEtapa
  /** Origem, ponto obrigatório e destino. */
  localId: string
  motivo: string
  categoria: string
  /** Origem: saída. Demais: chegada prevista (opcional). */
  hora: HoraDoDia
  permanenciaMin: number
  janelaInicio: HoraDoDia
  janelaFim: HoraDoDia
  /** Parada flexível: todos os candidatos, inclusive o preferido. */
  candidatos: string[]
  preferido: string
}

export function formularioVazio(tipo: TipoEtapa = 'flexivel'): FormEtapa {
  return {
    tipo,
    localId: '',
    motivo: '',
    categoria: '',
    hora: '',
    permanenciaMin: tipo === 'obrigatoria' ? 15 : 30,
    janelaInicio: '',
    janelaFim: '',
    candidatos: [],
    preferido: '',
  }
}

export function formularioDaEtapa(e: Etapa): FormEtapa {
  const candidatos = e.tipo === 'flexivel' ? [...(e.localId ? [e.localId] : []), ...e.alternativas] : []
  return {
    tipo: e.tipo,
    localId: e.tipo === 'flexivel' ? '' : (e.localId ?? ''),
    motivo: e.motivo ?? '',
    categoria: e.categoria ?? '',
    hora: e.chegadaRoteiro ? formatarHora(e.chegadaRoteiro) : '',
    permanenciaMin: e.permanenciaMin,
    janelaInicio: e.janelaInicio ? formatarHora(e.janelaInicio) : '',
    janelaFim: e.janelaFim ? formatarHora(e.janelaFim) : '',
    candidatos,
    preferido: e.tipo === 'flexivel' ? (e.localId ?? '') : '',
  }
}

/** Troca de tipo no select: mantém o que serve e começa limpo no resto. */
export function trocarTipo(f: FormEtapa, tipo: TipoEtapa): FormEtapa {
  if (tipo === f.tipo) return f
  const permanenciaMin = tipo === 'origem' || tipo === 'destino' ? 0 : f.permanenciaMin > 0 ? f.permanenciaMin : tipo === 'obrigatoria' ? 15 : 30
  return {
    ...formularioVazio(tipo),
    permanenciaMin,
    hora: f.hora,
    localId: tipo === 'flexivel' ? '' : f.localId || f.preferido,
    candidatos: tipo === 'flexivel' ? (f.localId ? [f.localId] : []) : [],
    preferido: tipo === 'flexivel' ? f.localId : '',
  }
}

// ---------- Alternativas da parada flexível ----------

export function adicionarCandidato(f: FormEtapa, localId: string): FormEtapa {
  if (!localId || f.candidatos.includes(localId)) return f
  const candidatos = [...f.candidatos, localId]
  return { ...f, candidatos, preferido: f.preferido || localId }
}

/** Remove um candidato; se era o preferido, o primeiro que sobrar passa a ser. */
export function removerCandidato(f: FormEtapa, localId: string): FormEtapa {
  const candidatos = f.candidatos.filter((c) => c !== localId)
  const preferido = f.preferido === localId ? (candidatos[0] ?? '') : f.preferido
  return { ...f, candidatos, preferido }
}

// ---------- Validação ----------

export type ErrosEtapa = Partial<Record<'local' | 'motivo' | 'categoria' | 'janela' | 'permanencia', string>>

export function validarFormulario(f: FormEtapa): ErrosEtapa {
  const erros: ErrosEtapa = {}
  if (f.tipo !== 'flexivel' && !f.localId) erros.local = 'Escolha o local.'
  if (f.tipo === 'obrigatoria' && !f.motivo) erros.motivo = 'Escolha o motivo.'
  if (f.tipo === 'flexivel') {
    if (!f.categoria) erros.categoria = 'Escolha a categoria.'
    if (Boolean(f.janelaInicio) !== Boolean(f.janelaFim)) erros.janela = 'Preencha o início e o fim da janela, ou deixe os dois vazios.'
  }
  if ((f.tipo === 'obrigatoria' || f.tipo === 'flexivel') && !(Number.isInteger(f.permanenciaMin) && f.permanenciaMin >= 1)) {
    erros.permanencia = 'A permanência precisa ser de pelo menos 1 minuto.'
  }
  return erros
}

export const permanenciaEhDaLista = (min: number): boolean => (PERMANENCIAS_MIN as readonly number[]).includes(min)

// ---------- Conversão para Etapa ----------

export interface ContextoEtapa {
  id: string
  viagemId: string
  dataSaida: Instante
  /** Posição atual, ao editar uma etapa existente. Vazio: etapa nova, que entra antes do destino. */
  ordem?: number
  /** As outras etapas da viagem (sem esta). */
  outras: readonly Etapa[]
}

export interface MudancaDeDia {
  campo: 'chegada' | 'janelaFim'
  /** Horário já resolvido, para a tela explicar. */
  instante: Instante
}

export interface EtapaDoFormulario {
  etapa: Etapa
  /** Horários que viram o dia: a tela mostra "+1 dia" e pede confirmação. */
  viradas: MudancaDeDia[]
}

/**
 * Monta a etapa. A data de cada horário vem da etapa anterior que tem horário no
 * roteiro (ou da data de saída da viagem); a janela, do dia da chegada.
 */
export function etapaDoFormulario(f: FormEtapa, ctx: ContextoEtapa): EtapaDoFormulario {
  const sem: Etapa = {
    id: ctx.id,
    viagemId: ctx.viagemId,
    ordem: ctx.ordem ?? Number.MAX_SAFE_INTEGER,
    tipo: f.tipo,
    localId: null,
    alternativas: [],
    permanenciaMin: f.tipo === 'origem' || f.tipo === 'destino' ? 0 : f.permanenciaMin,
  }
  const lista = normalizarOrdem([...ctx.outras, sem])
  const indice = lista.findIndex((e) => e.id === ctx.id)
  const referencia = referenciaAnterior(lista, indice, ctx.dataSaida)

  const etapa: Etapa = { ...sem, ordem: indice + 1 }
  const viradas: MudancaDeDia[] = []

  if (f.hora) {
    if (f.tipo === 'origem') {
      etapa.chegadaRoteiro = resolverHora(f.hora, referencia).instante
    } else {
      const r = resolverHora(f.hora, referencia)
      etapa.chegadaRoteiro = r.instante
      if (r.viraDia) viradas.push({ campo: 'chegada', instante: r.instante })
    }
  }

  if (f.tipo === 'flexivel') {
    etapa.localId = f.preferido || null
    etapa.alternativas = f.candidatos.filter((c) => c !== f.preferido)
    etapa.categoria = f.categoria
    if (f.janelaInicio && f.janelaFim) {
      const j = resolverJanela(f.janelaInicio, f.janelaFim, etapa.chegadaRoteiro ?? referencia)
      etapa.janelaInicio = j.inicio
      etapa.janelaFim = j.fim
      if (j.atravessaMeiaNoite) viradas.push({ campo: 'janelaFim', instante: j.fim })
    }
  } else {
    etapa.localId = f.localId || null
    if (f.tipo === 'obrigatoria') etapa.motivo = f.motivo
  }
  return { etapa, viradas }
}

/** Saída da origem: a hora é a própria saída, no dia da viagem. */
export function previaDaEtapa(
  dados: DadosPlano,
  etapa: Etapa,
): { chegada: Instante | null; saida: Instante | null; estado: EstadoEtapa | undefined } {
  const outras = dados.etapas.filter((e) => e.id !== etapa.id)
  const etapas = normalizarOrdem([...outras, etapa])
  const estado = estadosDoPlano({ ...dados, etapas }).find((e) => e.etapaId === etapa.id)
  const saida =
    estado?.saida?.instante ?? (etapa.chegadaRoteiro && etapa.tipo !== 'destino' ? somarMinutos(etapa.chegadaRoteiro, etapa.permanenciaMin) : null)
  return { chegada: estado?.chegada?.instante ?? null, saida, estado }
}
