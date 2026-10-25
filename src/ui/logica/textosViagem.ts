// Textos da tela principal e da timeline. Nenhuma conta de horário: tudo vem do núcleo.

import { atrasoMin, classificarAtraso } from '../../core/atraso'
import { emOrdemDeGravacao } from '../../core/eventos'
import type { ABordo } from '../../core/conferencia'
import { rotuloHorario, type Situacao } from '../../core/registro'
import { diferencaMin, ordenarPor } from '../../core/tempo'
import type { Conferencia, DadosPlano, DuracaoTrecho, Etapa, Evento, HorarioPrevisto, Instante, Local, Passageiro, PlanoOriginal } from '../../core/tipos'
import { formatarDuracao } from './duracao'
import { formatarHora } from './horarios'
import { textoDeQuemFalta } from './passageiros'
import { MOTIVOS_DE_PARADA, STATUS_DE_PASSAGEIRO, TIPOS_DE_IMPREVISTO, rotuloDe, CATEGORIAS } from './rotulos'

/** "no horário", "+17 min" ou "−5 min" (sinal de menos de verdade). */
export function textoDoAtraso(minutos: number): string {
  const { situacao } = classificarAtraso(minutos)
  if (situacao === 'no_horario') return 'no horário'
  return `${situacao === 'atrasado' ? '+' : '−'}${formatarDuracaoCurta(Math.abs(minutos))}`
}

/** 17 → "17 min"; 75 → "1h15". */
export function formatarDuracaoCurta(minutos: number): string {
  return formatarDuracao(Math.round(minutos))
}

export const textoDaSituacao = (s: Situacao, nomeLocal: string | null): string => {
  switch (s) {
    case 'aguardando_saida':
      return 'Aguardando saída'
    case 'em_viagem':
      return 'Em viagem'
    case 'em_parada':
      return nomeLocal ? `Parados em ${nomeLocal}` : 'Parados'
    case 'parada_nao_planejada':
      return 'Parada não planejada'
    case 'chegamos':
      return 'Chegamos'
  }
}

/** "Google Maps, informado às 11:40" quando a previsão veio de recalibração. */
export function textoDaOrigemDaPrevisao(h: HorarioPrevisto | null | undefined): string | null {
  if (h?.origem !== 'recalibracao' || !h.recalibradoEm) return null
  return `Google Maps, informado às ${formatarHora(h.recalibradoEm)}`
}

/**
 * "Estimativa pela rota (sem trânsito)": a previsão vem só do trecho calculado pelo OSRM, sem
 * recalibração, sem relógio e sem registro. Vazio quando não é esse o caso.
 */
export function textoDaEstimativaPelaRota(h: HorarioPrevisto | null | undefined, trecho: DuracaoTrecho | null | undefined): string | null {
  return h?.origem === 'calculado' && trecho?.fonte === 'rota' ? 'Estimativa pela rota, sem trânsito' : null
}

/** Quanto falta até `previsao`: "1h05", "12 min" ou "chegando". */
export function textoDoTempoRestante(previsao: Instante, agora: Instante): string {
  const falta = diferencaMin(previsao, agora)
  return falta <= 0 ? 'chegando' : formatarDuracaoCurta(falta)
}

export const textoDoCronometro = (c: { faltaMin: number; excedeuMin: number }): string =>
  c.excedeuMin > 0 ? `excedeu em ${formatarDuracaoCurta(c.excedeuMin)}` : `faltam ${formatarDuracaoCurta(c.faltaMin)}`

/** Cronômetro de uma parada planejada: "7 min para sair" ou "excedeu em 15 min". */
export const textoDoCronometroDeSaida = (c: { faltaMin: number; excedeuMin: number }): string =>
  c.excedeuMin > 0 ? `excedeu em ${formatarDuracaoCurta(c.excedeuMin)}` : `${formatarDuracaoCurta(c.faltaMin)} para sair`

/** "N alternativas · ver no Roteiro" (ou "1 alternativa"). */
export const textoDoAtalhoDeAlternativas = (n: number): string => `${n} ${n === 1 ? 'alternativa' : 'alternativas'} · ver no Roteiro`

