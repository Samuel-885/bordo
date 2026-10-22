// Valores das variáveis dos modelos de mensagem (atualização e restaurante), tirados do estado
// da viagem. Funções puras: nenhuma regra de cálculo aqui, tudo vem do núcleo. Nenhum valor
// expõe nome de passageiro: só contagens, horários e nomes de etapas e locais.

import { classificarAtraso } from '../../core/atraso'
import { resumoABordo } from '../../core/conferencia'
import { VARIAVEIS_DO_MODELO, modeloParaGerar, preencherModelo, type IdModelo } from '../../core/modelos'
import { passageirosEmTransito } from '../../core/passageiros'
import { rotuloHorario, situacaoDaViagem } from '../../core/registro'
import { ordenarEtapas } from '../../core/trechos'
import type { DadosPlano, Evento, HorarioPrevisto, Instante, Passageiro } from '../../core/tipos'
import { nomeDaEtapaEmUso, formatarDuracaoCurta, textoDaSituacao } from './textosViagem'
import { formatarHora } from './horarios'

export type Valores = Record<string, string>

/** "23:47 (atraso de 17 min)", "23:30 (no horário)" ou "23:25 (adiantado 5 min)"; sem original, só o horário. */
export function textoDoHorarioComAtraso(h: HorarioPrevisto, agora: Instante): string {
  const hora = rotuloHorario(h.instante, agora)
  if (h.atrasoMin === null) return hora
  const c = classificarAtraso(h.atrasoMin)
  if (c.situacao === 'no_horario') return `${hora} (no horário)`
  if (c.situacao === 'atrasado') return `${hora} (atraso de ${formatarDuracaoCurta(c.minutos)})`
  return `${hora} (adiantado ${formatarDuracaoCurta(-c.minutos)})`
}

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

/** Valores das variáveis da atualização, a partir do estado atual da viagem em andamento. */
export function valoresDaAtualizacao(
  plano: DadosPlano,
  eventos: readonly Evento[],
  passageiros: readonly Passageiro[],
  agora: Instante,
): Valores {
  const { viagem, etapas, locais } = plano
  const original = viagem.planoOriginal
  if (!original) throw new Error('A viagem ainda não foi iniciada.')
  const s = situacaoDaViagem(plano, original, eventos, agora)
  const ordenadas = ordenarEtapas(etapas)
  const etapaDe = (id: string | null) => etapas.find((e) => e.id === id)
  const estadoDe = (id: string | null) => s.estado.etapas.find((e) => e.etapaId === id)
  const ultima = ordenadas.at(-1)
  const localDoDestino = locais.find((l) => l.id === (estadoDe(ultima?.id ?? null)?.localId ?? ultima?.localId ?? null))
  const destino = localDoDestino?.cidade || localDoDestino?.nome || ''
  const chegadaDestino = s.estado.chegadaDestino
  const chegamos = s.situacao === 'chegamos'

  let situacao: string
  if (chegamos) {
    situacao = chegadaDestino
      ? `chegamos${destino ? ` a ${destino}` : ''} às ${textoDoHorarioComAtraso(chegadaDestino, agora)}`
      : 'chegamos'
  } else {
    const nomeParada = s.etapaAtualId ? nomeDaEtapaEmUso(etapaDe(s.etapaAtualId), locais, eventos) : null
    situacao = minuscula(textoDaSituacao(s.situacao, nomeParada))
  }

  const proxima = chegamos ? null : s.proximaEtapaId
  const chegadaProxima = estadoDe(proxima)?.chegada ?? null
  const aBordo = resumoABordo(plano, passageiros, eventos, s)
  let textoPassageiros = ''
  if (aBordo?.tipo === 'conferido') textoPassageiros = `${aBordo.total} a bordo`
  if (aBordo?.tipo === 'esperados') textoPassageiros = `${aBordo.total} ${aBordo.total === 1 ? 'esperado' : 'esperados'} na saída`

  return {
    identificacao: viagem.identificacao?.trim() ?? '',
    situacao,
    proxima_parada: proxima ? nomeDaEtapaEmUso(etapaDe(proxima), locais, eventos) : '',
    hora_proxima: chegadaProxima ? rotuloHorario(chegadaProxima.instante, agora) : '',
    previsao_destino: !chegamos && chegadaDestino ? textoDoHorarioComAtraso(chegadaDestino, agora) : '',
    destino,
    passageiros: textoPassageiros,
    agora: formatarHora(agora),
  }
}

/** O que a atualização gerada guarda na timeline: a previsão informada no destino, com o atraso. */
export function previsaoInformada(
  plano: DadosPlano,
  eventos: readonly Evento[],
  agora: Instante,
): { previsaoDestino: Instante | null; atrasoMin: number | null } {
  const original = plano.viagem.planoOriginal
  if (!original) return { previsaoDestino: null, atrasoMin: null }
  const destino = situacaoDaViagem(plano, original, eventos, agora).estado.chegadaDestino
  return { previsaoDestino: destino?.instante ?? null, atrasoMin: destino?.atrasoMin ?? null }
}

/** Dados da mensagem do restaurante para um local de uma parada. */
export interface DadosDoRestaurante {
  valores: Valores
  /** Passageiros a bordo ao chegar (inclusive quem desce ali) + equipe. Zero = não dá para gerar. */
  grupo: number
}

/** Passageiros a bordo ao chegar na etapa (inclusive quem desce ali). */
export function passageirosAoChegar(
  plano: DadosPlano,
  passageiros: readonly Passageiro[],
  eventos: readonly Evento[],
  etapaId: string,
): number {
  return passageirosEmTransito(etapaId, plano.etapas, passageiros, eventos).length
}

export function valoresDoRestaurante(
  plano: DadosPlano,
  eventos: readonly Evento[],
  passageiros: readonly Passageiro[],
  etapaId: string,
  localId: string,
  chegada: Instante,
  agora: Instante,
): DadosDoRestaurante {
  const grupo = passageirosAoChegar(plano, passageiros, eventos, etapaId) + (plano.viagem.equipe ?? 0)
  return {
    grupo,
    valores: {
      grupo: grupo > 0 ? String(grupo) : '',
      chegada: rotuloHorario(chegada, agora),
      local: plano.locais.find((l) => l.id === localId)?.nome ?? '',
      identificacao: plano.viagem.identificacao?.trim() ?? '',
    },
  }
}

/** Valores de exemplo, para a prévia da tela de modelos quando não há viagem iniciada. */
export function valoresDeExemplo(id: IdModelo): Valores {
  return Object.fromEntries(VARIAVEIS_DO_MODELO[id].map((v) => [v.nome, v.exemplo]))
}

/** Gera o texto: o modelo salvo (ou o padrão, com aviso se o salvo tem problema) preenchido. */
export function gerarMensagem(
  id: IdModelo,
  modeloSalvo: string | null | undefined,
  valores: Valores,
): { texto: string; aviso: string | null } {
  const { texto, aviso } = modeloParaGerar(id, modeloSalvo)
  return { texto: preencherModelo(texto, valores), aviso }
}
