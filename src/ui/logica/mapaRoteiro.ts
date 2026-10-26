// O que o mapa do roteiro desenha, a partir das paradas já classificadas: marcadores, linhas retas
// entre paradas vizinhas, alternativas da próxima parada e quantos locais ficam de fora por falta
// de coordenadas. Nenhuma regra de cálculo: só decide o que aparece.

import type { Ponto } from '../../core/rotas'

export type MarcadorDoMapa = 'feita' | 'aqui' | 'proxima' | 'futura' | 'pulada'

export interface ParadaEntrada {
  etapaId: string
  localId: string | null
  nome: string
  /** O nome do local (cadastro em Locais), que é o que falta quando não há coordenadas. */
  localNome?: string | null
  marcador: MarcadorDoMapa
  /** Parada incluída em viagem (sem original). */
  incluida: boolean
  ponto: Ponto | null
}

export interface AlternativaEntrada {
  localId: string
  nome: string
  ponto: Ponto | null
}

export interface ParadaNoMapa extends Omit<ParadaEntrada, 'ponto'> {
  ponto: Ponto
  /** Posição na viagem (1 = origem), contando as puladas. */
  ordem: number
}

export interface SegmentoDoMapa {
  de: Ponto
  para: Ponto
  /** O trecho já foi percorrido (chegamos ao fim dele). */
  percorrido: boolean
}

export interface AlternativaNoMapa extends Omit<AlternativaEntrada, 'ponto'> {
  ponto: Ponto
  /** A parada anterior à próxima, a que a alternativa liga; nula se ela não tem coordenadas. */
  ligadaA: Ponto | null
}

export interface MapaDoRoteiro {
  paradas: ParadaNoMapa[]
  segmentos: SegmentoDoMapa[]
  alternativas: AlternativaNoMapa[]
  /** Nomes dos locais (sem repetir) que não aparecem por falta de coordenadas. */
  semCoordenadas: string[]
}

const percorrida = (m: MarcadorDoMapa) => m === 'feita' || m === 'aqui'

/**
 * `paradas` na ordem do roteiro. Puladas aparecem sem linha (a viagem passa direto por elas).
 * Uma linha só liga duas paradas vizinhas que têm coordenadas as duas: nunca "pula" um local sem
 * coordenadas, para não desenhar um trecho que não existe. `alternativas` são as da próxima parada
 * flexível (`etapaDasAlternativas`, a mesma da lista de paradas): ligam-se à parada que vem antes
 * dela, e o local que a etapa já usa não se repete.
 */
export function montarMapaDoRoteiro(
  paradas: readonly ParadaEntrada[],
  alternativas: readonly AlternativaEntrada[],
  etapaDasAlternativas: string | null = null,
): MapaDoRoteiro {
  const noMapa: ParadaNoMapa[] = []
  const faltando = new Map<string, string>()
  paradas.forEach((p, i) => {
    if (p.ponto) noMapa.push({ ...p, ponto: p.ponto, ordem: i + 1 })
    else faltando.set(p.localId ?? p.etapaId, p.localNome || p.nome)
  })

  const emRota = paradas.filter((p) => p.marcador !== 'pulada')
  const segmentos: SegmentoDoMapa[] = []
  for (let i = 1; i < emRota.length; i++) {
    const de = emRota[i - 1]!
    const para = emRota[i]!
    if (de.ponto && para.ponto) segmentos.push({ de: de.ponto, para: para.ponto, percorrido: percorrida(para.marcador) })
  }

  const flexivel = paradas.find((p) => p.etapaId === etapaDasAlternativas)
  const antes = flexivel ? emRota[emRota.indexOf(flexivel) - 1] : undefined
  const alts: AlternativaNoMapa[] = []
  for (const a of alternativas) {
    if (a.localId === flexivel?.localId) continue
    if (!a.ponto) faltando.set(a.localId, a.nome)
    else alts.push({ ...a, ponto: a.ponto, ligadaA: antes?.ponto ?? null })
  }

  return { paradas: noMapa, segmentos, alternativas: alts, semCoordenadas: [...faltando.values()] }
}

/** "2 locais sem coordenadas não aparecem no mapa: A, B." ou nulo quando nenhum ficou de fora. */
export function textoDosSemCoordenadas(nomes: readonly string[]): string | null {
  if (nomes.length === 0) return null
  const quantos = nomes.length === 1 ? '1 local sem coordenadas não aparece' : `${nomes.length} locais sem coordenadas não aparecem`
  return `${quantos} no mapa: ${nomes.join(', ')}. Cadastre as coordenadas em Locais.`
}