/** Título do cartão de passageiros: "Esperados na saída", "A bordo" ou, com a viagem encerrada, "Chegaram". */
export function tituloDoABordo(a: ABordo | null): string {
  return a?.tipo === 'esperados' ? 'Esperados na saída' : a?.tipo === 'chegaram' ? 'Chegaram' : 'A bordo'
}

/** "38/38 a bordo · conferido às 06:30", "38/38 a bordo · sem conferência", "35 esperados na saída" ou, encerrada, "38 passageiros". */
export function textoABordo(a: ABordo): string {
  if (a.tipo === 'chegaram') return `${a.total} ${a.total === 1 ? 'passageiro' : 'passageiros'}`
  if (a.tipo === 'esperados') return `${a.total} esperados na saída`
  return `${a.total}/${a.total} a bordo · ${a.conferidoEm ? `conferido às ${formatarHora(a.conferidoEm)}` : 'sem conferência'}`
}

// ---------- Timeline ----------

export interface ItemTimeline {
  id: string
  horario: Instante
  titulo: string
  detalhe: string | null
  /** Só em chegada e saída. */
  atraso: number | null
  /** Só chegada, saída e observação podem ser corrigidas. */
  corrigivel: boolean
  riscado: boolean
}

function nomeCompleto(etapa: Etapa | undefined, locais: readonly Local[], localId: string | null): string {
  if (!etapa) return 'etapa'
  const local = locais.find((l) => l.id === localId)?.nome
  const categoria = etapa.categoria ? rotuloDe(CATEGORIAS, etapa.categoria) : null
  switch (etapa.tipo) {
    case 'origem':
      return local ? `Origem (${local})` : 'Origem'
    case 'destino':
      return local ? `Destino (${local})` : 'Destino'
    case 'obrigatoria':
      return local ?? 'Ponto obrigatório'
    case 'flexivel':
      return categoria && local ? `${categoria} (${local})` : (categoria ?? local ?? 'Parada')
  }
}

/** Nome da etapa com o local em uso: o trocado mais recente, senão o preferido. */
export function nomeDaEtapaEmUso(etapa: Etapa | undefined, locais: readonly Local[], eventos: readonly Evento[]): string {
  const troca = ordenarPor(
    emOrdemDeGravacao(eventos.filter((e) => e.tipo === 'troca_local' && e.etapaId === etapa?.id)),
    (e) => e.horarioFato,
  ).at(-1)
  const localId = troca?.tipo === 'troca_local' ? troca.dados.localId : (etapa?.localId ?? null)
  return nomeCompleto(etapa, locais, localId)
}

