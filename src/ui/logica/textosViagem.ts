// Textos da tela principal e da timeline. Nenhuma conta de horário: tudo vem do núcleo.

import { atrasoMin, classificarAtraso } from '../../core/atraso'
import type { Situacao } from '../../core/registro'
import { diferencaMin, ordenarPor } from '../../core/tempo'
import type { DadosPlano, Etapa, Evento, HorarioPrevisto, Instante, Local, PlanoOriginal } from '../../core/tipos'
import { formatarDuracao } from './duracao'
import { formatarHora } from './horarios'
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

/** Quanto falta até `previsao`: "1h05", "12 min" ou "chegando". */
export function textoDoTempoRestante(previsao: Instante, agora: Instante): string {
  const falta = diferencaMin(previsao, agora)
  return falta <= 0 ? 'chegando' : formatarDuracaoCurta(falta)
}

export const textoDoCronometro = (c: { faltaMin: number; excedeuMin: number }): string =>
  c.excedeuMin > 0 ? `excedeu em ${formatarDuracaoCurta(c.excedeuMin)}` : `faltam ${formatarDuracaoCurta(c.faltaMin)}`

// ---------- Timeline ----------

export interface ItemTimeline {
  id: string
  horario: Instante
  titulo: string
  detalhe: string | null
  /** Só em chegada e saída. */
  atraso: number | null
  /** Só chegada e saída podem ser corrigidas. */
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
    eventos.filter((e) => e.tipo === 'troca_local' && e.etapaId === etapa?.id),
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
): ItemTimeline[] {
  void agora
  const { etapas, locais } = plano
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
        return e.dados.fase === 'inicio'
          ? { ...item, titulo: 'PARAMOS', detalhe: e.dados.motivo ? rotuloDe(MOTIVOS_DE_PARADA, e.dados.motivo) : null }
          : { ...item, titulo: 'VOLTAMOS para a estrada' }
      case 'imprevisto': {
        const tipo = rotuloDe(TIPOS_DE_IMPREVISTO, e.dados.categoria)
        return { ...item, titulo: `Imprevisto: ${tipo.toLowerCase()}`, detalhe: e.observacao ?? null }
      }
      case 'conferencia':
        return { ...item, titulo: 'Conferência de passageiros', detalhe: null }
      case 'status_passageiro':
        // Sem nome: a lista de passageiros chega na fase 5.
        return { ...item, titulo: `Passageiro: ${STATUS_DE_PASSAGEIRO[e.dados.status]}`, detalhe: e.dados.motivo }
    }
  })
}
