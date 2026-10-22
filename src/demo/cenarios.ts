// Cenários prontos da demonstração. Cada um é um dado: o horário em que o relógio
// simulado começa e uma lista de passos reproduzível. A viagem já está iniciada
// (plano original congelado, evento "início" registrado) quando o primeiro passo roda.

import type { PassoRelogio } from '../core/relogio'
import type { ConteudoEvento } from '../core/eventos'
import type { Instante } from '../core/tipos'
import { ETAPA, horaDemo, LOCAL, ESPACO_DEMO } from './dados'

export type Passo = { descricao: string } & (
  | { tipo: 'definir_relogio'; horario: Instante }
  | { tipo: 'avancar'; minutos: PassoRelogio }
  /** Registra um evento no horário atual do relógio simulado. */
  | { tipo: 'registrar'; conteudo: ConteudoEvento }
)

export interface Cenario {
  id: string
  nome: string
  descricao: string
  /** Onde o relógio simulado começa, com a viagem recém-iniciada. */
  inicio: Instante
  passos: Passo[]
}

const INICIO_PADRAO = horaDemo('06:00')

function relogio(hora: string, descricao: string, dias = 0): Passo {
  return { tipo: 'definir_relogio', horario: horaDemo(hora, dias), descricao }
}

function avancar(minutos: PassoRelogio, descricao: string): Passo {
  return { tipo: 'avancar', minutos, descricao }
}

function registrar(descricao: string, conteudo: ConteudoEvento): Passo {
  return { tipo: 'registrar', conteudo, descricao }
}

const saimos = (etapaId: string, descricao: string) => registrar(descricao, { tipo: 'saida', etapaId })
const chegamos = (etapaId: string, descricao: string) => registrar(descricao, { tipo: 'chegada', etapaId })

/** Passageiro fictício pelo número (01 a 38). */
export function idPassageiroDemo(numero: number): string {
  return `${ESPACO_DEMO}p-${String(numero).padStart(2, '0')}`
}

