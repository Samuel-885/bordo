// Textos e listas fixas das telas de planejamento.

import type { OnibusPara, TipoEtapa } from '../../core/tipos'

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
      return `${categoria ? rotuloDe(CATEGORIAS, categoria).toUpperCase() : 'PARADA'} · FLEXÍVEL`
  }
}