export function montarTimeline(
  plano: DadosPlano,
  original: PlanoOriginal,
  eventos: readonly Evento[],
  agora: Instante,
  /** Para mostrar nomes. Eles ficam só no celular: a mensagem da fase 7 nunca os leva. */
  passageiros: readonly Passageiro[] = [],
): ItemTimeline[] {
  void agora
  const { etapas, locais } = plano
  const nomeDe = (id: string) => passageiros.find((p) => p.id === id)?.nome ?? 'Passageiro'
  const etapaDe = (id: string) => etapas.find((e) => e.id === id)
  const nome = (id: string) => nomeDaEtapaEmUso(etapaDe(id), locais, eventos)
  const porSequencia = [...eventos].sort((a, b) => (a.sequencia ?? 0) - (b.sequencia ?? 0))

  return ordenarPor(porSequencia, (e) => e.horarioFato).map((e): ItemTimeline => {
    const item = { id: e.id, horario: e.horarioFato, detalhe: e.observacao ?? null, atraso: null, corrigivel: false, riscado: false }
    switch (e.tipo) {
      case 'inicio':
        return { ...item, titulo: 'Viagem iniciada' }
      case 'fim':
        return { ...item, titulo: 'Viagem encerrada' }
      case 'chegada':
      case 'saida': {
        const orig = original.etapas.find((o) => o.etapaId === e.etapaId)?.[e.tipo === 'chegada' ? 'chegada' : 'saida']
        return {
          ...item,
          titulo: `${e.tipo === 'chegada' ? 'Chegamos em' : 'Saímos de'} ${nome(e.etapaId)}`,
          atraso: orig ? atrasoMin(e.horarioFato, orig) : null,
          corrigivel: true,
        }
      }
      case 'pular_etapa':
        return { ...item, titulo: `Pulamos ${nome(e.etapaId)}`, riscado: true }
      case 'recalibracao':
        return { ...item, titulo: `Previsão atualizada para ${formatarHora(e.dados.horario)}`, detalhe: `Google Maps · ${nome(e.etapaId)}` }
      case 'troca_local': {
        const novo = locais.find((l) => l.id === e.dados.localId)?.nome ?? 'outro local'
        return { ...item, titulo: `Trocamos o local para ${novo}`, detalhe: nome(e.etapaId) }
      }
      case 'parada_nao_planejada':
        if (e.dados.fase === 'fim') return { ...item, titulo: 'VOLTAMOS para a estrada' }
        if (e.dados.fase === 'previsao') {
          const partes = [e.dados.onde, e.dados.tempoPrevistoMin !== undefined ? `previsto ${formatarDuracaoCurta(e.dados.tempoPrevistoMin)}` : null]
          return { ...item, titulo: 'Parada ajustada', detalhe: partes.filter(Boolean).join(' · ') || 'Sem lugar nem tempo previsto' }
        }
        return {
          ...item,
          titulo: 'PARAMOS',
          detalhe:
            [
              e.dados.motivo ? rotuloDe(MOTIVOS_DE_PARADA, e.dados.motivo) : null,
              e.dados.onde ?? null,
              e.dados.tempoPrevistoMin !== undefined ? `previsto ${formatarDuracaoCurta(e.dados.tempoPrevistoMin)}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || null,
        }
      case 'imprevisto': {
        const tipo = rotuloDe(TIPOS_DE_IMPREVISTO, e.dados.categoria)
        return { ...item, titulo: `Imprevisto: ${tipo.toLowerCase()}`, detalhe: e.observacao ?? null }
      }
      case 'conferencia':
        return {
          ...item,
          titulo: e.dados.momento === 'volta' ? 'Conferência ao voltar à estrada' : `Conferência na saída de ${nome(e.etapaId)}`,
          detalhe: detalheDaConferencia(e.dados, nomeDe),
        }
      case 'desceram':
        return {
          ...item,
          titulo: `${e.dados.passageiroIds.length === 1 ? 'Desceu 1 passageiro' : `Desceram ${e.dados.passageiroIds.length} passageiros`} ${e.dados.local === 'etapa' ? `na parada de ${nome(e.etapaId)}` : 'na parada não planejada'}`,
          detalhe: e.dados.passageiroIds.length > 0 ? textoDeQuemFalta(e.dados.passageiroIds.map(nomeDe)) : null,
        }
      case 'status_passageiro':
        return { ...item, titulo: `${nomeDe(e.dados.passageiroId)}: ${STATUS_DE_PASSAGEIRO[e.dados.status]}`, detalhe: e.dados.motivo }
      case 'atualizacao_gerada': {
        const { previsaoDestino, atrasoMin: atraso } = e.dados
        const previsao = previsaoDestino ? ` · previsão ${rotuloHorario(previsaoDestino, e.horarioFato)}` : ''
        const quanto = previsaoDestino && atraso !== null ? ` (${textoDoAtraso(atraso)})` : ''
        return { ...item, titulo: `Atualização gerada${previsao}${quanto}` }
      }
      case 'observacao':
        return { ...item, titulo: 'Observação', detalhe: e.dados.texto, corrigivel: true }
    }
  })
}

/** "37/38 a bordo · Falta: Fulano" ou "38/38 a bordo (completa por contagem)". */
function detalheDaConferencia(c: Conferencia, nomeDe: (id: string) => string): string {
  const total = c.confirmados.length + c.pendentes.length
  const base = `${c.confirmados.length}/${total} a bordo`
  if (c.pendentes.length > 0) return `${base} · Falta: ${c.pendentes.map(nomeDe).join(', ')}`
  return c.resultado === 'completa_por_contagem' ? `${base} (completa por contagem)` : base
}
