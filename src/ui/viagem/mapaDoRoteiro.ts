// Liga a viagem em andamento ao mapa do roteiro: classifica as paradas como a lista de paradas e
// pega as alternativas da próxima parada flexível. A decisão do que desenhar fica em
// `logica/mapaRoteiro.ts`; nada aqui calcula tempo.

import type { Consulta } from '../../core/tipos'
import { inclusaoDaEtapa } from '../../core/inclusao'
import { montarMapaDoRoteiro, type MapaDoRoteiro } from '../logica/mapaRoteiro'
import { nomeDaEtapa } from '../logica/textos'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'
import { alternativasDaProxima, marcadorDa } from './marcadores'

export function mapaDoRoteiroDaViagem(c: ContextoDaViagem, d: Derivados, consultas: readonly Consulta[]): MapaDoRoteiro {
  const { locais } = c.plano
  const paradas = d.ordenadas.map((etapa) => {
    const local = d.localDe(etapa.id)
    return {
      etapaId: etapa.id,
      localId: local?.id ?? null,
      nome: nomeDaEtapa(etapa, locais),
      localNome: local?.nome ?? null,
      marcador: marcadorDa(d.estadoDe(etapa.id), etapa, d),
      incluida: inclusaoDaEtapa(c.eventos, etapa.id) !== null,
      ponto: local?.coordenadas ?? null,
    }
  })
  const { etapa: flexivel, avaliacoes } = alternativasDaProxima(c, d, consultas)
  const alternativas = avaliacoes.flatMap((a) => {
    const local = locais.find((l) => l.id === a.localId)
    return local ? [{ localId: local.id, nome: local.nome, ponto: local.coordenadas ?? null }] : []
  })
  return montarMapaDoRoteiro(paradas, alternativas, flexivel?.id ?? null)
}
