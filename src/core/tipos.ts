// Tipos do modelo de dados (seção "Modelo de dados" da especificação)
// e do estado derivado, que nunca é persistido.

/**
 * Horário completo com fuso, por exemplo "2026-11-14T06:47:00-03:00".
 * Só é criado por `instante()` ou pelas funções de `tempo.ts`, e só é
 * comparado ou somado por elas: nunca como string.
 */
export type Instante = string & { readonly __marca: 'Instante' }

/**
 * "HH:MM". Única exceção à regra dos instantes: o horário de funcionamento
 * de um local se repete todo dia e é resolvido pela data da chegada.
 */
export type HoraDoDia = string

export type FonteTrecho = 'roteiro' | 'rota' | 'manual' | 'estimado'

export type TipoViagem = 'ida' | 'volta'
export type StatusViagem = 'planejando' | 'em_andamento' | 'concluida'

export interface Viagem {
  id: string
  nome: string
  tipo: TipoViagem
  dataSaida: Instante
  status: StatusViagem
  viagemRelacionadaId?: string
  fatorOnibus: number
  /** Texto da primeira linha das mensagens (por exemplo, "Unidade X — Ipatinga"). Não entra em nenhum cálculo. */
  identificacao?: string
  /** Motoristas e responsáveis (inteiro, padrão 0). Só entra no tamanho do grupo da mensagem do restaurante. */
  equipe?: number
  /** Vazio até "Iniciar viagem". Nada o altera depois. */
  planoOriginal: PlanoOriginal | null
}

export type TipoEtapa = 'origem' | 'obrigatoria' | 'flexivel' | 'destino'

export type ModoConferencia = 'todos_desceram' | 'so_alguns'

export interface Etapa {
  id: string
  viagemId: string
  ordem: number
  tipo: TipoEtapa
  /** Local preferido: o do roteiro. */
  localId: string | null
  /** Outros locais candidatos (sem horário de roteiro). */
  alternativas: string[]
  motivo?: string
  categoria?: string
  janelaInicio?: Instante
  janelaFim?: Instante
  permanenciaMin: number
  /** Chegada do roteiro. Na origem, é a saída. */
  chegadaRoteiro?: Instante
  modoConferencia?: ModoConferencia
}

export type OnibusPara = 'sim' | 'nao' | 'nao_sei'
export type Marcacao = 'favorito' | 'evitar'

export interface Local {
  id: string
  nome: string
  cidade: string
  tipo: string
  coordenadas?: { lat: number; lng: number }
  abre?: HoraDoDia
  fecha?: HoraDoDia
  telefone?: string
  onibusPara: OnibusPara
  observacoes?: string
  marcacao?: Marcacao
}

/**
 * Trecho guardado (calculado pela rota ou digitado). As fontes "roteiro" e
 * "estimado" são derivadas no cálculo e não ficam guardadas.
 */
export interface Trecho {
  etapaOrigemId: string
  localOrigemId: string
  etapaDestinoId: string
  localDestinoId: string
  /** Na fonte "rota", é o tempo de carro, sem o fator ônibus. */
  duracaoMin: number | null
  fonte: 'rota' | 'manual'
  distanciaKm?: number
  calculadoEm?: Instante
}

export type StatusPassageiro = 'ativo' | 'nao_embarcou' | 'saiu_da_viagem'

export interface Passageiro {
  id: string
  /** A viagem do passageiro (as etapas de embarque e desembarque são dela). */
  viagemId: string
  nome: string
  etapaEmbarqueId: string
  /** Vazio = destino. */
  etapaDesembarqueId: string | null
  /** Gravado sempre como "ativo": as mudanças de status vivem só nos eventos. */
  status: StatusPassageiro
}

export type TipoImprevisto =
  | 'transito'
  | 'acidente'
  | 'problema_mecanico'
  | 'passageiro'
  | 'clima'
  | 'atraso'
  | 'outro'

export type MotivoParada =
  | 'pneu'
  | 'policia'
  | 'banheiro'
  | 'cafe'
  | 'passageiro_mal'
  | 'acidente'
  | 'transito_parado'
  | 'outro'

export type ResultadoConferencia = 'completa' | 'completa_por_contagem' | 'incompleta'

/** Conferência na saída de uma etapa, ou ao voltar à estrada depois de uma parada não planejada. */
export type MomentoConferencia = 'saida' | 'volta'

/** Onde a marcação de "quem desceu" vale: na parada da etapa ou na parada não planejada ligada a ela. */
export type LocalDaDescida = 'etapa' | 'nao_planejada'

export interface Conferencia {
  /** Vazio nos eventos antigos e da demonstração: vale "saida". Na "volta", o evento leva a próxima etapa. */
  momento?: MomentoConferencia
  modo: ModoConferencia
  confirmados: string[]
  pendentes: string[]
  resultado: ResultadoConferencia
  motivo?: string
}

export interface EventoBase {
  id: string
  viagemId: string
  /** Quando o fato aconteceu. Corrigir um horário muda só este. */
  horarioFato: Instante
  /** Quando o botão foi apertado. */
  registradoEm: Instante
  /**
   * Ordem de gravação na viagem (1, 2, 3…). Os horários são arredondados ao minuto e
   * empatam; a sequência diz qual foi o último registro (usada para desfazer).
   */
  sequencia?: number
  observacao?: string
}

