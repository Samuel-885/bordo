// Valores derivados da viagem para as telas. Nenhuma regra aqui: tudo vem do núcleo.

import { classificarAtraso } from '../../core/atraso'
import { deveSugerirBackup, estadoDoBackup, momentoDeSugerirBackup } from '../../core/backup'
import { resumoABordo } from '../../core/conferencia'
import { posicoesParaIncluir } from '../../core/inclusao'
import { pendenciasDeRegistro, validarPulo } from '../../core/previsao'
import { validarRecalibracao } from '../../core/recalibracao'
import { situacaoDaViagem } from '../../core/registro'
import { ordenarEtapas } from '../../core/trechos'
import type { Local } from '../../core/tipos'
import { linkGoogleMaps } from '../logica/linkMaps'
import { nomeDaEtapaEmUso } from '../logica/textosViagem'
import type { ContextoDaViagem } from './dados'

export function derivarViagem(c: ContextoDaViagem) {
  const { plano, eventos, passageiros, backup, agora } = c
  const { viagem, etapas, locais } = plano
  const original = viagem.planoOriginal!
  const s = situacaoDaViagem(plano, original, eventos, agora)
  const ordenadas = ordenarEtapas(etapas)
  const etapaDe = (id: string | null) => etapas.find((e) => e.id === id)
  const estadoDe = (id: string | null) => s.estado.etapas.find((e) => e.etapaId === id)
  const localDe = (id: string | null): Local | undefined => locais.find((l) => l.id === (estadoDe(id)?.localId ?? null))
  const nome = (id: string | null) => nomeDaEtapaEmUso(etapaDe(id), locais, eventos)

  const proxima = s.proximaEtapaId
  const proximaEtapa = etapaDe(proxima)
  const concluida = s.situacao === 'chegamos'
  const estadoBackup = backup ? estadoDoBackup(backup.ultimo, backup.total, agora) : null
  const primeira = ordenadas[0]
  const ultima = ordenadas.at(-1)
  const destinoOriginal = original.etapas.find((o) => o.etapaId === ultima?.id)?.chegada ?? null
  const atraso = s.estado.atrasoDestinoMin

  return {
    original,
    s,
    ordenadas,
    etapaDe,
    estadoDe,
    localDe,
    nome,
    proxima,
    proximaEtapa,
    mapa: linkGoogleMaps(localDe(proxima)),
    podeRecalibrar:
      proxima !== null && s.situacao !== 'chegamos' && validarRecalibracao(plano, original, eventos, proxima, agora, agora).ok,
    podeIncluir: posicoesParaIncluir(plano, original, eventos, agora).length > 0,
    podePular: proxima !== null && proximaEtapa?.tipo === 'flexivel' && validarPulo(plano, s.estado, proxima).ok,
    pendencia: pendenciasDeRegistro(plano, eventos)[0] ?? null,
    concluida,
    estadoBackup,
    // Sugestão discreta (cartão, nunca janela), só parado numa etapa ou logo depois de um SAÍMOS.
    sugerirBackup:
      backup !== null && estadoBackup !== null && !concluida && momentoDeSugerirBackup(s.situacao, eventos) && deveSugerirBackup(estadoBackup, backup.silencio, agora),
    restaurada:
      backup?.restauradoDe && !backup.restauradoDe.dispensado && backup.restauradoDe.viagemIds.includes(viagem.id) ? backup.restauradoDe : null,
    primeira,
    ultima,
    cidadeDe: (id: string | undefined) => {
      const l = locais.find((x) => x.id === (id ? (estadoDe(id)?.localId ?? etapaDe(id)?.localId) : null))
      return l?.cidade || l?.nome || '—'
    },
    destino: s.estado.chegadaDestino,
    destinoOriginal,
    atraso,
    classe: atraso === null ? null : classificarAtraso(atraso),
    nomeLocalParado: s.etapaAtualId ? nome(s.etapaAtualId) : null,
    estadoProxima: estadoDe(proxima),
    chegadaProxima: estadoDe(proxima)?.chegada ?? null,
    saidaOrigem: estadoDe(primeira?.id ?? null)?.saida ?? null,
    aBordo: resumoABordo(plano, passageiros, eventos, s),
  }
}

export type Derivados = ReturnType<typeof derivarViagem>
