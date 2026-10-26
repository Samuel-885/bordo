// Plano base dos "Casos de teste do recálculo". Nomes de locais e passageiros são fictícios.

import { expect } from 'vitest'
import { criarEvento, type ConteudoEvento } from '../eventos'
import { calcularPlanoOriginal } from '../previsao'
import { diferencaMin, instante, naHoraDoDia } from '../tempo'
import type {
  DadosPlano,
  Etapa,
  EstadoEtapa,
  EstadoViagem,
  Evento,
  Instante,
  Local,
  MotivoParada,
  Passageiro,
  PlanoOriginal,
  StatusPassageiro,
  Trecho,
} from '../tipos'

const MEIA_NOITE = instante('2026-11-14T00:00:00-03:00')

/** Horário no dia da viagem (14/11/2026), ou `dias` depois. */
export function h(hora: string, dias = 0): Instante {
  return naHoraDoDia(MEIA_NOITE, hora, dias)
}

const VIAGEM_ID = 'viagem-teste'

function local(id: string, nome: string, cidade: string, extra: Partial<Local> = {}): Local {
  return { id, nome, cidade, tipo: 'parada', onibusPara: 'sim', ...extra }
}

export const LOCAIS: Local[] = [
  local('l-saida', 'Ponto de saída', 'Ipatinga'),
  local('l-monlevade', 'Ponto de embarque', 'João Monlevade'),
  local('l-rest-a', 'Restaurante A', 'Cidade do almoço'),
  local('l-rest-b', 'Restaurante B', 'Cidade do almoço'),
  local('l-rest-c', 'Restaurante C', 'Cidade do almoço'),
  local('l-cafe', 'Lanchonete do café', 'Cidade do café'),
  local('l-jantar', 'Restaurante do jantar', 'Cidade do jantar'),
  local('l-chegada', 'Ponto de chegada', 'Ribeirão Preto'),
]

function etapa(
  id: string,
  ordem: number,
  tipo: Etapa['tipo'],
  localId: string,
  chegadaRoteiro: Instante,
  permanenciaMin: number,
  extra: Partial<Etapa> = {},
): Etapa {
  return { id, viagemId: VIAGEM_ID, ordem, tipo, localId, alternativas: [], permanenciaMin, chegadaRoteiro, ...extra }
}

/**
 * Saída de Ipatinga 06:30; Monlevade 08:25, 15 min; almoço 12:00, 60 min;
 * café 16:00, 30 min; jantar 20:30, 50 min; Ribeirão Preto 23:30.
 * Trechos (pelo roteiro): 1h55, 3h20, 3h00, 4h00 e 2h10.
 */
export const ETAPAS: Etapa[] = [
  etapa('origem', 1, 'origem', 'l-saida', h('06:30'), 0),
  etapa('monlevade', 2, 'obrigatoria', 'l-monlevade', h('08:25'), 15),
  etapa('almoco', 3, 'flexivel', 'l-rest-a', h('12:00'), 60, { alternativas: ['l-rest-b', 'l-rest-c'] }),
  etapa('cafe', 4, 'flexivel', 'l-cafe', h('16:00'), 30),
  etapa('jantar', 5, 'flexivel', 'l-jantar', h('20:30'), 50),
  etapa('destino', 6, 'destino', 'l-chegada', h('23:30'), 0),
]

export const PLANO: DadosPlano = {
  viagem: {
    id: VIAGEM_ID,
    nome: 'Viagem de teste',
    tipo: 'ida',
    dataSaida: h('06:30'),
    status: 'em_andamento',
    fatorOnibus: 1.15,
    planoOriginal: null,
  },
  etapas: ETAPAS,
  locais: LOCAIS,
  trechos: [],
}

export function congelar(d: DadosPlano = PLANO): PlanoOriginal {
  const r = calcularPlanoOriginal(d, h('06:00'))
  if (!r.ok) throw new Error(`Plano não calculável: ${JSON.stringify(r.bloqueios)}`)
  return r.plano
}

// ---------- Eventos ----------

let sequencia = 0
function criar(horario: Instante, conteudo: ConteudoEvento): Evento {
  sequencia += 1
  return criarEvento({ id: `ev-${sequencia}`, viagemId: VIAGEM_ID, horarioFato: horario, registradoEm: horario, sequencia }, conteudo)
}