export type Evento = EventoBase &
  (
    | { tipo: 'inicio' }
    | { tipo: 'fim' }
    | { tipo: 'saida'; etapaId: string }
    | { tipo: 'chegada'; etapaId: string }
    | { tipo: 'pular_etapa'; etapaId: string }
    | { tipo: 'recalibracao'; etapaId: string; dados: { horario: Instante } }
    | { tipo: 'troca_local'; etapaId: string; dados: { localId: string } }
    | {
        tipo: 'parada_nao_planejada'
        /** A próxima etapa: a parada acontece no trecho que chega nela. */
        etapaId: string
        dados: {
          /** `previsao` (parada aberta): leva o estado completo de "onde" e tempo previsto; vale o mais recente. */
          fase: 'inicio' | 'fim' | 'previsao'
          motivo?: MotivoParada
          /** Nome do lugar (até 60 caracteres). Nunca vai para as mensagens. */
          onde?: string
          /** Tempo previsto da parada, em minutos inteiros (1 a 600). */
          tempoPrevistoMin?: number
        }
      }
    | { tipo: 'imprevisto'; dados: { categoria: TipoImprevisto } }
    | { tipo: 'conferencia'; etapaId: string; dados: Conferencia }
    | {
        /**
         * Quem desceu na parada (marcação opcional, sem efeito no cálculo). Na parada não
         * planejada, a etapa é a próxima, como nos outros eventos da parada. Uma marcação nova
         * na mesma parada substitui a anterior.
         */
        tipo: 'desceram'
        etapaId: string
        dados: { local: LocalDaDescida; passageiroIds: string[] }
      }
    | {
        tipo: 'status_passageiro'
        etapaId: string
        dados: { passageiroId: string; status: StatusPassageiro; motivo: string }
      }
    /**
     * Uma mensagem de atualização foi copiada ou compartilhada. Guarda só a previsão informada
     * (nunca o texto). Sem efeito no cálculo.
     */
    | { tipo: 'atualizacao_gerada'; dados: { previsaoDestino: Instante | null; atrasoMin: number | null } }
    /** Observação livre, só no celular e sem efeito no cálculo. Nunca entra nas mensagens. */
    | { tipo: 'observacao'; dados: { texto: string } }
  )

export type TipoEvento = Evento['tipo']

/** Expectativa original congelada ao iniciar a viagem. */
export interface PlanoOriginal {
  congeladoEm: Instante
  etapas: EtapaOriginal[]
}

export interface EtapaOriginal {
  etapaId: string
  localId: string | null
  /** Vazio na origem. */
  chegada: Instante | null
  /** Vazio no destino. */
  saida: Instante | null
}

/**
 * Consulta ao Google Maps: "chegando em <local> às HH:MM", para avaliar uma alternativa da
 * próxima parada. Não é fato da viagem (não é evento e não aparece na timeline) nem estado
 * derivado: fica guardada à parte para não se perder ao navegar, e só vale por pouco tempo
 * e enquanto a situação não mudar.
 */
export interface Consulta {
  viagemId: string
  etapaId: string
  localId: string
  /** O horário de chegada que o Google Maps informou. */
  horario: Instante
  /** Quando a consulta foi feita (minuto cheio). */
  consultadoEm: Instante
  /** Consulta feita parado na etapa anterior: informa a duração, não um horário absoluto. */
  parado: boolean
  /** Maior sequência de saída, chegada, troca de local e pulo no momento da consulta. */
  base: number
}

/**
 * Modelo de mensagem editado pela pessoa (fase 7). É configuração do app, não fato da viagem
 * nem estado derivado; sem linha gravada, vale o modelo padrão (que mora no código).
 */
export interface ModeloSalvo {
  id: 'atualizacao' | 'restaurante'
  texto: string
  atualizadoEm: Instante
}

/** O que o cálculo precisa do planejamento. */
export interface DadosPlano {
  viagem: Viagem
  etapas: Etapa[]
  locais: Local[]
  trechos: Trecho[]
}

// ---------- Estado derivado ----------

export type DuracaoTrecho =
  | { minutos: number; fonte: FonteTrecho }
  | { minutos: null; fonte: null }

export type OrigemHorario =
  | 'real'
  | 'recalibracao'
  | 'calculado'
  /** A regra do relógio empurrou o valor calculado para o horário atual. */
  | 'relogio'

export interface HorarioPrevisto {
  instante: Instante
  origem: OrigemHorario
  /** Na origem "recalibracao": quando o horário foi informado. */
  recalibradoEm?: Instante
  /** Horário − original do mesmo evento. Vazio se não houver original. */
  atrasoMin: number | null
}

export type EstadoDaEtapa = 'pendente' | 'em_parada' | 'concluida' | 'pulada'

export interface EstadoEtapa {
  etapaId: string
  localId: string | null
  estado: EstadoDaEtapa
  /** Trecho que chega nesta etapa (vazio na origem e nas puladas). */
  trechoChegada: DuracaoTrecho | null
  /** Vazio na origem, nas puladas ou quando não há como saber. */
  chegada: HorarioPrevisto | null
  /** Vazio no destino, nas puladas ou quando não há como saber. */
  saida: HorarioPrevisto | null
}

export interface EstadoViagem {
  etapas: EstadoEtapa[]
  emTransito: boolean
  /** A primeira etapa pendente. */
  proximaEtapaId: string | null
  chegadaDestino: HorarioPrevisto | null
  atrasoDestinoMin: number | null
}
