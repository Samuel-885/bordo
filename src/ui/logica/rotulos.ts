// Textos e listas fixas das telas de planejamento.

import type { MotivoParada, OnibusPara, StatusPassageiro, TipoEtapa, TipoImprevisto } from '../../core/tipos'

export const TIPOS_DE_ETAPA: Array<{ valor: TipoEtapa; rotulo: string }> = [
  { valor: 'origem', rotulo: 'Origem' },
  { valor: 'obrigatoria', rotulo: 'Ponto obrigatório' },
  { valor: 'flexivel', rotulo: 'Parada flexível' },
  { valor: 'destino', rotulo: 'Destino' },
]

export const MOTIVOS = [
  { valor: 'buscar_passageiros', rotulo: 'Buscar passageiros' },
  { valor: 'deixar_passageiros', rotulo: 'Deixar passageiros' },
  { valor: 'outro', rotulo: 'Outro' },
] as const

export const CATEGORIAS = [
  { valor: 'almoco', rotulo: 'Almoço' },
  { valor: 'cafe', rotulo: 'Café' },
  { valor: 'jantar', rotulo: 'Jantar' },
  { valor: 'banheiro', rotulo: 'Banheiro' },
  { valor: 'descanso', rotulo: 'Descanso' },
] as const

/** Categorias da parada incluída em viagem (mudança de roteiro). `cafe` é a mesma do roteiro. */
export const CATEGORIAS_DA_PARADA_INCLUIDA = [
  { valor: 'visita', rotulo: 'Visita / passeio' },
  { valor: 'refeicao', rotulo: 'Refeição' },
  { valor: 'cafe', rotulo: 'Café / lanche' },
  { valor: 'banheiro', rotulo: 'Banheiro' },
  { valor: 'abastecimento', rotulo: 'Abastecimento' },
  { valor: 'outro', rotulo: 'Outro' },
] as const

/** Todos os rótulos de categoria, para mostrar etapas do roteiro e paradas incluídas. */
export const TODAS_AS_CATEGORIAS = [
  ...CATEGORIAS,
  ...CATEGORIAS_DA_PARADA_INCLUIDA.filter((c) => !CATEGORIAS.some((x) => x.valor === c.valor)),
] as const

export const PERMANENCIAS_MIN = [5, 10, 15, 20, 30, 45, 60, 90] as const

export const TIPOS_DE_LOCAL = [
  { valor: 'restaurante', rotulo: 'Restaurante' },
  { valor: 'posto', rotulo: 'Posto' },
  { valor: 'lanchonete', rotulo: 'Lanchonete' },
  { valor: 'ponto_de_embarque', rotulo: 'Ponto de embarque' },
  { valor: 'outro', rotulo: 'Outro' },
] as const

export const ONIBUS_PARA: Array<{ valor: OnibusPara; rotulo: string }> = [
  { valor: 'nao_sei', rotulo: 'Não sei' },
  { valor: 'sim', rotulo: 'Sim' },
  { valor: 'nao', rotulo: 'Não' },
]

export function rotuloDe(lista: ReadonlyArray<{ valor: string; rotulo: string }>, valor: string | undefined): string {
  return lista.find((x) => x.valor === valor)?.rotulo ?? valor ?? ''
}

export function etiquetaDaEtapa(tipo: TipoEtapa, categoria: string | undefined): string {
  switch (tipo) {
    case 'origem':
      return 'ORIGEM'
    case 'obrigatoria':
      return 'OBRIGATÓRIO'
    case 'destino':
      return 'DESTINO'
    case 'flexivel':
      return `${categoria ? rotuloDe(TODAS_AS_CATEGORIAS, categoria).toUpperCase() : 'PARADA'} · FLEXÍVEL`
  }
}

export const TIPOS_DE_IMPREVISTO: Array<{ valor: TipoImprevisto; rotulo: string }> = [
  { valor: 'transito', rotulo: 'Trânsito' },
  { valor: 'acidente', rotulo: 'Acidente na estrada' },
  { valor: 'problema_mecanico', rotulo: 'Problema mecânico' },
  { valor: 'passageiro', rotulo: 'Passageiro' },
  { valor: 'clima', rotulo: 'Clima' },
  { valor: 'atraso', rotulo: 'Atraso' },
  { valor: 'outro', rotulo: 'Outro' },
]

export const MOTIVOS_DE_PARADA: Array<{ valor: MotivoParada; rotulo: string }> = [
  { valor: 'pneu', rotulo: 'Pneu' },
  { valor: 'policia', rotulo: 'Polícia' },
  { valor: 'banheiro', rotulo: 'Banheiro' },
  { valor: 'cafe', rotulo: 'Café / lanche' },
  { valor: 'passageiro_mal', rotulo: 'Passageiro passando mal' },
  { valor: 'acidente', rotulo: 'Acidente na estrada' },
  { valor: 'transito_parado', rotulo: 'Trânsito parado' },
  { valor: 'outro', rotulo: 'Outro' },
]

export const STATUS_DE_PASSAGEIRO: Record<StatusPassageiro, string> = {
  ativo: 'a bordo',
  nao_embarcou: 'não embarcou',
  saiu_da_viagem: 'saiu da viagem',
}
