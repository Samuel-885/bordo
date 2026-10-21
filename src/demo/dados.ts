// Dados fictícios do modo demonstração. Separados das fixtures de teste e sem
// nenhum dado pessoal real. Os ids levam o prefixo "demo-" como camada extra de
// isolamento; o isolamento real é o banco separado da fase 3.

import { instante, naHoraDoDia } from '../core/tempo'
import type { DadosPlano, Etapa, Instante, Local, Passageiro, Trecho } from '../core/tipos'

/** Prefixo de todo id da demonstração. */
export const ESPACO_DEMO = 'demo-'

export const VIAGEM_DEMO_ID = `${ESPACO_DEMO}viagem`

const MEIA_NOITE = instante('2026-11-14T00:00:00-03:00')

/** Horário no dia da viagem de demonstração (14/11/2026), ou `dias` depois. */
export function horaDemo(hora: string, dias = 0): Instante {
  return naHoraDoDia(MEIA_NOITE, hora, dias)
}

export const ETAPA = {
  origem: `${ESPACO_DEMO}origem`,
  monlevade: `${ESPACO_DEMO}monlevade`,
  almoco: `${ESPACO_DEMO}almoco`,
  cafe: `${ESPACO_DEMO}cafe`,
  jantar: `${ESPACO_DEMO}jantar`,
  destino: `${ESPACO_DEMO}destino`,
} as const

export const LOCAL = {
  saida: `${ESPACO_DEMO}l-saida`,
  monlevade: `${ESPACO_DEMO}l-monlevade`,
  restA: `${ESPACO_DEMO}l-rest-a`,
  restB: `${ESPACO_DEMO}l-rest-b`,
  restC: `${ESPACO_DEMO}l-rest-c`,
  cafe: `${ESPACO_DEMO}l-cafe`,
  jantar: `${ESPACO_DEMO}l-jantar`,
  chegada: `${ESPACO_DEMO}l-chegada`,
} as const

function local(id: string, nome: string, cidade: string, extra: Partial<Local> = {}): Local {
  return { id, nome, cidade, tipo: 'parada', onibusPara: 'sim', ...extra }
}

const ABRE_ALMOCO = '11:00'

const LOCAIS: Local[] = [
  local(LOCAL.saida, 'Ponto de saída', 'Ipatinga'),
  local(LOCAL.monlevade, 'Ponto de embarque', 'João Monlevade'),
  local(LOCAL.restA, 'Restaurante A', 'Cidade do almoço', { abre: ABRE_ALMOCO, fecha: '14:00' }),
  local(LOCAL.restB, 'Restaurante B', 'Cidade do almoço', { abre: ABRE_ALMOCO, fecha: '15:00' }),
  local(LOCAL.restC, 'Restaurante C', 'Cidade do almoço', { abre: ABRE_ALMOCO, fecha: '16:30' }),
  local(LOCAL.cafe, 'Lanchonete do café', 'Cidade do café'),
  local(LOCAL.jantar, 'Restaurante do jantar', 'Cidade do jantar'),
  local(LOCAL.chegada, 'Ponto de chegada', 'Ribeirão Preto'),
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
  return { id, viagemId: VIAGEM_DEMO_ID, ordem, tipo, localId, alternativas: [], permanenciaMin, chegadaRoteiro, ...extra }
}

/**
 * Saída de Ipatinga 06:30; Monlevade 08:25, 15 min; almoço 12:00, 60 min;
 * café 16:00, 30 min; jantar 20:30, 50 min; Ribeirão Preto 23:30.
 */
const ETAPAS: Etapa[] = [
  etapa(ETAPA.origem, 1, 'origem', LOCAL.saida, horaDemo('06:30'), 0),
  etapa(ETAPA.monlevade, 2, 'obrigatoria', LOCAL.monlevade, horaDemo('08:25'), 15),
  etapa(ETAPA.almoco, 3, 'flexivel', LOCAL.restA, horaDemo('12:00'), 60, {
    alternativas: [LOCAL.restB, LOCAL.restC],
  }),
  etapa(ETAPA.cafe, 4, 'flexivel', LOCAL.cafe, horaDemo('16:00'), 30),
  etapa(ETAPA.jantar, 5, 'flexivel', LOCAL.jantar, horaDemo('20:30'), 50),
  etapa(ETAPA.destino, 6, 'destino', LOCAL.chegada, horaDemo('23:30'), 0),
]

function trecho(etapaOrigemId: string, localOrigemId: string, etapaDestinoId: string, localDestinoId: string, duracaoMin: number): Trecho {
  return { etapaOrigemId, localOrigemId, etapaDestinoId, localDestinoId, duracaoMin, fonte: 'manual' }
}

/**
 * Trechos das alternativas do almoço (as preferidas usam o roteiro). Valores
 * fictícios: Monlevade → A é pelo roteiro (3h20); B 3h40 e C 4h10. De B e C até o
 * café, 3h, o mesmo tempo que o roteiro dá de A.
 */
const TRECHOS: Trecho[] = [
  trecho(ETAPA.monlevade, LOCAL.monlevade, ETAPA.almoco, LOCAL.restB, 220),
  trecho(ETAPA.monlevade, LOCAL.monlevade, ETAPA.almoco, LOCAL.restC, 250),
  trecho(ETAPA.almoco, LOCAL.restB, ETAPA.cafe, LOCAL.cafe, 180),
  trecho(ETAPA.almoco, LOCAL.restC, ETAPA.cafe, LOCAL.cafe, 180),
]

export const PLANO_DEMO: DadosPlano = {
  viagem: {
    id: VIAGEM_DEMO_ID,
    nome: 'Viagem de demonstração',
    tipo: 'ida',
    dataSaida: horaDemo('06:30'),
    status: 'em_andamento',
    fatorOnibus: 1.15,
    planoOriginal: null,
  },
  etapas: ETAPAS,
  locais: LOCAIS,
  trechos: TRECHOS,
}

function passageiro(n: number, etapaEmbarqueId: string): Passageiro {
  const numero = String(n).padStart(2, '0')
  return {
    id: `${ESPACO_DEMO}p-${numero}`,
    nome: `Passageiro fictício ${numero}`,
    etapaEmbarqueId,
    etapaDesembarqueId: null,
    status: 'ativo',
  }
}

/** 38 passageiros: 35 embarcam em Ipatinga (01 a 35) e 3 em Monlevade (36 a 38). */
export const PASSAGEIROS_DEMO: Passageiro[] = [
  ...Array.from({ length: 35 }, (_, i) => passageiro(i + 1, ETAPA.origem)),
  ...Array.from({ length: 3 }, (_, i) => passageiro(36 + i, ETAPA.monlevade)),
]