export const CENARIOS: Cenario[] = [
  {
    id: 'saida-atrasada',
    nome: 'Saída atrasada',
    descricao: 'Saímos de Ipatinga às 06:47, 17 min depois do roteiro (caso 1).',
    inicio: INICIO_PADRAO,
    passos: [relogio('06:47', 'São 06:47 e o ônibus ainda não saiu.'), saimos(ETAPA.origem, 'SAÍMOS de Ipatinga.')],
  },
  {
    id: 'chegada-atrasada-monlevade',
    nome: 'Chegada atrasada em Monlevade',
    descricao: 'Saída às 06:47 e chegada em Monlevade às 08:55, 30 min depois do roteiro (caso 2).',
    inicio: INICIO_PADRAO,
    passos: [
      relogio('06:47', 'São 06:47.'),
      saimos(ETAPA.origem, 'SAÍMOS de Ipatinga.'),
      relogio('08:55', 'São 08:55.'),
      chegamos(ETAPA.monlevade, 'CHEGAMOS em Monlevade.'),
    ],
  },
  {
    id: 'passageiro-faltando',
    nome: 'Passageiro faltando',
    descricao:
      'Em Monlevade, um dos 3 passageiros que embarcam ali não aparece: a contagem de 37 não bate com os 38 esperados. ' +
      'A conferência por nome fica incompleta e ele sai como "não embarcou". Os demais cenários saem sem conferência.',
    inicio: INICIO_PADRAO,
    passos: [
      relogio('06:30', 'São 06:30.'),
      saimos(ETAPA.origem, 'SAÍMOS de Ipatinga com os 35 esperados.'),
      relogio('08:25', 'São 08:25.'),
      chegamos(ETAPA.monlevade, 'CHEGAMOS em Monlevade.'),
      avancar(15, 'Passam 15 min e o passageiro 38 não apareceu.'),
      registrar('Conferência incompleta: 37 de 38 a bordo, falta o passageiro 38.', {
        tipo: 'conferencia',
        etapaId: ETAPA.monlevade,
        dados: {
          momento: 'saida',
          modo: 'so_alguns',
          confirmados: Array.from({ length: 37 }, (_, i) => idPassageiroDemo(i + 1)),
          pendentes: [idPassageiroDemo(38)],
          resultado: 'incompleta',
        },
      }),
      registrar('Passageiro 38 marcado como "não embarcou".', {
        tipo: 'status_passageiro',
        etapaId: ETAPA.monlevade,
        dados: { passageiroId: idPassageiroDemo(38), status: 'nao_embarcou', motivo: 'Não apareceu no ponto de embarque.' },
      }),
      saimos(ETAPA.monlevade, 'SAÍMOS de Monlevade com os 37 esperados.'),
    ],
  },
  {
    id: 'parada-estourando',
    nome: 'Parada estourando o tempo',
    descricao: 'Em Monlevade desde 08:55, às 09:20 ainda sem saída: a previsão acompanha o relógio (caso 4).',
    inicio: INICIO_PADRAO,
    passos: [
      relogio('06:47', 'São 06:47.'),
      saimos(ETAPA.origem, 'SAÍMOS de Ipatinga.'),
      relogio('08:55', 'São 08:55.'),
      chegamos(ETAPA.monlevade, 'CHEGAMOS em Monlevade.'),
      relogio('09:20', 'São 09:20 e ainda não saímos de Monlevade.'),
    ],
  },
  {
    id: 'restaurante-inviavel-e-troca',
    nome: 'Restaurante inviável e troca',
    descricao:
      'Problema mecânico em Monlevade: saímos só às 10:55. O Restaurante A chega fechado, o B com pouca margem e ' +
      'o C com folga (caso 9). O último passo troca para o C; para fazer a troca você mesmo, ' +
      'pare no passo anterior e use VER ALTERNATIVAS na tela da viagem.',
    inicio: INICIO_PADRAO,
    passos: [
      relogio('06:30', 'São 06:30.'),
      saimos(ETAPA.origem, 'SAÍMOS de Ipatinga.'),
      relogio('08:25', 'São 08:25.'),
      chegamos(ETAPA.monlevade, 'CHEGAMOS em Monlevade.'),
      relogio('09:00', 'São 09:00.'),
      registrar('Imprevisto: problema mecânico.', { tipo: 'imprevisto', dados: { categoria: 'problema_mecanico' } }),
      relogio('10:55', 'O ônibus é consertado às 10:55.'),
      saimos(ETAPA.monlevade, 'SAÍMOS de Monlevade.'),
      relogio('10:57', 'Vemos as alternativas do almoço.'),
      registrar('Trocamos o almoço para o Restaurante C.', {
        tipo: 'troca_local',
        etapaId: ETAPA.almoco,
        dados: { localId: LOCAL.restC },
      }),
    ],
  },
  {
    id: 'recalibracao-google-maps',
    nome: 'Recalibração pelo Google Maps',
    descricao: 'A caminho do almoço, o Google Maps informa chegada às 13:02 (caso 6).',
    inicio: INICIO_PADRAO,
    passos: [
      relogio('06:47', 'São 06:47.'),
      saimos(ETAPA.origem, 'SAÍMOS de Ipatinga.'),
      relogio('08:55', 'São 08:55.'),
      chegamos(ETAPA.monlevade, 'CHEGAMOS em Monlevade.'),
      relogio('09:14', 'São 09:14.'),
      saimos(ETAPA.monlevade, 'SAÍMOS de Monlevade.'),
      relogio('11:40', 'São 11:40.'),
      registrar('Recalibração: o Google Maps informa chegada às 13:02.', {
        tipo: 'recalibracao',
        etapaId: ETAPA.almoco,
        dados: { horario: horaDemo('13:02') },
      }),
    ],
  },
  {
    id: 'parada-nao-planejada',
    nome: 'Parada não planejada',
    descricao: 'Antes do almoço, 20 min parados na estrada (caso 8).',
    inicio: INICIO_PADRAO,
    passos: [
      relogio('06:47', 'São 06:47.'),
      saimos(ETAPA.origem, 'SAÍMOS de Ipatinga.'),
      relogio('08:55', 'São 08:55.'),
      chegamos(ETAPA.monlevade, 'CHEGAMOS em Monlevade.'),
      relogio('09:14', 'São 09:14.'),
      saimos(ETAPA.monlevade, 'SAÍMOS de Monlevade.'),
      relogio('11:00', 'São 11:00.'),
      registrar('PARAMOS na estrada.', {
        tipo: 'parada_nao_planejada',
        etapaId: ETAPA.almoco,
        dados: { fase: 'inicio', motivo: 'pneu' },
      }),
      avancar(15, 'Passam 15 min parados.'),
      avancar(5, 'Passam mais 5 min.'),
      registrar('VOLTAMOS para a estrada.', {
        tipo: 'parada_nao_planejada',
        etapaId: ETAPA.almoco,
        dados: { fase: 'fim' },
      }),
    ],
  },
  {
    id: 'parada-para-cafe',
    nome: 'Parada para café',
    descricao: 'Parada por escolha antes do almoço, com tempo previsto de 20 min: a previsão já conta ao parar e a parada estoura (30 min reais).',
    inicio: INICIO_PADRAO,
    passos: [
      relogio('06:47', 'São 06:47.'),
      saimos(ETAPA.origem, 'SAÍMOS de Ipatinga.'),
      relogio('08:55', 'São 08:55.'),
      chegamos(ETAPA.monlevade, 'CHEGAMOS em Monlevade.'),
      relogio('09:14', 'São 09:14.'),
      saimos(ETAPA.monlevade, 'SAÍMOS de Monlevade.'),
      relogio('10:00', 'São 10:00.'),
      registrar('PARAMOS para um café, com 20 min previstos.', {
        tipo: 'parada_nao_planejada',
        etapaId: ETAPA.almoco,
        dados: { fase: 'inicio', motivo: 'cafe', onde: 'Padaria Exemplo', tempoPrevistoMin: 20 },
      }),
      avancar(15, 'Passam 15 min: faltam 5 do previsto.'),
      avancar(15, 'Passam mais 15 min: a parada excedeu o previsto.'),
      registrar('VOLTAMOS para a estrada.', {
        tipo: 'parada_nao_planejada',
        etapaId: ETAPA.almoco,
        dados: { fase: 'fim' },
      }),
    ],
  },
  {
    id: 'chegada-ao-destino',
    nome: 'Chegada ao destino',
    descricao: 'A viagem inteira com 17 min de atraso mantidos até Ribeirão Preto, às 23:47.',
    inicio: INICIO_PADRAO,
    passos: [
      relogio('06:47', 'São 06:47.'),
      saimos(ETAPA.origem, 'SAÍMOS de Ipatinga.'),
      relogio('08:42', 'São 08:42.'),
      chegamos(ETAPA.monlevade, 'CHEGAMOS em Monlevade.'),
      relogio('08:57', 'São 08:57.'),
      saimos(ETAPA.monlevade, 'SAÍMOS de Monlevade.'),
      relogio('12:17', 'São 12:17.'),
      chegamos(ETAPA.almoco, 'CHEGAMOS ao almoço.'),
      relogio('13:17', 'São 13:17.'),
      saimos(ETAPA.almoco, 'SAÍMOS do almoço.'),
      relogio('16:17', 'São 16:17.'),
      chegamos(ETAPA.cafe, 'CHEGAMOS ao café.'),
      relogio('16:47', 'São 16:47.'),
      saimos(ETAPA.cafe, 'SAÍMOS do café.'),
      relogio('20:47', 'São 20:47.'),
      chegamos(ETAPA.jantar, 'CHEGAMOS ao jantar.'),
      relogio('21:37', 'São 21:37.'),
      saimos(ETAPA.jantar, 'SAÍMOS do jantar.'),
      relogio('23:47', 'São 23:47.'),
      chegamos(ETAPA.destino, 'CHEGAMOS a Ribeirão Preto.'),
      registrar('Viagem encerrada.', { tipo: 'fim' }),
    ],
  },
]

export function cenarioPorId(id: string): Cenario {
  const cenario = CENARIOS.find((c) => c.id === id)
  if (!cenario) throw new Error(`Cenário não encontrado: ${id}`)
  return cenario
}
