// Textos dos bloqueios e avisos do planejamento, e o resumo de cada etapa.

import type { HorarioForaDeOrdem, AvisoPlano } from '../../core/avisos'
import type { BloqueioInicio } from '../../core/previsao'
import type { Etapa, FonteTrecho, Local } from '../../core/tipos'
import { formatarDuracao } from './duracao'
import { formatarHora } from './horarios'
import { CATEGORIAS, MOTIVOS, rotuloDe } from './rotulos'

export function nomeDaEtapa(etapa: Etapa | undefined, locais: readonly Local[]): string {
  if (!etapa) return 'etapa'
  const local = locais.find((l) => l.id === etapa.localId)
  const categoria = etapa.categoria ? rotuloDe(CATEGORIAS, etapa.categoria) : null
  if (etapa.tipo === 'origem') return `Origem${local ? ` (${local.nome})` : ''}`
  if (etapa.tipo === 'destino') return `Destino${local ? ` (${local.nome})` : ''}`
  return categoria ?? local?.nome ?? 'Ponto obrigatório'
}

const FONTES: Record<FonteTrecho, string> = {
  roteiro: 'do roteiro',
  rota: 'calculado pela rota',
  manual: 'manual',
  estimado: 'estimado',
}

export const textoDaFonte = (fonte: FonteTrecho): string => FONTES[fonte]

export function textoDoBloqueio(b: BloqueioInicio, etapas: readonly Etapa[], locais: readonly Local[]): string {
  switch (b.tipo) {
    case 'falta_origem':
      return 'Falta a origem.'
    case 'falta_destino':
      return 'Falta o destino.'
    case 'origem_sem_horario':
      return 'A origem precisa de um horário de saída.'
    case 'trecho_sem_tempo':
      return `O trecho até "${nomeDaEtapa(etapas.find((e) => e.id === b.etapaDestinoId), locais)}" está sem tempo definido.`
  }
}

export function textoDoAviso(a: AvisoPlano, etapas: readonly Etapa[], locais: readonly Local[]): string {
  const nome = nomeDaEtapa(etapas.find((e) => e.id === a.etapaId), locais)
  switch (a.tipo) {
    case 'flexivel_sem_local':
      return `${nome}: nenhum local escolhido.`
    case 'local_sem_horario': {
      const nomes = a.localIds.map((id) => locais.find((l) => l.id === id)?.nome ?? 'local').join(', ')
      return `${nome}: sem horário de funcionamento em ${nomes}.`
    }
    case 'chegada_fora_da_janela':
      return `${nome}: a chegada prevista fica fora da janela.`
  }
}

export function textoForaDeOrdem(f: HorarioForaDeOrdem, etapas: readonly Etapa[], locais: readonly Local[]): string {
  const nome = nomeDaEtapa(etapas.find((e) => e.id === f.etapaId), locais)
  const anterior = nomeDaEtapa(etapas.find((e) => e.id === f.anteriorId), locais)
  return `${nome}: o horário é anterior à saída de "${anterior}". Ajuste o horário ou a ordem.`
}

/** Linha de resumo da etapa na lista. */
export function resumoDaEtapa(etapa: Etapa): string {
  switch (etapa.tipo) {
    case 'origem':
      return 'Saída'
    case 'destino':
      return 'Chegada'
    case 'obrigatoria':
      return [etapa.motivo ? rotuloDe(MOTIVOS, etapa.motivo) : null, formatarDuracao(etapa.permanenciaMin)].filter(Boolean).join(' · ')
    case 'flexivel': {
      const janela =
        etapa.janelaInicio && etapa.janelaFim ? `janela ${formatarHora(etapa.janelaInicio)}–${formatarHora(etapa.janelaFim)}` : 'sem janela'
      const n = (etapa.localId ? 1 : 0) + etapa.alternativas.length
      return `${janela} · ${formatarDuracao(etapa.permanenciaMin)} · ${n} ${n === 1 ? 'alternativa' : 'alternativas'}`
    }
  }
}
