// Lista de passageiros agrupada por ponto de embarque, e textos do cadastro.

import { ordenarEtapas } from '../../core/trechos'
import type { Etapa, Local, Passageiro } from '../../core/tipos'
import { nomeDaEtapa } from './textos'

export interface GrupoDeEmbarque {
  etapaId: string
  nome: string
  passageiros: Passageiro[]
}

/** Um grupo por ponto de embarque, na ordem do percurso, só com os que têm gente; nomes em ordem alfabética. */
export function agruparPorEmbarque(etapas: readonly Etapa[], locais: readonly Local[], passageiros: readonly Passageiro[]): GrupoDeEmbarque[] {
  return ordenarEtapas(etapas)
    .map((etapa) => ({
      etapaId: etapa.id,
      nome: nomeDaEtapa(etapa, locais),
      passageiros: passageiros.filter((p) => p.etapaEmbarqueId === etapa.id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    }))
    .filter((g) => g.passageiros.length > 0)
}

export const DICA_DO_NOME = 'Se houver nomes iguais, use a inicial do sobrenome (ex.: Maria S.).'
export const NOTA_DE_PRIVACIDADE = 'Os nomes ficam só neste celular. Nada é enviado para fora.'

export const textoTotalDePassageiros = (n: number): string => (n === 1 ? '1 passageiro' : `${n} passageiros`)

/** "Ana F., Beto S." ou, com muita gente, os primeiros nomes e "e mais N". */
export function textoDeQuemFalta(nomes: readonly string[], max = 3): string {
  if (nomes.length <= max) return nomes.join(', ')
  return `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`
}