export const ev = {
  inicio: (horario: Instante) => criar(horario, { tipo: 'inicio' }),
  fim: (horario: Instante) => criar(horario, { tipo: 'fim' }),
  saida: (etapaId: string, horario: Instante) => criar(horario, { tipo: 'saida', etapaId }),
  chegada: (etapaId: string, horario: Instante) => criar(horario, { tipo: 'chegada', etapaId }),
  pular: (etapaId: string, horario: Instante) => criar(horario, { tipo: 'pular_etapa', etapaId }),
  troca: (etapaId: string, localId: string, horario: Instante) =>
    criar(horario, { tipo: 'troca_local', etapaId, dados: { localId } }),
  incluirParada: (etapaId: string, dados: Extract<ConteudoEvento, { tipo: 'parada_incluida' }>['dados'], horario: Instante) =>
    criar(horario, { tipo: 'parada_incluida', etapaId, dados }),
  localIncluido: (etapaId: string, dados: { localId: string; trechos: Trecho[] }, horario: Instante) =>
    criar(horario, { tipo: 'local_incluido', etapaId, dados }),
  cancelarInclusao: (etapaId: string, eventoId: string, horario: Instante) =>
    criar(horario, { tipo: 'inclusao_cancelada', etapaId, dados: { eventoId } }),
  recalibracao: (etapaId: string, informado: Instante, horario: Instante) =>
    criar(horario, { tipo: 'recalibracao', etapaId, dados: { horario: informado } }),
  recalibracaoPelaLocalizacao: (etapaId: string, informado: Instante, calculadoEm: Instante, horario: Instante) =>
    criar(horario, { tipo: 'recalibracao', etapaId, dados: { horario: informado, origem: 'localizacao', calculadoEm } }),
  recalibracaoAutomatica: (etapaId: string, informado: Instante, calculadoEm: Instante, horario: Instante) =>
    criar(horario, { tipo: 'recalibracao', etapaId, dados: { horario: informado, origem: 'localizacao', calculadoEm, automatica: true } }),
  parada: (
    etapaId: string,
    fase: 'inicio' | 'fim' | 'previsao',
    horario: Instante,
    extra: { motivo?: MotivoParada; onde?: string; tempoPrevistoMin?: number } = {},
  ) => criar(horario, { tipo: 'parada_nao_planejada', etapaId, dados: { fase, ...extra } }),
  /** Conferência completa de todos (os ids não importam para quem só olha o horário). */
  conferencia: (etapaId: string, horario: Instante, momento?: 'saida' | 'volta', confirmados: string[] = []) =>
    criar(horario, {
      tipo: 'conferencia',
      etapaId,
      dados: { ...(momento ? { momento } : {}), modo: 'so_alguns', confirmados, pendentes: [], resultado: 'completa' },
    }),
  imprevisto: (categoria: Extract<ConteudoEvento, { tipo: 'imprevisto' }>['dados']['categoria'], horario: Instante, observacao?: string) =>
    criar(horario, { tipo: 'imprevisto', dados: { categoria }, ...(observacao ? { observacao } : {}) } as ConteudoEvento),
  desceram: (etapaId: string, local: 'etapa' | 'nao_planejada', passageiroIds: string[], horario: Instante) =>
    criar(horario, { tipo: 'desceram', etapaId, dados: { local, passageiroIds } }),
  status: (etapaId: string, passageiroId: string, status: StatusPassageiro, motivo: string, horario: Instante) =>
    criar(horario, { tipo: 'status_passageiro', etapaId, dados: { passageiroId, status, motivo } }),
  atualizacao: (horario: Instante, previsaoDestino: Instante | null = null, atrasoMin: number | null = null) =>
    criar(horario, { tipo: 'atualizacao_gerada', dados: { previsaoDestino, atrasoMin } }),
  observacao: (texto: string, horario: Instante) => criar(horario, { tipo: 'observacao', dados: { texto } }),
}

/** Cadeia dos casos 1 → 2 → 3. */
export const EVENTOS_CASO_1: Evento[] = [ev.inicio(h('06:00')), ev.saida('origem', h('06:47'))]
export const EVENTOS_CASO_2: Evento[] = [...EVENTOS_CASO_1, ev.chegada('monlevade', h('08:55'))]
export const EVENTOS_CASO_3: Evento[] = [...EVENTOS_CASO_2, ev.saida('monlevade', h('09:14'))]

// ---------- Passageiros ----------

function passageiro(n: number, etapaEmbarqueId: string): Passageiro {
  const id = `p-${String(n).padStart(2, '0')}`
  return { id, viagemId: VIAGEM_ID, nome: `Passageiro ${String(n).padStart(2, '0')}`, etapaEmbarqueId, etapaDesembarqueId: null, status: 'ativo' }
}

/** 35 embarcam em Ipatinga e 3 em Monlevade. */
export const PASSAGEIROS: Passageiro[] = [
  ...Array.from({ length: 35 }, (_, i) => passageiro(i + 1, 'origem')),
  ...Array.from({ length: 3 }, (_, i) => passageiro(36 + i, 'monlevade')),
]

// ---------- Asserções ----------

export function etapaDe(estado: EstadoViagem, etapaId: string): EstadoEtapa {
  const e = estado.etapas.find((x) => x.etapaId === etapaId)
  if (!e) throw new Error(`Etapa ausente no estado: ${etapaId}`)
  return e
}

/** Compara horários pelo valor numérico, mostrando o horário obtido se falhar. */
export function esperarHorario(obtido: Instante | null | undefined, esperado: Instante): void {
  expect(obtido, `esperado ${esperado}`).toBeTruthy()
  expect({ obtido, diferencaMin: diferencaMin(obtido!, esperado) }).toEqual({ obtido, diferencaMin: 0 })
}

/** Trechos manuais entre os locais do almoço (B e C) e os vizinhos; o A usa o roteiro. */
export const TRECHOS_DAS_ALTERNATIVAS: Trecho[] = [
  { etapaOrigemId: 'monlevade', localOrigemId: 'l-monlevade', etapaDestinoId: 'almoco', localDestinoId: 'l-rest-b', duracaoMin: 220, fonte: 'manual' },
  { etapaOrigemId: 'monlevade', localOrigemId: 'l-monlevade', etapaDestinoId: 'almoco', localDestinoId: 'l-rest-c', duracaoMin: 250, fonte: 'manual' },
  { etapaOrigemId: 'almoco', localOrigemId: 'l-rest-b', etapaDestinoId: 'cafe', localDestinoId: 'l-cafe', duracaoMin: 180, fonte: 'manual' },
  { etapaOrigemId: 'almoco', localOrigemId: 'l-rest-c', etapaDestinoId: 'cafe', localDestinoId: 'l-cafe', duracaoMin: 180, fonte: 'manual' },
]
