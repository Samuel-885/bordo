// Textos da tela de alternativas. As regras (classe, margem, impacto, validação) vêm do núcleo.

import type { Instante } from '../../core/tipos'
import type { AvisoAlternativa, ClasseAlternativa } from '../../core/viabilidade'
import { formatarDuracao } from './duracao'
import { formatarHora } from './horarios'

const CLASSES: Record<ClasseAlternativa, string> = {
  viavel: 'Viável',
  pouca_margem: 'Pouca margem',
  inviavel: 'Inviável',
  sem_horario: 'Sem horário',
  sem_tempo: 'Sem tempo',
}

export const rotuloDaClasse = (classe: ClasseAlternativa): string => CLASSES[classe]

const AVISOS: Record<AvisoAlternativa, string> = {
  fora_da_janela: 'Fora da janela',
  onibus_nao_para: 'Ônibus não para',
  onibus_para_nao_sei: 'Não sei se o ônibus para',
  evitar: 'Evitar',
  favorito: 'Favorito',
}

export const textoDoAvisoDaAlternativa = (a: AvisoAlternativa): string => AVISOS[a]

/** "+20 min", "−5 min" (com o sinal de menos tipográfico), "sem mudança". */
export function textoDoImpacto(min: number): string {
  if (min === 0) return 'sem mudança'
  return `${min > 0 ? '+' : '−'}${formatarDuracao(Math.abs(min))}`
}

/** "25 min de margem" ou, se a permanência não cabe, "faltam 5 min". */
export function textoDaMargem(min: number): string {
  return min >= 0 ? `${formatarDuracao(min)} de margem` : `faltam ${formatarDuracao(-min)}`
}

/** Link `tel:` só com dígitos (e o + inicial). Sem dígitos, não há link. */
export function linkTelefone(telefone: string | undefined): string | null {
  if (!telefone) return null
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length === 0) return null
  return `tel:${telefone.trim().startsWith('+') ? '+' : ''}${digitos}`
}

/** "agora", "há 8 min", "há 1h05". */
export function textoIdade(min: number): string {
  if (min <= 0) return 'agora'
  return `há ${formatarDuracao(min)}`
}

/** Origem da previsão de uma alternativa consultada ao Google Maps. */
export function textoDaConsulta(c: { consultadoEm: Instante; idadeMin: number; situacao: 'vigente' | 'antiga' }): string {
  const quando = `informado às ${formatarHora(c.consultadoEm)} · ${textoIdade(c.idadeMin)}`
  return c.situacao === 'vigente' ? `Google Maps, ${quando}` : `Consulta antiga (${quando}): não está valendo`
}

/**
 * Aviso de confirmação ao trocar de local com uma recalibração vigente: de onde veio a previsão
 * (Google Maps ou localização) e o que acontece com ela.
 */
export function textoDaPrevisaoSubstituida(
  chegada: { recalibradoEm?: Instante; pelaLocalizacaoEm?: Instante; automatica?: true },
  consultada: boolean,
): string {
  const quem = chegada.pelaLocalizacaoEm
    ? `A previsão pela sua localização, ${chegada.automatica ? 'atualizada' : 'calculada'} às ${formatarHora(chegada.pelaLocalizacaoEm)},`
    : `A previsão do Google Maps${chegada.recalibradoEm ? ` informada às ${formatarHora(chegada.recalibradoEm)}` : ''}`
  return `${quem} ${consultada ? 'é substituída pela consulta' : 'deixa de valer: a previsão volta a ser calculada pelo trecho'}.`
}
